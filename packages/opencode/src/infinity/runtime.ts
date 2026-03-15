/**
 * Infinity Loop Runtime V1
 *
 * A deterministic loop runner that executes the feedback loop workflow:
 * planner -> inspect -> patch -> verify -> reporter -> rearm
 *
 * master is escalation-only for structured stuck packets.
 * oracle is read-only helper.
 */

import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import { fileURLToPath } from "url"
import type { Argv } from "yargs"
import { Database } from "../storage/db"
import { InfinityTable } from "./infinity.sql.ts"
import { ProjectTable } from "../project/project.sql.ts"
import { eq, desc } from "drizzle-orm"
import { Identifier } from "@/id/id"
import { Process } from "../util/process"
import { ProjectScanner } from "./scanner"
import { InfinityAdapter } from "./adapter"
import { cmd } from "../cli/cmd/cmd"
import type { ProjectID } from "../project/schema"
import { Flag } from "../flag/flag"

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
  status: "queued" | "assigned" | "in_progress" | "stuck" | "ready_for_reporter" | "passed" | "failed" | "rolled_back"
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
  project_id?: string
  attempts?: number
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
  experimental?: boolean
}

export type StopReason = 
  | "max_cycles_reached"
  | "queue_empty"
  | "manual_stop"
  | "fatal_error"
  | "no_eligible_targets"
  | "initial_exhaustion"
  | "post_cycle_exhaustion"

export interface LockFile {
  pid: number
  started_at: string
  run_id?: string
}

// ============================================================================
// Constants
// ============================================================================

