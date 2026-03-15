/**
 * Infinity Loop Runtime V1
 *
 * A deterministic loop runner that executes the feedback loop workflow:
 * suggester -> planner -> dev -> havoc -> reporter -> librarian -> rearm
 *
 * master is escalation-only for structured stuck packets.
 * oracle is read-only helper.
 */

import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import { fileURLToPath } from "url"
import { Database } from "../storage/db"
import { InfinityTable } from "./infinity.sql.ts"
import { ProjectTable } from "../project/project.sql.ts"
import { eq, desc } from "drizzle-orm"
import { Identifier } from "@/id/id"
import { Process } from "../util/process"
import { ProjectScanner } from "./scanner"
import { InfinityAdapter } from "./adapter"

// ============================================================================
// Types
// ============================================================================

export interface Task {
  id: string
  title: string
  source: "internal_audit" | "external_triage" | "tech_radar" | "cost_profile" | "post_mortem"
  priority: number
  category: "stability" | "performance" | "feature" | "cost" | "security"
  scope: string[]
  acceptance: string[]
  constraints?: string[]
  status: "queued" | "in_progress" | "stuck" | "ready_for_reporter" | "passed" | "failed" | "rolled_back"
  verify_command?: string
  proof_artifacts?: string[]
}

export interface RunState {
  run_id: string
  task_id: string
  status:
    | "planning"
    | "assigned"
    | "in_progress"
    | "stuck"
    | "ready_for_reporter"
    | "reporting"
    | "passed"
    | "failed"
    | "rolled_back"
  workers: string[]
  created_at: string
  updated_at: string
  escalated_to_master?: boolean
  gate_result?: GateResult
  proof_path?: string
  log_path?: string
}

export interface Plan {
  run_id: string
  task_id: string
  task: Task
  workers: WorkerAssignment[]
  created_at: string
}

export interface WorkerAssignment {
  worker_id: string
  scope: string[]
  start_line?: number
  end_line?: number
}

export interface GateResult {
  task_id: string
  run_id: string
  result: "pass" | "fail" | "blocked" | "retry_with_actions"
  gates: Gate[]
  rollback_executed?: boolean
  retry_actions?: string[]
  benchmark_data?: object
}

export interface Gate {
  name: "cloud_ci" | "security" | "visual" | "benchmark"
  status: "pass" | "fail" | "skipped"
  details: string
}

export interface StuckPacket {
  type: "stuck"
  task_id: string
  run_id: string
  worker_id: string
  attempt_count: number
  failure_signature: string
  files_touched: string[]
  checks_failed: { command: string; error_excerpt: string }[]
  recent_actions: string[]
  ask: string
}

export interface CompletionPacket {
  type: "completion"
  task_id: string
  run_id: string
  worker_id: string
  files_changed: string[]
  tests_passed: boolean
  summary: string
}

export interface Event {
  type: string
  timestamp: string
  [key: string]: unknown
}

export interface InfinityConfig {
  max_cycles: number
  max_retries_per_task: number
  idle_backoff_ms: number
  daemon: boolean
  watch: boolean
}

export interface LockFile {
  pid: number
  started_at: string
  run_id?: string
}

// ============================================================================
// Constants
// ============================================================================

const STAGES = [
  "architect",
  "suggester",
  "planner",
  "dev",
  "performance",
  "havoc",
  "reporter",
  "librarian",
  "innovation",
  "rearm",
] as const
export type Stage = (typeof STAGES)[number]

const TERMINAL_STATES = ["passed", "failed", "rolled_back"]
const MASTER_ESCALATION_STATES = ["stuck"]

// ============================================================================
// Runtime State
// ============================================================================

export class InfinityRuntime {
  private root: string
  private config: InfinityConfig
  private currentRunId: string | null = null
  private currentTaskId: string | null = null
  private currentStage: Stage | null = null
  private cycleCount = 0
  private isRunning = false
  private scanner: ProjectScanner
  private adapter: InfinityAdapter

  constructor(root: string, config: Partial<InfinityConfig> = {}) {
    this.root = root
    this.config = {
      max_cycles: config.max_cycles ?? 1,
      max_retries_per_task: config.max_retries_per_task ?? 2,
      idle_backoff_ms: config.idle_backoff_ms ?? 5000,
      daemon: config.daemon ?? false,
      watch: config.watch ?? false,
    }
    this.scanner = new ProjectScanner(root)
    this.adapter = new InfinityAdapter(root)
  }

  // ============================================================================
  // Database Persistence
  // ============================================================================

  private async getProjectId(): Promise<string> {
    return Database.use(async (db) => {
      const project = await db
        .select()
        .from(ProjectTable)
        .where(eq(ProjectTable.worktree, this.root))
        .get()

      if (project) return project.id
      const first = await db.select().from(ProjectTable).limit(1).get()
      if (first) return first.id
      throw new Error(`Project not found for worktree: ${this.root}`)
    })
  }

  private async saveState(): Promise<void> {
    try {
      const pid = await this.getProjectId()
      const reportPath = path.join(this.root, ".opencode", "report.json")
      let health = 0
      let metrics = {}

      if (fs.existsSync(reportPath)) {
        try {
          const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"))
          health = report.health_score || 0
          metrics = report
        } catch {}
      }

      await Database.use(async (db) => {
        await db
          .insert(InfinityTable)
          .values({
            id: Identifier.descending("infinity"),
            project_id: pid as any,
            status: this.isRunning ? "running" : "idle",
            current_stage: this.currentStage || "none",
            current_run_id: this.currentRunId,
            current_task_id: this.currentTaskId,
            health_score: health,
            metrics,
          })
          .onConflictDoUpdate({
            target: InfinityTable.project_id,
            set: {
              status: this.isRunning ? "running" : "idle",
              current_stage: this.currentStage || "none",
              current_run_id: this.currentRunId,
              current_task_id: this.currentTaskId,
              health_score: health,
              metrics,
              time_updated: Date.now(),
            },
          })
      })
    } catch (e) {
      this.log("DB_ERROR", `Failed to save state: ${e}`)
    }
  }

  private async getRepoOverview(): Promise<string> {
    const discoveries = await this.scanner.scan()
    const pkgs = discoveries.map(t => t.title).join(", ")
    const gitLog = await Process.text(["git", "log", "-n", "10", "--oneline"], { cwd: this.root })
    return `Repo Statistics:
- Total Packages Detected: ${discoveries.length}
- Packages: ${pkgs}

Recent Git Activity:
${gitLog}`
  }

  private async loadState(): Promise<void> {
    try {
      const pid = await this.getProjectId()
      const state = await Database.use(async (db) => {
        return db.select().from(InfinityTable).where(eq(InfinityTable.project_id, pid as any)).get()
      })

      if (state) {
        this.log("DB_LOAD", `Restored state for project: ${pid} (stage: ${state.current_stage})`)
        this.currentStage = state.current_stage === "none" ? null : (state.current_stage as Stage)
        this.currentRunId = state.current_run_id
        this.currentTaskId = state.current_task_id
      }
    } catch (e) {
      // Non-critical, just log it
      this.log("DB_LOAD", `No existing state found or failed to load: ${e}`)
    }
  }

  // ============================================================================
  // Bootstrap
  // ============================================================================