const STAGES = [
  "planner",
  "inspect",
  "patch",
  "verify",
  "reporter",
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
  private isAborted = false
  private scanner: ProjectScanner
  private adapter: InfinityAdapter

  constructor(
    root: string, 
    config: Partial<InfinityConfig> = {}, 
    overrides?: { scanner?: ProjectScanner; adapter?: InfinityAdapter }
  ) {
    this.root = root
    this.config = {
      max_cycles: config.max_cycles ?? 1,
      max_retries_per_task: config.max_retries_per_task ?? Flag.HEIDI_MAX_RETRIES,
      idle_backoff_ms: config.idle_backoff_ms ?? 5000,
      daemon: config.daemon ?? false,
      watch: config.watch ?? false,
      experimental: config.experimental ?? false,
    }
    this.scanner = overrides?.scanner ?? new ProjectScanner(root)
    this.adapter = overrides?.adapter ?? new InfinityAdapter(root)
  }

  // ============================================================================
  // Database Persistence
  // ============================================================================

  protected async getProjectId(): Promise<ProjectID> {
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
            project_id: pid,
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
        return db.select().from(InfinityTable).where(eq(InfinityTable.project_id, pid)).get()
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

  private findRunForTask(taskId: string): string | null {
    const runsDir = path.join(this.root, ".opencode", "runs")
    if (!fs.existsSync(runsDir)) return null
    const runs = fs.readdirSync(runsDir)
    for (const rid of runs) {
      const statePath = path.join(runsDir, rid, "state.json")
      if (fs.existsSync(statePath)) {
        try {
          const s = JSON.parse(fs.readFileSync(statePath, "utf-8"))
          if (s.task_id === taskId) return rid
        } catch {}
      }
    }
    return null
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
   * Deterministic stage machine — executes in this order:
   * planner -> inspect -> patch -> verify -> reporter -> rearm
   */
  async runCycle(): Promise<void> {
    const cycleNum = this.cycleCount + 1
    this.log("CYCLE_START", `Starting cycle ${cycleNum}/${this.config.max_cycles}`)

    // Decisions Matrix: Startup
    const resumeResult = this.tryResume()
    if (resumeResult) {
      if (!this.validateResume(resumeResult)) {
        this.log("RESUME_INVALID", `Resume state invalid for run ${resumeResult.runId}. Starting fresh.`)
        this.currentStage = "planner"
        this.currentRunId = null
        this.currentTaskId = null
      } else {
        this.log("RESUME", `Resuming from stage: ${resumeResult.stage}, run: ${resumeResult.runId}`)
        this.currentStage = resumeResult.stage
        this.currentRunId = resumeResult.runId
        this.currentTaskId = resumeResult.taskId
      }
    } else {
      this.currentStage = "planner"
    }

    while (this.shouldContinue()) {
      // 1. Ensure we have an active run or create one
      if (!this.currentRunId) {
        let queue = this.readQueue()
        if (queue.length === 0) {
          this.log("CONTROL", "Queue empty. Searching for targets...")
          const discovered = await this.scanner.scan()
          if (discovered.length > 0) {
            this.writeQueue(discovered)
            queue = discovered
          }
        }

        const nextTask = queue.find((t) => t.status === "queued" || t.status === "assigned")
        if (!nextTask) {
          this.log("CONTROL", "No tasks to process. Waiting for next cycle.")
          break
        }

        if (nextTask.status === "queued") {
          this.log("CONTROL", `Planning task ${nextTask.id}...`)
          this.currentStage = "planner"
          this.currentTaskId = nextTask.id
          await this.stagePlanner()
          // stagePlanner will have set currentRunId and advanced the stage
        } else if (nextTask.status === "assigned") {
          // Resume/Start existing run
          this.currentTaskId = nextTask.id
          this.currentRunId = this.findRunForTask(nextTask.id)
          this.currentStage = "inspect"
          this.log("CONTROL", `Picked up assigned run ${this.currentRunId} for task ${nextTask.id}`)
        }
      }

      // 2. Execute current stage
      if (this.currentStage) {
        const stage = this.currentStage
        this.log("STAGE_ENTER", `Entering stage: ${stage}`)
        await this.executeStage(stage)
      } else {
        break 
      }

      // 3. Post-stage check: if rearm cleared the run, we are done with this target
      if (!this.currentRunId) {
        this.log("CONTROL", "Target lifecycle complete.")
        // Cycle count is incremented in stageRearm()
        break
      }
    }

    this.log("CYCLE_END", `Cycle ${this.cycleCount} finished`)
  }

  private async executeStage(stage: Stage): Promise<void> {
    switch (stage) {
      case "planner":
        await this.stagePlanner()
        break
      case "inspect":
        await this.stageInspect()
        break
      case "patch":
        await this.stagePatch()
        break
      case "verify":
        await this.stageVerify()
        break
      case "reporter":
        await this.stageReporter()
        break
      case "rearm":
        await this.stageRearm()
        break
      default:
        throw new Error(`Unknown stage: ${stage}`)
    }
  }


  private getTaskFingerprint(task: Task): string {
    // Stable fingerprint derived from title + scope + acceptance
    const data = `${task.title}:${task.scope.sort().join(",")}:${task.acceptance.sort().join(",")}`
    return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16)
  }

  private async stagePlanner(): Promise<void> {
    this.log("PLANNER", "Running planner stage...")

    let queue = this.readQueue()
    if (queue.length === 0) {
      this.log("PLANNER", "Queue empty, scanning project for targets...")
      const discovered = await this.scanner.scan()
      if (discovered.length === 0) {
        this.log("PLANNER", "No targets found by scanner, advancing to rearm")
        this.advanceStage()
        return
      }
      this.writeQueue(discovered)
      queue = discovered
    }

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
    this.currentRunId = runId
    this.currentTaskId = nextTask.id
    plan.run_id = runId // Ensure it matches our tracker
    
    this.writePlan(runId, plan)
    
    const state = this.readRunState(runId)!

    state.status = "assigned"
    state.workers = plan.workers.map(w => w.worker_id)
    this.writeRunState(runId, state)
    
    // Crucial: Update task status to pinned so it's not picked up by other workers
    nextTask.status = "assigned"
    this.writeQueue(queue)

    this.log("PLANNER", `Assigned task ${nextTask.id} to run ${runId} with LLM plan`)
    this.advanceStage()
  }

  private async stageInspect(): Promise<void> {
    if (!this.currentRunId || !this.currentTaskId) throw new Error("No active run")
    this.log("INSPECT", `Inspecting target for run ${this.currentRunId}...`)
    
    const task = this.getCurrentTask()!
    const context = await this.getWorkspaceContext(task.scope[0])
    
    // Closed-loop feedback: pass failure info if this is a retry
    const state = this.readRunState(this.currentRunId)!
    const failureLog = state.attempts && state.attempts > 0 && state.log_path && fs.existsSync(state.log_path)
      ? fs.readFileSync(state.log_path, "utf-8")
      : undefined
    
    const result = await this.adapter.inspectTarget(task, context, failureLog)
    const inspectPath = path.join(this.root, ".opencode", "runs", this.currentRunId, "inspect.json")
    fs.writeFileSync(inspectPath, JSON.stringify(result, null, 2))
    
    this.advanceStage()
  }

  private async getWorkspaceContext(filePath: string): Promise<string> {
    const fullPath = path.join(this.root, filePath)
    if (!fs.existsSync(fullPath)) return "File not found"
    const content = await Bun.file(fullPath).text()
    // Return focused slice (Phase 5 requirement)
    return `File: ${filePath}\n\nContent:\n${content.slice(0, 5000)}` 
  }

  private async stagePatch(): Promise<void> {
    if (!this.currentRunId || !this.currentTaskId) throw new Error("No active run")
    this.log("PATCH", `Applying bounded patch for run ${this.currentRunId}...`)
    
    const inspectPath = path.join(this.root, ".opencode", "runs", this.currentRunId, "inspect.json")
    if (!fs.existsSync(inspectPath)) throw new Error("No inspect result found")
    const inspectResult = JSON.parse(fs.readFileSync(inspectPath, "utf-8"))

    // Change Budget Enforcement
    if (inspectResult.allowed_files.length > 3) {
      this.log("PATCH_REJECT", `Rejected: too many files requested (${inspectResult.allowed_files.length} > 3)`)
      this.advanceStage()
      return
    }

    for (const file of inspectResult.allowed_files) {
      const fullPath = path.join(this.root, file)
      if (!fs.existsSync(fullPath)) continue
      
      this.log("PATCH_FILE", `Patching ${file}...`)
      const content = await Bun.file(fullPath).text()
      const patch = await this.adapter.patchTarget(inspectResult, content)
      
      fs.writeFileSync(fullPath, patch.content)
    }

    const diff = (await Process.text(["git", "diff"], { cwd: this.root })).text
    if (diff.trim()) {
      const proofPath = path.join(this.root, ".opencode", "runs", this.currentRunId, "proof.diff")
      fs.writeFileSync(proofPath, diff)
    }

    this.advanceStage()
  }

  private async stageVerify(): Promise<void> {
    if (!this.currentRunId) throw new Error("No active run")
    this.log("VERIFY", `Verifying run ${this.currentRunId}...`)
    
    const task = this.getCurrentTask()!
    const profile = this.getVerificationProfile(task.scope[0])
    this.log("VERIFY_PROFILE", `Using profile: ${profile}`)

    const command = task.verify_command || this.getProfileCommand(profile, task.scope[0])
    
    const start = Date.now()
    const result = await Process.run(command.split(/\s+/), { cwd: this.root, nothrow: true })
    const duration = Date.now() - start

    const logs = `PROFILE: ${profile}\nCOMMAND: ${command}\nDURATION: ${duration}ms\nEXIT_CODE: ${result.code}\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`
    const logPath = path.join(this.root, ".opencode", "runs", this.currentRunId, "verify.log")
    fs.writeFileSync(logPath, logs)
    
    const failureClass = result.code !== 0 ? this.classifyFailure(result.stderr.toString()) : null
    
    const state = this.readRunState(this.currentRunId)!
    state.attempts = (state.attempts ?? 0) + 1
    state.log_path = logPath
    
    if (result.code === 0) {
      state.status = "ready_for_reporter"
      this.writeRunState(this.currentRunId, state)
      this.log("VERIFY_PASS", `Verification passed for run ${this.currentRunId}`)
      this.advanceStage()
    } else {
      this.log("VERIFY_FAIL", `Verification failed (attempt ${state.attempts}/${this.config.max_retries_per_task})`)
      
      if (state.attempts < this.config.max_retries_per_task) {
        state.status = "in_progress"
        this.writeRunState(this.currentRunId, state)
        // Rewind to inspect stage for another attempt
        this.currentStage = "inspect"
        this.log("RETRY", `Rewinding to INSPECT stage for run ${this.currentRunId}`)
        await this.saveState()
      } else {
        this.log("ROLLBACK", `Max retries reached. Executing rollback for run ${this.currentRunId}`)
        await this.rollback()
        state.status = "rolled_back"
        this.writeRunState(this.currentRunId, state)
        this.advanceStage()
      }
    }
    
    this.appendEvent(this.currentRunId, {
      type: "verification",
      timestamp: new Date().toISOString(),
      profile,
      duration,
      passed: result.code === 0,
      failure_class: failureClass,
      attempt: state.attempts
    })
  }

  private async rollback(): Promise<void> {
    this.log("ROLLBACK_EXEC", `Rolling back changes in ${this.root}...`)
    try {
      await Process.run(["git", "checkout", "--", "."], { cwd: this.root })
      this.log("ROLLBACK_SUCCESS", "Rollback successful")
    } catch (e) {
      this.log("ROLLBACK_ERROR", `Failed to rollback: ${e}`)
    }
  }

  private getVerificationProfile(filePath: string): string {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "ts-module"
    if (filePath.endsWith(".py")) return "python-module"
    return "repo-default"
  }

  private getProfileCommand(profile: string, filePath: string): string {
    switch (profile) {
      case "ts-module": return "bun typecheck"
      case "python-module": return `ruff check ${filePath}`
      default: return "bun test"
    }
  }

  private classifyFailure(stderr: string): string {
    if (stderr.includes("SyntaxError")) return "syntax"
    if (stderr.includes("TypeError") || stderr.includes("not found")) return "type"
    if (stderr.includes("failed")) return "test"
    return "unknown"
  }

  private async stageReporter(): Promise<void> {
    if (!this.currentRunId || !this.currentTaskId) {
      throw new Error("No active run in reporter stage")
    }

    const task = this.getCurrentTask()
    if (!task) return this.advanceStage()

    this.log("REPORTER", `Judging task ${this.currentTaskId}...`)
    
    const state = this.readRunState(this.currentRunId)!
    const logsPath = path.join(this.root, ".opencode", "runs", this.currentRunId, "verify.log")
    const logs = fs.existsSync(logsPath) ? fs.readFileSync(logsPath, "utf-8") : "No logs"
    const diffPath = path.join(this.root, ".opencode", "runs", this.currentRunId, "proof.diff")
    const diff = fs.existsSync(diffPath) ? fs.readFileSync(diffPath, "utf-8") : "No diff"

    try {
      // Judge with LLM
      const result = await this.adapter.judgeResult(diff, logs)
      
      state.status = result.pass ? "passed" : "failed"
      state.gate_result = {
        task_id: task.id,
        run_id: this.currentRunId,
        result: result.pass ? "pass" : "fail",
        gates: [],
        rollback_executed: !result.pass
      }
      this.writeRunState(this.currentRunId, state)

      this.log("REPORTER", `LLM Verdict: ${state.status.toUpperCase()} - ${result.summary}`)
      this.advanceStage()
    } catch (e) {
      this.log("REPORTER_ERROR", `Judgment failed: ${e}`)
      this.advanceStage()
    }
  }

  private async stageRearm(): Promise<void> {
    this.log("REARM", "Running rearm stage...")

    if (this.currentTaskId && this.currentRunId) {
      const queue = this.readQueue()
      const taskIndex = queue.findIndex((t) => t.id === this.currentTaskId)
      const state = this.readRunState(this.currentRunId)!
      
      if (taskIndex !== -1) {
        queue[taskIndex].status = state.status === "passed" ? "passed" : "failed"
        this.writeQueue(queue)
        this.log("REARM", `Updated task ${this.currentTaskId} status to ${queue[taskIndex].status}`)
      }

      await this.generateEvidencePack(this.currentRunId)
      this.cycleCount++
    }

    // Clear current run
    this.currentRunId = null
    this.currentTaskId = null
    this.currentStage = null

    this.log("REARM", `Rearm complete. Cycle ${this.cycleCount} finished.`)
  }

  private async generateEvidencePack(runId: string): Promise<void> {
    const runDir = path.join(this.root, ".opencode", "runs", runId)
    const summaryPath = path.join(runDir, "summary.md")
    const state = this.readRunState(runId)!
    const task = this.getCurrentTask()!

    const summary = `# Run Summary: ${runId}
## Task: ${task.title}
- Status: ${state.status}
- Targets: ${task.scope.join(", ")}

## Evidence
- [Diff](proof.diff)
- [Verification Log](verify.log)
- [Inspect Data](inspect.json)

## Verdict
${state.gate_result?.result === "pass" ? "✅ Passed" : "❌ Failed"}
${state.gate_result?.retry_actions ? `**Retry Actions:**\n${state.gate_result.retry_actions.join("\n")}` : ""}
`
    fs.writeFileSync(summaryPath, summary)
    this.log("EVIDENCE", `Evidence pack generated at ${summaryPath}`)
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

  private shouldContinue(reason?: StopReason): boolean {
    // Check max cycles
    if (this.cycleCount >= this.config.max_cycles) {
      this.log("CONTROL", `Stop reason: max_cycles_reached (${this.config.max_cycles})`)
      return false
    }

    // If we are currently in a stage, we should continue that stage sequence
    if (this.currentStage) return true

    // Check if we have work in queue
    const queue = this.readQueue()
    const hasWork = queue.some(t => t.status === "queued" || t.status === "in_progress")
    
    // Check abort flag
    if (this.isAborted) {
      this.log("CONTROL", "Stop reason: manual_stop (signal aborted)")
      return false
    }

    if (!hasWork && !this.config.daemon && !this.config.watch) {
      this.log("CONTROL", `Stop reason: queue_empty`)
      return false
    }

    if (reason) this.log("CONTROL", `Continuing. Context: ${reason}`)
    return true
  }

  // ============================================================================
  // Resume Support
  // ============================================================================

  private validateResume(resume: { stage: Stage; runId: string; taskId: string }): boolean {
    // If current_task_id no longer exists in queue, mark run invalid
    const queue = this.readQueue()
    const task = queue.find(t => t.id === resume.taskId)
    if (!task) return false

    // If run directory exists but state file is corrupt, quarantine it and continue
    const statePath = path.join(this.root, ".opencode", "runs", resume.runId, "state.json")
    if (!fs.existsSync(statePath)) return false
    try {
      JSON.parse(fs.readFileSync(statePath, "utf-8"))
    } catch {
      this.quarantineRun(resume.runId, "Corrupt state file")
      return false
    }

    return true
  }

  private quarantineRun(runId: string, reason: string): void {
    this.log("QUARANTINE", `Quarantining run ${runId}: ${reason}`)
    const runDir = path.join(this.root, ".opencode", "runs", runId)
    const quarantineDir = path.join(this.root, ".opencode", "quarantine", runId)
    this.ensureDir(path.join(this.root, ".opencode", "quarantine"))
    if (fs.existsSync(runDir)) {
      fs.renameSync(runDir, quarantineDir)
      fs.writeFileSync(path.join(quarantineDir, "quarantine_reason.txt"), reason)
    }
  }

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
    // Find most recent non-terminal run
    for (const runDir of [...runDirs].reverse()) {
      const statePath = path.join(runsDir, runDir, "state.json")
      if (!fs.existsSync(statePath)) continue

      try {
        const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as RunState
        if (TERMINAL_STATES.includes(state.status)) continue

        const stage = this.statusToStage(state.status)
        if (!stage) continue

        return { stage, runId: state.run_id, taskId: state.task_id }
      } catch {
        continue
      }
    }

    return null
  }

  private statusToStage(status: RunState["status"]): Stage | null {
    switch (status) {
      case "planning":
        return "planner"
      case "assigned":
        return "inspect"
      case "in_progress":
        return "patch"
      case "ready_for_reporter":
        return "verify"
      case "reporting":
        return "reporter"
      case "stuck":
        return "reporter" 
      default:
        return null
    }
  }

  // ============================================================================
  // Database State Management
  // ============================================================================

  private saveStateToDb(stage: string, runId?: string, taskId?: string): void {
    // Database is optional - silently skip if it fails
  }

  private loadStateFromDb(): { stage: string; runId: string; taskId: string } | null {
    // Database is optional - return null to use file-based state
    return null
  }

  private clearStateFromDb(): void {
    // Database is optional - silently skip
  }

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

    // Also write to a log file safely
    try {
      const opencodeDir = path.join(this.root, ".opencode")
      if (fs.existsSync(opencodeDir)) {
        const logPath = path.join(opencodeDir, "infinity.log")
        fs.appendFileSync(logPath, logLine + "\n", "utf-8")
      }
    } catch {
      // Ignore log write errors during bootstrap or shutdown
    }
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

    // Save initial state to database
    this.saveStateToDb("suggester")

    this.isRunning = true
    this.isAborted = false
    
    const shutdown = () => {
      if (this.isAborted) return
      this.log("SIGNAL", "Received termination signal. Shutting down gracefully...")
      this.isAborted = true
    }

    process.on("SIGTERM", shutdown)
    process.on("SIGINT", shutdown)

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
      this.clearStateFromDb()
      this.releaseLock()
      process.off("SIGTERM", shutdown)
      process.off("SIGINT", shutdown)
      this.log("STOP", "Infinity Loop stopped")
    }
  }
}