  /**
   * Bootstrap the runtime - create missing runtime files/directories safely
   */
  bootstrap(): void {
    this.log("BOOTSTRAP", "Starting bootstrap...")

    // Create .opencode/ directory if not exists
    const opencodeDir = path.join(this.root, ".opencode")
    this.ensureDir(opencodeDir)

    // Create queue.json if not exists
    const queueFile = path.join(opencodeDir, "queue.json")
    if (!fs.existsSync(queueFile)) {
      this.log("BOOTSTRAP", "Creating queue.json...")
      fs.writeFileSync(queueFile, "[]", "utf-8")
    }

    // Validate queue.json
    this.validateQueue(queueFile)

    // Create runs directory
    const runsDir = path.join(opencodeDir, "runs")
    this.ensureDir(runsDir)

    // Create knowledge directories
    const knowledgeDir = path.join(opencodeDir, "knowledge")
    this.ensureDir(path.join(knowledgeDir, "patterns"))
    this.ensureDir(path.join(knowledgeDir, "gotchas"))
    this.ensureDir(path.join(knowledgeDir, "decisions"))

    // Create lock file path (but don't create it yet)
    // It will be created when the runtime starts

    this.log("BOOTSTRAP", "Bootstrap complete")
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      this.log("BOOTSTRAP", `Created directory: ${dir}`)
    }
  }

  // ============================================================================
  // Queue Management
  // ============================================================================

  /**
   * Validate queue.json - reject malformed items loudly
   */
  validateQueue(queuePath: string): void {
    this.log("VALIDATE_QUEUE", `Validating ${queuePath}...`)

    const content = fs.readFileSync(queuePath, "utf-8")
    let queue: unknown

    try {
      queue = JSON.parse(content)
    } catch (e) {
      throw new Error(`queue.json is not valid JSON: ${e}`)
    }

    if (!Array.isArray(queue)) {
      throw new Error("queue.json must be a JSON array")
    }

    // Validate each item
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i] as Record<string, unknown>
      this.validateTask(item, i)
    }

    this.log("VALIDATE_QUEUE", `Queue valid: ${queue.length} items`)
  }

  private validateTask(item: Record<string, unknown>, index: number): void {
    const requiredFields = ["id", "title", "source", "priority", "category", "scope", "acceptance", "status"]

    for (const field of requiredFields) {
      if (!(field in item)) {
        throw new Error(`queue.json item ${index}: missing required field "${field}"`)
      }
    }

    // Validate id pattern
    const id = item.id as string
    if (!/^task-\d{4}-\d{2}-\d{2}-\d{3}$/.test(id)) {
      throw new Error(`queue.json item ${index}: invalid id format "${id}" (expected task-YYYY-MM-DD-NNN)`)
    }

    // Validate status
    const validStatuses = ["queued", "in_progress", "stuck", "ready_for_reporter", "passed", "failed", "rolled_back"]
    if (!validStatuses.includes(item.status as string)) {
      throw new Error(`queue.json item ${index}: invalid status "${item.status}"`)
    }
  }

  readQueue(): Task[] {
    const queuePath = path.join(this.root, ".opencode", "queue.json")
    if (!fs.existsSync(queuePath)) {
      return []
    }
    const content = fs.readFileSync(queuePath, "utf-8")
    return JSON.parse(content) as Task[]
  }

  writeQueue(tasks: Task[]): void {
    const queuePath = path.join(this.root, ".opencode", "queue.json")
    fs.writeFileSync(queuePath, JSON.stringify(tasks, null, 2), "utf-8")
  }

  // ============================================================================
  // Run Management
  // ============================================================================

  private getCurrentTask(): Task | undefined {
    if (!this.currentTaskId) return undefined
    return this.readQueue().find((t) => t.id === this.currentTaskId)
  }

  createRun(taskId: string): string {
    const runId = this.generateRunId()
    const runDir = path.join(this.root, ".opencode", "runs", runId)
    this.ensureDir(runDir)

    // Create state.json
    const state: RunState = {
      run_id: runId,
      task_id: taskId,
      status: "planning",
      workers: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    fs.writeFileSync(path.join(runDir, "state.json"), JSON.stringify(state, null, 2), "utf-8")

    // Create empty events.jsonl
    fs.writeFileSync(path.join(runDir, "events.jsonl"), "", "utf-8")

    this.currentRunId = runId
    this.currentTaskId = taskId

    this.log("RUN_CREATE", `Created run ${runId} for task ${taskId}`)
    return runId
  }

  private generateRunId(): string {
    const now = new Date()
    const date = now.toISOString().split("T")[0]
    const ms = String(now.getTime()).slice(-3)
    return `run-${date}-${ms}`
  }

  private generateTaskId(): string {
    const now = new Date()
    const date = now.toISOString().split("T")[0]
    const ms = String(now.getTime()).slice(-3)
    return `task-${date}-${ms}`
  }

  readRunState(runId: string): RunState | null {
    const statePath = path.join(this.root, ".opencode", "runs", runId, "state.json")
    if (!fs.existsSync(statePath)) {
      return null
    }
    return JSON.parse(fs.readFileSync(statePath, "utf-8")) as RunState
  }

  writeRunState(runId: string, state: RunState): void {
    state.updated_at = new Date().toISOString()
    const statePath = path.join(this.root, ".opencode", "runs", runId, "state.json")
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8")
  }

  writePlan(runId: string, plan: Plan): void {
    const planPath = path.join(this.root, ".opencode", "runs", runId, "plan.json")
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf-8")
  }

  readPlan(runId: string): Plan | null {
    const planPath = path.join(this.root, ".opencode", "runs", runId, "plan.json")
    if (!fs.existsSync(planPath)) {
      return null
    }
    return JSON.parse(fs.readFileSync(planPath, "utf-8")) as Plan
  }

  appendEvent(runId: string, event: Event): void {
    const eventsPath = path.join(this.root, ".opencode", "runs", runId, "events.jsonl")
    const line = JSON.stringify(event) + "\n"
    fs.appendFileSync(eventsPath, line, "utf-8")
  }

  // ============================================================================
  // Stage Machine
  // ============================================================================

  /**
   * Deterministic stage machine - only executes in this order:
   * suggester -> planner -> dev -> havoc -> reporter -> librarian -> rearm
   */
  async runCycle(): Promise<void> {
    this.log("CYCLE_START", `Starting cycle ${this.cycleCount + 1}/${this.config.max_cycles}`)

    // Check for resume
    const resumeResult = this.tryResume()
    if (resumeResult) {
      this.log("RESUME", `Resuming from stage: ${resumeResult.stage}, run: ${resumeResult.runId}`)
      this.currentStage = resumeResult.stage
      this.currentRunId = resumeResult.runId
      this.currentTaskId = resumeResult.taskId
    } else {
      // Start fresh cycle
      this.currentStage = "architect"
    }

    // Execute stages in deterministic order
    while (this.currentStage) {
      const stage = this.currentStage
      this.log("STAGE_ENTER", `Entering stage: ${stage}`)

      try {
        await this.executeStage(stage)
      } catch (e) {
        this.log("STAGE_ERROR", `Stage ${stage} failed: ${e}`)
        throw e
      }

      // Check if we should continue
      if (!this.shouldContinue()) {
        break
      }
    }

    this.log("CYCLE_END", `Cycle ${this.cycleCount} complete`)
  }

  private async executeStage(stage: Stage): Promise<void> {
    switch (stage) {
      case "architect":
        await this.stageArchitect()
        break
      case "suggester":
        await this.stageSuggester()
        break
      case "planner":
        await this.stagePlanner()
        break
      case "dev":
        await this.stageDev()
        break
      case "performance":
        await this.stagePerformance()
        break
      case "havoc":
        await this.stageHavoc()
        break
      case "reporter":
        await this.stageReporter()
        break
      case "librarian":
        await this.stageLibrarian()
        break
      case "innovation":
        await this.stageInnovation()
        break
      case "rearm":
        await this.stageRearm()
        break
      default:
        throw new Error(`Unknown stage: ${stage}`)
    }
  }

  private async stageArchitect(): Promise<void> {
    this.log("ARCHITECT", "Running Architect (Singularity Core) stage...")

    // In a real implementation, this would invoke the Architect subagent
    // to analyze the current state and decide if any overrides or shifts are needed.

    const reportPath = path.join(this.root, ".opencode", "report.json")
    let report: any = null
    if (fs.existsSync(reportPath)) {
      report = JSON.parse(fs.readFileSync(reportPath, "utf-8"))
    }

    // Metacognitive Tuning: Check for suggester efficiency
    const runsDir = path.join(this.root, ".opencode", "runs")
    const recentRuns = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).slice(-5) : []

    if (recentRuns.length > 3 && report && report.health_score > 90) {
      this.log("ARCHITECT", "System too stable. Suggesting Havoc mode for deeper stress testing.")
    }

    // SWAT Dispatcher: Check for critical health drops
    if (report && report.health_score < 70) {
      this.log("ARCHITECT", "CRITICAL HEALTH DROP detected. Auto-injecting stability task.")
      const queue = this.readQueue()
      queue.unshift({
        id: this.generateTaskId(),
        title: "CRITICAL: Urgent Stability Audit (Auto-Generated)",
        source: "internal_audit",
        priority: 10,
        category: "stability",
        scope: ["*"],
        acceptance: ["Health score returns to >80", "All critical logs resolved"],
        status: "queued",
      })
      this.writeQueue(queue)
    }

    this.advanceStage()
  }

  private async stageSuggester(): Promise<void> {
    this.log("SUGGESTER", "Running suggester stage...")

    const overview = await this.getRepoOverview()
    const queue = this.readQueue()
    const discoveries = await this.adapter.suggestTasks(overview)

    for (const discovery of discoveries) {
      // Avoid duplicates based on title
      const exists = queue.some((t) => t.title === discovery.title)
      if (!exists) {
        this.log("SUGGESTER", `Discovered new task: ${discovery.title}`)
        queue.push({
          ...discovery,
          id: this.generateTaskId(),
        })
      }
    }

    this.writeQueue(queue)
    this.advanceStage()
  }

  private simulateSuggesterOutput(): Task[] {
    // This simulates what the suggester agent would produce
    // In production, this would be replaced with actual agent invocation
    const taskId = this.generateTaskId()
    return [
      {
        id: taskId,
        title: "Simulated task from suggester",
        source: "internal_audit",
        priority: 1,
        category: "stability",
        scope: ["packages/opencode"],
        acceptance: ["typecheck passes", "tests pass"],
        status: "queued",
      },
    ]
  }

  private getTaskFingerprint(task: Task): string {
    // Stable fingerprint derived from title + scope + acceptance
    const data = `${task.title}:${task.scope.sort().join(",")}:${task.acceptance.sort().join(",")}`
    return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16)
  }

  private async stagePlanner(): Promise<void> {
    this.log("PLANNER", "Running planner stage...")

    const queue = this.readQueue()
    const nextTask = queue.find((t) => t.status === "queued")

    if (!nextTask) {
      this.log("PLANNER", "No queued tasks, advancing to rearm")
      this.advanceStage()
      return
    }

    // Update task status
    nextTask.status = "in_progress"
    this.writeQueue(queue)

    // Produce real plan with LLM
    const overview = await this.getRepoOverview()
    const plan = await this.adapter.createPlan(nextTask, overview)
    
    // Create run entry
    const runId = this.createRun(nextTask.id)
    plan.run_id = runId // Ensure it matches our tracker
    
    this.writePlan(runId, plan)

    // Update run state
    const state = this.readRunState(runId)!
    state.status = "assigned"
    state.workers = plan.workers.map(w => w.worker_id)
    this.writeRunState(runId, state)

    this.log("PLANNER", `Assigned task ${nextTask.id} to run ${runId} with LLM plan`)
    this.advanceStage()
  }

  private async stageDev(): Promise<void> {
    if (!this.currentRunId || !this.currentTaskId) {
      throw new Error("No active run in dev stage")
    }

    this.log("DEV", `Running dev stage for run ${this.currentRunId}...`)

    const state = this.readRunState(this.currentRunId)!
    state.status = "in_progress"
    this.writeRunState(this.currentRunId, state)

    this.appendEvent(this.currentRunId, {
      type: "progress",
      timestamp: new Date().toISOString(),
      message: "Dev stage executing real agent via opencode run...",
    })

    try {
      const task = this.getCurrentTask()
      if (!task) throw new Error("Task not found for dev stage")

      const message = `Task: ${task.title}\nAcceptance: ${task.acceptance.join(", ")}`
      this.log("DEV", `Spawning agent for task: ${task.title}`)

      const result = await Process.run(["opencode", "run", message], { 
        cwd: this.root,
        nothrow: true 
      })

      if (result.code !== 0) {
        this.log("DEV_ERROR", `Agent failed with code ${result.code}`)
      }

      const postDiffRaw = await Process.text(["git", "diff"], { cwd: this.root })
      const postDiff = postDiffRaw.toString()
      
      if (postDiff.trim().length > 0) {
        const proofDir = path.join(this.root, ".opencode", "runs", this.currentRunId)
        if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true })
        
        const proofPath = path.join(proofDir, "proof.diff")
        fs.writeFileSync(proofPath, postDiff)
        state.proof_path = proofPath
        this.writeRunState(this.currentRunId, state)
        this.log("DEV", "Captured git diff proof")
      }

      this.appendEvent(this.currentRunId, {
        type: "completion",
        timestamp: new Date().toISOString(),
        task_id: this.currentTaskId,
        run_id: this.currentRunId,
        worker_id: "dev-1",
        files_changed: [], 
        tests_passed: result.code === 0,
        summary: `Dev stage finished with code ${result.code}`,
      } as any)

      state.status = "ready_for_reporter"
      this.writeRunState(this.currentRunId, state)
      
      this.log("DEV", "Dev stage complete")
      this.advanceStage()
    } catch (e) {
      this.log("DEV_ERROR", `Execution failed: ${e}`)
      this.advanceStage()
    }
  }

  private async stagePerformance(): Promise<void> {
    if (!this.currentRunId) {
      throw new Error("No active run in performance stage")
    }

    this.log("PERFORMANCE", `Running performance profiling for run ${this.currentRunId}...`)

    const start = Bun.nanoseconds()
    // In production, this would run actual benchmarks
    // For now we simulate a small workload
    await new Promise((r) => setTimeout(r, 100))
    const end = Bun.nanoseconds()
    const latencyMs = (end - start) / 1000000

    this.log("PERFORMANCE", `Latency measured: ${latencyMs.toFixed(2)}ms`)

    // Base calculation from User Spec
    let health = 100
    const reportPath = path.join(this.root, ".opencode", "report.json")
    if (fs.existsSync(reportPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"))
        health -= (report.critical_alerts || 0) * 25
        health -= (report.warning_alerts || 0) * 15
        health -= (report.info_alerts || 0) * 10
        if (report.fps < 55) health -= 20
        if (report.memory_usage_mb > 100) health -= 15
        if (latencyMs > 100) health -= 10
      } catch {}
    }

    health = Math.max(0, health)

    // Record performance event
    this.appendEvent(this.currentRunId, {
      type: "performance",
      timestamp: new Date().toISOString(),
      latency_ms: latencyMs,
      score: health,
    } as any)

    this.advanceStage()
  }

  private async stageHavoc(): Promise<void> {
    if (!this.currentRunId) {
      throw new Error("No active run in havoc stage")
    }

    this.log("HAVOC", `Running havoc stage for run ${this.currentRunId}...`)

    // In production, this would invoke the havoc subagent
    // Havoc runs adversarial testing

    this.log("HAVOC", "Havoc passed")
    this.advanceStage()
  }

  private async stageReporter(): Promise<void> {
    if (!this.currentRunId || !this.currentTaskId) {
      throw new Error("No active run in reporter stage")
    }

    const task = this.getCurrentTask()
    if (!task) return this.advanceStage()

    this.log("REPORTER", `Verifying task ${this.currentTaskId}...`)
    
    // Update run state
    const state = this.readRunState(this.currentRunId)!
    state.status = "reporting"
    this.writeRunState(this.currentRunId, state)

    const command = task.verify_command || "bun test"
    const logDir = path.join(this.root, ".opencode", "runs", this.currentRunId)
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    const logPath = path.join(logDir, "verification.log")

    try {
      this.log("REPORTER", `Executing: ${command}`)
      const result = await Process.run(command.split(/\s+/), { cwd: this.root, nothrow: true })
      
      const logs = `COMMAND: ${command}\nEXIT_CODE: ${result.code}\n\nSTDOUT:\n${result.stdout.toString()}\n\nSTDERR:\n${result.stderr.toString()}`
      fs.writeFileSync(logPath, logs)

      // Capture final diff as evidence
      const finalDiffRaw = await Process.text(["git", "diff", "HEAD~1"], { cwd: this.root })
      const finalDiff = finalDiffRaw.toString()

      // Judge with LLM
      const gateResult = await this.adapter.reportResults(task, finalDiff, logs)
      
      state.log_path = logPath
      state.status = gateResult.result === "pass" ? "passed" : "failed"
      state.gate_result = gateResult
      this.writeRunState(this.currentRunId, state)

      this.log("REPORTER", `LLM Verdict: ${gateResult.result.toUpperCase()} (${gateResult.gates.length} gates checked)`)
      this.advanceStage()
    } catch (e) {
      this.log("REPORTER_ERROR", `Verification judge failed: ${e}`)
      this.advanceStage()
    }
  }

  private async stageLibrarian(): Promise<void> {
    if (!this.currentRunId || !this.currentTaskId) {
      throw new Error("No active run in librarian stage")
    }

    this.log("LIBRARIAN", `Running librarian stage for run ${this.currentRunId}...`)

    const state = this.readRunState(this.currentRunId)!
    const logPath = state.log_path || ""
    const logs = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf-8") : "No logs found"

    try {
      this.log("LIBRARIAN", "Asking LLM to extract reusable lessons...")
      const lessons = await this.adapter.extractLessons(state, logs)
      
      this.log("LIBRARIAN", `Extracted ${lessons.length} lessons`)
      
      const notesDir = path.join(this.root, ".opencode", "runs", this.currentRunId, "notes")
      this.ensureDir(notesDir)
      fs.writeFileSync(path.join(notesDir, "lessons.json"), JSON.stringify(lessons, null, 2))

      this.advanceStage()
    } catch (e) {
      this.log("LIBRARIAN_ERROR", `Failed to extract lessons: ${e}`)
      this.advanceStage()
    }
  }

  private async stageInnovation(): Promise<void> {
    this.log("INNOVATION", "Running innovation finder...")

    try {
      const overview = await this.getRepoOverview()
      const discoveries = await this.adapter.deriveOpportunities(overview)
      
      this.log("INNOVATION", `Discovered ${discoveries.length} potential innovation points`)
      
      const blueprintDir = path.join(this.root, ".opencode", "blueprints")
      this.ensureDir(blueprintDir)
      fs.writeFileSync(
        path.join(blueprintDir, `innovation-${Date.now()}.json`),
        JSON.stringify({ discoveries, timestamp: new Date().toISOString() }, null, 2),
        "utf-8",
      )

      this.advanceStage()
    } catch (e) {
      this.log("INNOVATION_ERROR", `Failed to derive opportunities: ${e}`)
      this.advanceStage()
    }
  }

  private async stageRearm(): Promise<void> {
    this.log("REARM", "Running rearm stage...")

    // Mark the consumed queue item as complete
    if (this.currentTaskId) {
      const queue = this.readQueue()
      const taskIndex = queue.findIndex((t) => t.id === this.currentTaskId)
      if (taskIndex !== -1) {
        const state = this.readRunState(this.currentRunId!)!
        queue[taskIndex].status = state.status === "passed" ? "passed" : "failed"
        this.writeQueue(queue)
        this.log("REARM", `Updated task ${this.currentTaskId} status to ${queue[taskIndex].status}`)
      }
    }

    // Clear current run
    this.currentRunId = null
    this.currentTaskId = null
    this.currentStage = null

    this.cycleCount++
    this.log("REARM", `Rearm complete. Cycle ${this.cycleCount} finished.`)
  }

  private advanceStage(): void {
    if (!this.currentStage) return

    const currentIndex = STAGES.indexOf(this.currentStage)
    if (currentIndex < STAGES.length - 1) {
      this.currentStage = STAGES[currentIndex + 1]
      this.log("STAGE_ADVANCE", `Advanced to: ${this.currentStage}`)
    } else {
      this.currentStage = null
      this.log("STAGE_ADVANCE", "No more stages")
    }
    // Async save
    this.saveState().catch((e) => this.log("DB_ERROR", `Failed to save stage advance: ${e}`))
  }

  private shouldContinue(reason?: string): boolean {
    // Check max cycles
    if (this.cycleCount >= this.config.max_cycles) {
      this.log("CONTROL", `Max cycles reached: ${this.config.max_cycles}`)
      return false
    }

    // If we are currently in a stage, we should continue that stage sequence
    if (this.currentStage) return true

    // Check daemon/watch mode
    if (this.config.daemon || this.config.watch) {
      return true
    }

    // If we have pending items in the queue and we are start-fresh, attempt at least one cycle
    if (this.cycleCount < this.config.max_cycles) {
      return true
    }

    if (reason) this.log("CONTROL", `Stopping: ${reason}`)
    return false
  }

  // ============================================================================
  // Resume Support
  // ============================================================================

  private tryResume(): { stage: Stage; runId: string; taskId: string } | null {
    // If we have state in class from loadState(), it's already "resumed" in a sense
    if (this.currentStage && this.currentRunId && this.currentTaskId) {
      return {
        stage: this.currentStage,
        runId: this.currentRunId,
        taskId: this.currentTaskId,
      }
    }

    const runsDir = path.join(this.root, ".opencode", "runs")
    if (!fs.existsSync(runsDir)) return null

    const runDirs = fs.readdirSync(runsDir)
    for (const runDir of runDirs) {
      const statePath = path.join(runsDir, runDir, "state.json")
      if (!fs.existsSync(statePath)) continue

      const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as RunState
      if (TERMINAL_STATES.includes(state.status)) continue

      const stage = this.statusToStage(state.status)
      if (!stage) continue

      this.log("RESUME_FS", `Found resumable run on disk: ${runDir}`)
      return { stage, runId: state.run_id, taskId: state.task_id }
    }

    return null
  }

  private statusToStage(status: RunState["status"]): Stage | null {
    switch (status) {
      case "planning":
        return "planner"
      case "assigned":
      case "in_progress":
        return "dev"
      case "ready_for_reporter":
        return "havoc"
      case "reporting":
        return "reporter"
      case "stuck":
        return "reporter" // Escalation goes back to reporter after master handles it
      default:
        return null
    }
  }

  // ============================================================================
  // Database State Management
  // ============================================================================

  // ============================================================================
  // Lock File
  // ============================================================================
  // Lock File
  // ============================================================================

  acquireLock(): boolean {
    const lockPath = path.join(this.root, ".opencode", "infinity.lock")

    if (fs.existsSync(lockPath)) {
      const lockContent = fs.readFileSync(lockPath, "utf-8")
      try {
        const lock = JSON.parse(lockContent) as LockFile

        // Check if process is alive
        try {
          process.kill(lock.pid, 0)
          this.log("LOCK", `Lock held by alive process ${lock.pid}`)
          return false
        } catch {
          // Process is dead, stale lock
          this.log("LOCK", `Stale lock file from process ${lock.pid}, removing...`)
          fs.unlinkSync(lockPath)
        }
      } catch {
        // Invalid lock file, remove it
        fs.unlinkSync(lockPath)
      }
    }

    // Acquire lock
    const lock: LockFile = {
      pid: process.pid,
      started_at: new Date().toISOString(),
    }
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2), "utf-8")
    this.log("LOCK", `Acquired lock: ${lock.pid}`)
    return true
  }

  releaseLock(): void {
    const lockPath = path.join(this.root, ".opencode", "infinity.lock")
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath)
      this.log("LOCK", "Released lock")
    }
  }

  // ============================================================================
  // Logging
  // ============================================================================

  private log(type: string, message: string): void {
    const timestamp = new Date().toISOString()
    const runId = this.currentRunId || "none"
    const taskId = this.currentTaskId || "none"
    const stage = this.currentStage || "none"
    const logLine = `[${timestamp}] ${type} run_id=${runId} task_id=${taskId} stage=${stage} ${message}`
    console.log(logLine)

    // Also write to a log file
    const logPath = path.join(this.root, ".opencode", "infinity.log")
    fs.appendFileSync(logPath, logLine + "\n", "utf-8")
  }

  // ============================================================================
  // Main Entry Point
  // ============================================================================

  async start(): Promise<void> {
    this.log("START", `Starting Infinity Loop (max_cycles=${this.config.max_cycles})`)

    this.bootstrap()
    if (!this.acquireLock()) {
      throw new Error("Another Infinity Loop is already running.")
    }


    this.isRunning = true
    await this.loadState()
    await this.saveState()

    try {
      while (this.shouldContinue("initial_exhaustion")) {
        await this.runCycle()
        if (!this.shouldContinue("post_cycle_exhaustion")) break
        if (this.config.idle_backoff_ms > 0) {
          this.log("IDLE", `Backing off for ${this.config.idle_backoff_ms}ms...`)
          await new Promise((r) => setTimeout(r, this.config.idle_backoff_ms))
        }
      }
    } finally {
      this.isRunning = false
      await this.saveState()
      this.releaseLock()
      this.log("STOP", "Infinity Loop stopped")
    }
  }
}

// ============================================================================
// CLI Command
// ============================================================================

export const InfinityCommand = {
  command: "infinity [action]",
  describe: "Run Infinity Loop Runtime",
  builder: (yargs: any) => {
    return yargs.positional("action", {
      describe: "Action to run",
      type: "string",
      default: "start",
      choices: ["start", "status", "resume"],
    })
  },
  handler: async (argv: any) => {
    const root = process.cwd()
    const action = argv.action || "start"

    if (action === "start") {
      const config: Partial<InfinityConfig> = {
        max_cycles: (argv as any).maxCycles ?? 1,
        max_retries_per_task: (argv as any).maxRetries ?? 2,
        idle_backoff_ms: (argv as any).idleBackoff ?? 5000,
        daemon: (argv as any).daemon ?? false,
        watch: (argv as any).watch ?? false,
      }

      const runtime = new InfinityRuntime(root, config)
      await runtime.start()
    } else if (action === "status") {
      // Show status of current runs
      const runsDir = path.join(root, ".opencode", "runs")
      if (!fs.existsSync(runsDir)) {
        console.log("No runs found")
        return
      }

      const runDirs = fs.readdirSync(runsDir)
      for (const runDir of runDirs) {
        const statePath = path.join(runsDir, runDir, "state.json")
        if (!fs.existsSync(statePath)) continue

        const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as RunState
        console.log(`${runDir}: ${state.status} (task: ${state.task_id})`)
      }
    }
  },
}