// ============================================================================
// CLI Command
// ============================================================================

interface InfinityArgv {
  action: string
  maxCycles?: number
  maxRetries?: number
  idleBackoff?: number
  daemon?: boolean
  watch?: boolean
  experimental?: boolean
  _: string[]
}

export const InfinityCommand = cmd({
  command: "infinity [action]",
  describe: "Run Infinity Loop Runtime",
  builder(yargs) {
    return yargs.positional("action", {
      describe: "Action to run",
      type: "string",
      default: "start",
      choices: ["start", "status", "resume", "pause", "stop", "requeue", "quarantine", "explain"],
    })
  },
  async handler(argv: any) {
    const root = process.cwd()
    const action = (argv.action || "start") as string

    if (action === "start" || action === "resume") {
      const config: Partial<InfinityConfig> = {
        max_cycles: argv.maxCycles ?? 1,
        max_retries_per_task: argv.maxRetries ?? 2,
        idle_backoff_ms: argv.idleBackoff ?? 5000,
        daemon: argv.daemon ?? false,
        watch: argv.watch ?? false,
        experimental: argv.experimental ?? false,
      }

      const runtime = new InfinityRuntime(root, config)
      await runtime.start()
    } else if (action === "status") {
      const runtime = new InfinityRuntime(root)
      const queue = runtime.readQueue()
      console.log(`\nInfinity Status for ${root}:`)
      console.log(`Queue size: ${queue.length}`)
      console.log(`Queued: ${queue.filter(t => t.status === "queued").length}`)
      console.log(`Passed: ${queue.filter(t => t.status === "passed").length}`)
      console.log(`Failed/Quarantined: ${queue.filter(t => t.status === "failed" || t.status === "stuck").length}`)
      
      const runsDir = path.join(root, ".opencode", "runs")
      if (fs.existsSync(runsDir)) {
        const runDirs = fs.readdirSync(runsDir)
        console.log(`\nLast 5 runs:`)
        for (const runDir of runDirs.slice(-5).reverse()) {
          const statePath = path.join(runsDir, runDir, "state.json")
          if (!fs.existsSync(statePath)) continue
          const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as RunState
          console.log(`- ${runDir}: ${state.status} (Task: ${state.task_id})`)
        }
      }
    } else if (action === "stop") {
      const lockPath = path.join(root, ".opencode", "infinity.lock")
      if (!fs.existsSync(lockPath)) {
        console.log("No infinity loop is running (no lock file).")
        return
      }
      try {
        const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as LockFile
        console.log(`Stopping infinity loop (PID: ${lock.pid})...`)
        process.kill(lock.pid, "SIGTERM")
        
        // Wait for lock to be removed
        let attempts = 0
        while (fs.existsSync(lockPath) && attempts < 10) {
          await new Promise(r => setTimeout(r, 500))
          attempts++
        }
        
        if (fs.existsSync(lockPath)) {
          console.log("Loop is still shutting down. It should exit soon.")
        } else {
          console.log("Loop stopped successfully.")
        }
      } catch (e) {
        console.error(`Failed to stop loop: ${e}`)
      }
    } else if (action === "requeue") {
      const taskId = argv._[1]
      if (!taskId) {
        console.error("Task ID required: infinity requeue <task-id>")
        return
      }
      const runtime = new InfinityRuntime(root)
      const queue = runtime.readQueue()
      const task = queue.find(t => t.id === taskId)
      if (task) {
        task.status = "queued"
        runtime.writeQueue(queue)
        console.log(`Task ${taskId} moved back to queue.`)
      } else {
        console.error(`Task ${taskId} not found.`)
      }
    } else if (action === "explain") {
      const runId = argv._[1]
      if (!runId) {
        console.error("Run ID required: infinity explain <run-id>")
        return
      }
      const summaryPath = path.join(root, ".opencode", "runs", runId, "summary.md")
      if (fs.existsSync(summaryPath)) {
        console.log(fs.readFileSync(summaryPath, "utf-8"))
      } else {
        console.error(`Summary not found for run ${runId}`)
      }
    }
  },
})
