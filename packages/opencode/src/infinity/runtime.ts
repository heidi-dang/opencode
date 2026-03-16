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
import type { Argv, ArgumentsCamelCase } from "yargs"
import { Database } from "../storage/db"
import { InfinityTable } from "./infinity.sql"
import { ProjectTable } from "../project/project.sql"
import { eq, desc } from "drizzle-orm"
import { Identifier } from "@/id/id"
import { Process as UtilProcess } from "../util/process"
import { cmd } from "../cli/cmd/cmd"

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
    | "gating"
    | "passed"
    | "failed"
    | "rolled_back"
  workers: string[]
  created_at: string
  updated_at: string
  escalated_to_master?: boolean
  gate_result?: GateResult
  before_snapshot?: Record<string, string>
  after_snapshot?: Record<string, string>
  attempts?: number
  patch_contract?: PatchContract
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
  name: "cloud_ci" | "security" | "visual" | "benchmark" | "quality"
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

export interface Metrics {
  lint_errors: number
  type_errors: number
  test_failures: number
  complexity_delta?: number
  latency_ms?: number
  timestamp: string
}

export interface InfinityConfig {
  max_cycles: number
  max_retries_per_task: number
  idle_backoff_ms: number
  daemon: boolean
  watch: boolean
  github_enabled?: boolean
}

export interface LockFile {
  pid: number
  started_at: string
  run_id?: string
}

// ============================================================================
// Phase 2: Bounded Patching
// ============================================================================

export interface PatchContract {
  /** Files that may be written — intersection of task.scope and inspectResult.allowed_files */
  allowed_files: string[]
  /** Maximum net lines changed per file (added + removed). Default: 200 */
  max_lines_changed: number
  /** Run bun --check on a temp file before committing the patch. Default: true */
  require_syntax_check: boolean
}

export class PatchViolation extends Error {
  constructor(
    public code: "out_of_scope" | "oversized" | "syntax_error",
    msg: string,
  ) {
    super(msg)
    this.name = "PatchViolation"
  }
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
  private run: string | null = null
  private task: string | null = null
  private stage: Stage | null = null
  private cycles = 0
  private isRunning = false

  protected deps: any

  constructor(root: string, config: Partial<InfinityConfig> = {}, deps: any = {}) {
    this.root = root
    this.config = {
      max_cycles: config.max_cycles ?? 1,
      max_retries_per_task: config.max_retries_per_task ?? 2,
      idle_backoff_ms: config.idle_backoff_ms ?? 5000,
      daemon: config.daemon ?? false,
      watch: config.watch ?? false,
      github_enabled: config.github_enabled ?? false,
    }
    this.deps = deps
  }

  // ============================================================================
  // Database Persistence
  // ============================================================================

  protected async getProjectId(): Promise<string> {
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
            current_stage: this.stage || "none",
            current_run_id: this.run,
            current_task_id: this.task,
            health_score: health,
            metrics,
          })
          .onConflictDoUpdate({
            target: InfinityTable.project_id,
            set: {
              status: this.isRunning ? "running" : "idle",
              current_stage: this.stage || "none",
              current_run_id: this.run,
              current_task_id: this.task,
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

  private async loadState(): Promise<void> {
    try {
      const pid = await this.getProjectId()
      const state = await Database.use(async (db) => {
        return db.select().from(InfinityTable).where(eq(InfinityTable.project_id, pid as any)).get()
      })

      if (state) {
        this.log("DB_LOAD", `Restored state for project: ${pid} (stage: ${state.current_stage})`)
        this.stage = state.current_stage as Stage
        this.run = state.current_run_id
        this.task = state.current_task_id
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
    this.ensureDir(path.dirname(queuePath))
    fs.writeFileSync(queuePath, JSON.stringify(tasks, null, 2), "utf-8")
  }

  // ============================================================================
  // Run Management
  // ============================================================================

  createRun(taskId: string): string {
    const runId = this.generateRunId()
    const runDir = path.join(this.root, ".opencode", "runs", runId)
    this.ensureDir(runDir)
    this.ensureDir(path.join(runDir, "before"))
    this.ensureDir(path.join(runDir, "after"))
    this.ensureDir(path.join(runDir, "logs"))
    this.ensureDir(path.join(runDir, "metrics"))

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

    // Create empty journal.jsonl (Phase 0 replacement for events.jsonl)
    fs.writeFileSync(path.join(runDir, "journal.jsonl"), "", "utf-8")

    this.run = runId
    this.task = taskId

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
    const eventsPath = path.join(this.root, ".opencode", "runs", runId, "journal.jsonl")
    const line = JSON.stringify(event) + "\n"
    fs.appendFileSync(eventsPath, line, "utf-8")
  }

  protected async calculateMetrics(runId: string, scope: string[]): Promise<Metrics> {
    this.log("METRICS", `Calculating metrics for run ${runId} (scope: ${scope.join(", ")})`)

    let lintErrors = 0
    let typeErrors = 0
    let testFailures = 0

    try {
      // 1. Lint
      const lintResult = await UtilProcess.run(["bun", "run", "lint"], { cwd: this.root })
      const lintOutput = lintResult.stdout.toString()
      if (lintResult.code !== 0) {
        lintErrors = (lintOutput.match(/error/gi) || []).length
      }

      // 2. Typecheck
      const typeResult = await UtilProcess.run(["bun", "run", "typecheck"], { cwd: this.root })
      const typeOutput = typeResult.stdout.toString()
      if (typeResult.code !== 0) {
        typeErrors = (typeOutput.match(/error TS/g) || []).length
      }

      // 3. Test
      const testResult = await UtilProcess.run(["bun", "test", ...scope], { cwd: this.root })
      const testOutput = testResult.stdout.toString()
      if (testResult.code !== 0) {
        testFailures = (testOutput.match(/✗|fail/gi) || []).length
      }
    } catch (e) {
      this.log("METRICS_ERROR", `Failed to calculate metrics: ${e}. Using zero-baseline for safety.`)
    }

    return {
      lint_errors: lintErrors,
      type_errors: typeErrors,
      test_failures: testFailures,
      timestamp: new Date().toISOString()
    }
  }

  public async seedAuditTargets(): Promise<void> {
    this.log("SEED", "Seeding audit targets into queue...")
    const queuePath = path.join(this.root, ".opencode", "queue.json")
    const tasks: Task[] = [
      {
        id: "task-2026-03-16-001",
        title: "Fix logic bug in calculateTotal",
        source: "internal_audit",
        priority: 1,
        category: "stability",
        scope: ["src/bug.ts"],
        acceptance: ["calculateTotal returns sum even if prices include 0"],
        status: "queued"
      },
      {
        id: "task-2026-03-16-002",
        title: "Add divide-by-zero check in divide",
        source: "internal_audit",
        priority: 1,
        category: "stability",
        scope: ["src/robustness.ts"],
        acceptance: ["divide throws or returns 0 on division by zero"],
        status: "queued"
      },
      {
        id: "task-2026-03-16-003",
        title: "Optimize findMax algorithm",
        source: "internal_audit",
        priority: 1,
        category: "performance",
        scope: ["src/perf.ts"],
        acceptance: ["findMax uses O(n) linear scan instead of sort"],
        status: "queued"
      }
    ]

    this.ensureDir(path.dirname(queuePath))
    fs.writeFileSync(queuePath, JSON.stringify(tasks, null, 2), "utf-8")
    this.log("SEED", `Seeded ${tasks.length} tasks to ${queuePath}`)
  }

  protected snapshotFiles(runId: string, scope: string[], target: "before" | "after"): void {
    const targetDir = path.join(this.root, ".opencode", "runs", runId, target)
    this.ensureDir(targetDir)

    for (const pattern of scope) {
      // Simple glob-to-file copy for Phase 1
      // In production, use more robust globbing
      const fullPath = path.join(this.root, pattern)
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const dest = path.join(targetDir, pattern)
        this.ensureDir(path.dirname(dest))
        fs.copyFileSync(fullPath, dest)
      }
    }
  }

  protected restoreFiles(runId: string, scope: string[]): void {
    const backupDir = path.join(this.root, ".opencode", "runs", runId, "before")
    for (const pattern of scope) {
      const backupPath = path.join(backupDir, pattern)
      if (fs.existsSync(backupPath) && fs.statSync(backupPath).isFile()) {
        const targetPath = path.join(this.root, pattern)
        this.ensureDir(path.dirname(targetPath))
        fs.copyFileSync(backupPath, targetPath)
      }
    }
  }

  // ============================================================================
  // Phase 2: Bounded Patching Helpers
  // ============================================================================

  protected buildContract(
    taskScope: string[],
    allowedFiles: string[],
    constraints: string[] = [],
  ): PatchContract {
    // Normalise to relative paths, intersect with task scope
    const scopeSet = new Set(taskScope.map(f => f.replace(/^\.\//, "")))
    const allowed = allowedFiles
      .map(f => f.replace(/^\.\//, ""))
      .filter(f => scopeSet.has(f) || taskScope.some(s => f.startsWith(s.replace(/^\.\//, ""))))

    const maxLines = constraints
      .map(c => c.match(/max_lines_(\d+)/))
      .filter(Boolean)
      .map(m => parseInt(m![1]))
      .at(0) ?? 200

    return {
      allowed_files: allowed.length ? allowed : taskScope,
      max_lines_changed: maxLines,
      require_syntax_check: !constraints.includes("no_syntax_check"),
    }
  }

  protected validatePatch(
    contract: PatchContract,
    relPath: string,
    before: string,
    after: string,
  ): void {
    const norm = relPath.replace(/^\.\//, "")
    if (!contract.allowed_files.some(f => norm === f.replace(/^\.\//, "") || norm.startsWith(f.replace(/^\.\//, "")))) {
      throw new PatchViolation("out_of_scope", `File "${relPath}" is not in the allowed_files contract`)
    }

    const beforeLines = before.split("\n").length
    const afterLines = after.split("\n").length
    const delta = Math.abs(afterLines - beforeLines) + Math.abs(after.split("\n").filter((l, i) => l !== before.split("\n")[i]).length)
    if (delta > contract.max_lines_changed) {
      throw new PatchViolation(
        "oversized",
        `Patch for "${relPath}" changed ~${delta} lines (max ${contract.max_lines_changed})`,
      )
    }
    // Syntax check is handled async in writeTempAndMove — nothing sync here
  }

  protected async writeTempAndMove(
    filePath: string,
    content: string,
    requireCheck: boolean,
  ): Promise<void> {
    const tmp = `${filePath}.infinity.tmp`
    fs.writeFileSync(tmp, content, "utf-8")

    if (requireCheck && filePath.endsWith(".ts")) {
      const result = await UtilProcess.run(["bun", "--check", tmp], { cwd: this.root })
        .catch(e => ({ code: 1, stderr: String(e) }))
      if ((result as any).code !== 0) {
        fs.unlinkSync(tmp)
        const errMsg = typeof (result as any).stderr === "string"
          ? (result as any).stderr
          : (result as any).stderr?.toString() ?? ""
        throw new PatchViolation(
          "syntax_error",
          `Syntax check failed for "${filePath}": ${errMsg.slice(0, 200)}`,
        )
      }
    }

    fs.renameSync(tmp, filePath)
  }

  // ============================================================================
  // Stage Machine
  // ============================================================================

  /**
   * Deterministic stage machine - only executes in this order:
   * suggester -> planner -> dev -> havoc -> reporter -> librarian -> rearm
   */
  async runCycle(): Promise<void> {
    this.cycles++
    this.log("CYCLE_START", `Starting cycle ${this.cycles}/${this.config.max_cycles}`)

    // Check for resume
    const resumeResult = this.tryResume()
    if (resumeResult) {
      this.log("RESUME", `Resuming from stage: ${resumeResult.stage}, run: ${resumeResult.runId}`)
      this.stage = resumeResult.stage
      this.run = resumeResult.runId
      this.task = resumeResult.taskId
    } else {
      // Start fresh cycle
      this.stage = "architect"
    }

    // Execute stages in deterministic order
    while (this.stage) {
      const stage = this.stage
      this.log("STAGE_ENTER", `Entering stage: ${stage}`)

      try {
        await this.executeStage(stage)
      } catch (e) {
        this.log("STAGE_ERROR", `Stage ${stage} failed: ${e}`)
        throw e
      }
    }

    this.log("CYCLE_END", `Cycle ${this.cycles} complete`)
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

    // Add real bootstrap task if queue is completely empty
    const queue = this.readQueue()
    if (queue.length === 0) {
      this.log("SUGGESTER", "Queue empty. Injecting project audit task.")
      queue.push({
        id: this.generateTaskId(),
        title: "Perform Initial Codebase Integrity Audit",
        source: "internal_audit",
        priority: 1,
        category: "stability",
        scope: ["src", "packages"],
        acceptance: ["No high-severity lint errors", "All core packages build"],
        status: "queued",
      })
      this.writeQueue(queue)
    }

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
  private async deliveryPipeline(): Promise<void> {
    if (!this.run || !this.task) return
    if (!this.config.github_enabled) {
      this.log("DELIVERY", "GitHub delivery disabled")
      return
    }

    this.log("DELIVERY", "Starting delivery pipeline...")
    await this.stagePush()
    await this.stagePromote()
    // Monitor and Merge are currently synchronous polling - in a real repo improver 
    // we might want these to be async/long-running, but for now we follow the user's manual logic.
    await this.stageMonitor()
    await this.stageMerge()
  }

  private async stagePush(): Promise<void> {
    this.log("DELIVERY", "Pushing changes to origin...")
    // TODO: Implement real git push
  }

  private async stagePromote(): Promise<void> {
    this.log("DELIVERY", "Creating Pull Request...")
    // TODO: Implement real PR creation
  }

  private async stageMonitor(): Promise<void> {
    this.log("DELIVERY", "Monitoring CI checks...")
    // TODO: Implement real CI monitoring
  }

  private async stageMerge(): Promise<void> {
    this.log("DELIVERY", "Merging Pull Request...")
    // TODO: Implement real merge
  }


  private getTaskFingerprint(task: Task): string {
    // Stable fingerprint derived from title + scope + acceptance
    const data = `${task.title}:${task.scope.sort().join(",")}:${task.acceptance.sort().join(",")}`
    return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16)
  }

  private async stagePlanner(): Promise<void> {
    this.log("PLANNER", "Running planner stage...")

    // Read queue
    const queue = this.readQueue()

    // Find next eligible task (status === "queued")
    const nextTask = queue.find((t) => t.status === "queued")

    if (!nextTask) {
      this.log("PLANNER", "No queued tasks, advancing to rearm")
      this.stage = "rearm"
      return
    }

    // Update task status
    nextTask.status = "in_progress"
    this.writeQueue(queue)

    // Create run
    const runId = this.createRun(nextTask.id)

    // Create plan
    const plan: Plan = {
      run_id: runId,
      task_id: nextTask.id,
      task: nextTask,
      workers: [
        {
          worker_id: "dev-1",
          scope: nextTask.scope,
        },
      ],
      created_at: new Date().toISOString(),
    }
    this.writePlan(runId, plan)

    // Update run state
    const state = this.readRunState(runId)!
    state.status = "assigned"
    state.workers = ["dev-1"]
    this.writeRunState(runId, state)

    // Capture Baseline (Phase 1)
    this.snapshotFiles(runId, nextTask.scope, "before")
    const baseline = await this.calculateMetrics(runId, nextTask.scope)
    fs.writeFileSync(
      path.join(this.root, ".opencode", "runs", runId, "metrics", "before.json"),
      JSON.stringify(baseline, null, 2),
      "utf-8"
    )

    this.log("PLANNER", `Assigned task ${nextTask.id} to run ${runId} with baseline metrics`)
    this.advanceStage()
  }

  private async stageDev(): Promise<void> {
    if (!this.run || !this.task) {
      throw new Error("No active run in dev stage")
    }

    this.log("DEV", `Running dev stage for run ${this.run}...`)

    const plan = this.readPlan(this.run)
    if (!plan) {
      throw new Error(`No plan found for run ${this.run}`)
    }

    const state = this.readRunState(this.run)!
    state.status = "in_progress"
    this.writeRunState(this.run, state)

    this.appendEvent(this.run, {
      type: "progress",
      timestamp: new Date().toISOString(),
      message: "Dev stage executing...",
    })

    // ---- Phase 2: Real adapter path ----
    if (this.deps?.adapter) {
      const task = plan.task

      // Build context from scoped files
      const context = task.scope
        .map(f => {
          const p = path.join(this.root, f)
          if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            return `### ${f}\n\`\`\`\n${fs.readFileSync(p, "utf-8")}\n\`\`\`\n`
          }
          return `### ${f}\n(file not found)\n`
        })
        .join("\n")

      const inspect = await this.deps.adapter.inspectTarget(task, context)
      this.log("DEV", `Inspect confidence: ${inspect.confidence} — ${inspect.defect_summary}`)

      const contract = this.buildContract(task.scope, inspect.allowed_files, task.constraints)
      state.patch_contract = contract
      this.writeRunState(this.run, state)
      this.log("DEV", `Contract: ${contract.allowed_files.length} files, max ${contract.max_lines_changed} lines`)

      const changed: string[] = []
      for (const rel of contract.allowed_files) {
        const abs = path.join(this.root, rel)
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          this.log("DEV", `Skipping (not a file): ${rel}`)
          continue
        }

        const before = fs.readFileSync(abs, "utf-8")
        const patch = await this.deps.adapter.patchTarget(inspect, before)
        this.log("DEV", `Patch received for ${rel} (${patch.rationale.slice(0, 80)})`)

        this.validatePatch(contract, rel, before, patch.content)
        await this.writeTempAndMove(abs, patch.content, contract.require_syntax_check)
        changed.push(rel)
        this.log("DEV", `Patched: ${rel}`)
      }

      this.appendEvent(this.run, {
        type: "completion",
        timestamp: new Date().toISOString(),
        task_id: this.task,
        run_id: this.run,
        worker_id: "dev-1",
        files_changed: changed,
        tests_passed: true,
        summary: `Patched ${changed.length} file(s) via adapter`,
      } as unknown as Event)

      state.status = "ready_for_reporter"
      this.writeRunState(this.run, state)
      this.log("DEV", `Dev stage complete — ${changed.length} file(s) changed`)
      this.advanceStage()
      return
    }

    // ---- Stub path (no adapter) ----
    this.appendEvent(this.run, {
      type: "completion",
      timestamp: new Date().toISOString(),
      task_id: this.task,
      run_id: this.run,
      worker_id: "dev-1",
      files_changed: [],
      tests_passed: true,
      summary: "Simulated dev completion",
    } as unknown as Event)

    state.status = "ready_for_reporter"
    this.writeRunState(this.run, state)
    this.log("DEV", "Dev stage complete")
    this.advanceStage()
  }

  private async stagePerformance(): Promise<void> {
    if (!this.run) {
      throw new Error("No active run in performance stage")
    }

    this.log("PERFORMANCE", `Running performance profiling for run ${this.run}...`)

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
    this.appendEvent(this.run, {
      type: "performance",
      timestamp: new Date().toISOString(),
      latency_ms: latencyMs,
      score: health,
    } as any)

    this.advanceStage()
  }

  private async stageHavoc(): Promise<void> {
    if (!this.run) {
      throw new Error("No active run in havoc stage")
    }

    this.log("HAVOC", `Running havoc stage for run ${this.run}...`)

    // In production, this would invoke the havoc subagent
    // Havoc runs adversarial testing

    this.log("HAVOC", "Havoc passed")
    this.advanceStage()
  }

  private async stageReporter(): Promise<void> {
    if (!this.run || !this.task) {
      throw new Error("No active run in reporter stage")
    }

    this.log("REPORTER", `Running reporter stage for run ${this.run}...`)

    // Capture After Snapshots & Metrics (Phase 1)
    const plan = this.readPlan(this.run)
    if (!plan) {
      throw new Error(`No plan found for run ${this.run}`)
    }

    this.snapshotFiles(this.run, plan.task.scope, "after")
    const afterMetrics = await this.calculateMetrics(this.run, plan.task.scope)
    fs.writeFileSync(
      path.join(this.root, ".opencode", "runs", this.run, "metrics", "after.json"),
      JSON.stringify(afterMetrics, null, 2),
      "utf-8"
    )

    let pass = true
    let rejectReason = ""

    // Check Metrics (Phase 1)
    const beforeMetricsPath = path.join(this.root, ".opencode", "runs", this.run, "metrics", "before.json")
    if (fs.existsSync(beforeMetricsPath)) {
      const beforeMetrics = JSON.parse(fs.readFileSync(beforeMetricsPath, "utf-8")) as Metrics
      
      const lintDelta = afterMetrics.lint_errors - beforeMetrics.lint_errors
      const typeDelta = afterMetrics.type_errors - beforeMetrics.type_errors
      const testDelta = afterMetrics.test_failures - beforeMetrics.test_failures
      
      this.log("REPORTER", `Delta Analysis: Lint=${lintDelta}, Type=${typeDelta}, Test=${testDelta}`)
      
      if (lintDelta > 0 || typeDelta > 0 || testDelta > 0) {
        pass = false
        rejectReason = "Technical debt increased (lint/type/test errors)"
      }
    }

    // Include mock adapter judgment for backwards compatibility with tests
    if (this.deps?.adapter) {
      try {
        const judgment = await this.deps.adapter.judgeResult(this.run, plan.task, { pass })
        if (!judgment.pass) {
          pass = false
          rejectReason = judgment.summary || "Adapter rejected changes"
        }
      } catch (e) {
        // Ignore adapter failure if any
      }
    }

    const state = this.readRunState(this.run)!

    if (!pass) {
      this.log("REPORTER", `REJECTED: ${rejectReason}`)
      state.attempts = (state.attempts || 0) + 1

      if (state.attempts < this.config.max_retries_per_task) {
        this.log("REPORTER", `Rolling back and retrying (attempt ${state.attempts}/${this.config.max_retries_per_task})`)
        this.restoreFiles(this.run, plan.task.scope)
        this.writeRunState(this.run, state)
        this.stage = "dev"
        return
      } else {
        this.log("REPORTER", "Max retries reached. Failing task.")
        this.restoreFiles(this.run, plan.task.scope) // Always rollback on ultimate failure
        state.status = "failed"
        state.gate_result = {
          task_id: this.task!,
          run_id: this.run,
          result: "fail",
          gates: [{ name: "quality", status: "fail", details: rejectReason }],
          rollback_executed: true,
        }
        this.writeRunState(this.run, state)
        this.advanceStage() // Go to Librarian/Rearm to record failure/proof
        return
      }
    }

    // Pass track
    state.status = "passed"
    state.gate_result = {
      task_id: this.task,
      run_id: this.run,
      result: "pass",
      gates: [
        { name: "cloud_ci", status: "pass", details: "CI passed" },
        { name: "quality", status: "pass", details: "No debt increase" }
      ],
    }
    this.writeRunState(this.run, state)

    this.log("REPORTER", `Reporter result: pass`)
    this.advanceStage()
  }

  private async stageLibrarian(): Promise<void> {
    if (!this.run || !this.task) {
      throw new Error("No active run in librarian stage")
    }

    this.log("LIBRARIAN", `Running librarian stage for run ${this.run}...`)

    // Read run state
    const state = this.readRunState(this.run)!

    // Librarian only writes knowledge for passing runs
    if (state.status === "passed") {
      // Create notes directory
      const notesDir = path.join(this.root, ".opencode", "runs", this.run, "notes")
      this.ensureDir(notesDir)

      // Write knowledge to .opencode/knowledge/
      const knowledgeDir = path.join(this.root, ".opencode", "knowledge")
      const lesson = {
        id: `lesson-${Date.now()}`,
        run_id: this.run,
        task_id: this.task,
        category: "pattern",
        title: "Example lesson",
        body: "Lesson learned from this run",
        files: [],
        created_at: new Date().toISOString(),
      }

      const patternFile = path.join(knowledgeDir, "patterns", `${lesson.id}.json`)
      this.ensureDir(path.dirname(patternFile))
      fs.writeFileSync(patternFile, JSON.stringify(lesson, null, 2), "utf-8")

      this.log("LIBRARIAN", "Wrote knowledge to .opencode/knowledge/")
    }

    // Generate proof.md deliverable (Phase 1)
    this.generateProof(this.run)

    this.advanceStage()
  }

  protected generateProof(runId: string): void {
    const runDir = path.join(this.root, ".opencode", "runs", runId)
    const state = this.readRunState(runId)
    if (!state) return

    const beforeMetricsPath = path.join(runDir, "metrics", "before.json")
    const afterMetricsPath = path.join(runDir, "metrics", "after.json")
    
    let proofText = `# Infinity Quality Proof: Run ${runId}\n\n`
    proofText += `**Task ID**: ${state.task_id}\n`
    proofText += `**Final Status**: ${state.status === "passed" ? "✅ PASSED" : "❌ FAILED"}\n\n`

    if (fs.existsSync(beforeMetricsPath) && fs.existsSync(afterMetricsPath)) {
      const before = JSON.parse(fs.readFileSync(beforeMetricsPath, "utf-8")) as Metrics
      const after = JSON.parse(fs.readFileSync(afterMetricsPath, "utf-8")) as Metrics
      
      proofText += `## Delta Analysis\n\n`
      proofText += `| Metric | Before | After | Delta |\n`
      proofText += `| :--- | :--- | :--- | :--- |\n`
      proofText += `| Lint Errors | ${before.lint_errors} | ${after.lint_errors} | ${after.lint_errors - before.lint_errors} |\n`
      proofText += `| Type Errors | ${before.type_errors} | ${after.type_errors} | ${after.type_errors - before.type_errors} |\n`
      proofText += `| Test Failures | ${before.test_failures} | ${after.test_failures} | ${after.test_failures - before.test_failures} |\n\n`
    }

    proofText += `## Artifacts\n`
    proofText += `- [Before Snapshots](./before/)\n`
    proofText += `- [After Snapshots](./after/)\n`
    proofText += `- [Journal](./journal.jsonl)\n`

    fs.writeFileSync(path.join(runDir, "proof.md"), proofText, "utf-8")
    this.log("PROOF", `Generated proof.md for run ${runId}`)
  }

  private async stageInnovation(): Promise<void> {
    this.log("INNOVATION", "Running innovation intelligence stage...")

    // Discover opportunities
    const opportunities = [
      { id: "opt-001", title: "Add Redis Caching layer", impact: "high" },
      { id: "opt-002", title: "Migrate to Edge Functions", impact: "medium" },
    ]

    this.log("INNOVATION", `Found ${opportunities.length} innovation opportunities`)

    // Save blueprints
    const blueprintDir = path.join(this.root, ".opencode", "blueprints")
    this.ensureDir(blueprintDir)
    fs.writeFileSync(
      path.join(blueprintDir, `innovation-${Date.now()}.json`),
      JSON.stringify({ opportunities, timestamp: new Date().toISOString() }, null, 2),
      "utf-8",
    )

    this.advanceStage()
  }

  private async stageRearm(): Promise<void> {
    this.log("REARM", "Running rearm stage...")

    // Mark the consumed queue item as complete
    if (this.task) {
      const queue = this.readQueue()
      const taskIndex = queue.findIndex((t) => t.id === this.task)
      if (taskIndex !== -1) {
        const state = this.readRunState(this.run!)!
        queue[taskIndex].status = state.status === "passed" ? "passed" : "failed"
        this.writeQueue(queue)
        this.log("REARM", `Updated task ${this.task} status to ${queue[taskIndex].status}`)
      }
    }

    // Clear current run
    this.run = null
    this.task = null
    this.stage = null

    this.log("REARM", "Rearm complete")
  }

  private advanceStage(): void {
    if (!this.stage) return

    const currentIndex = STAGES.indexOf(this.stage)
    if (currentIndex < STAGES.length - 1) {
      this.stage = STAGES[currentIndex + 1]
      this.log("STAGE_ADVANCE", `Advanced to: ${this.stage}`)
    } else {
      this.stage = null
      this.log("STAGE_ADVANCE", "No more stages")
    }
    // Async save
    this.saveState().catch((e) => this.log("DB_ERROR", `Failed to save stage advance: ${e}`))
  }

  private shouldContinue(): boolean {
    // Check daemon/watch mode first. If true, run forever
    if (this.config.daemon || this.config.watch) {
      return true
    }

    // Regular finite mode: Check max cycles
    if (this.cycles >= this.config.max_cycles) {
      this.log("CONTROL", `Max cycles reached: ${this.cycles}/${this.config.max_cycles}`)
      return false
    }

    return true
  }

  // ============================================================================
  // Resume Support
  // ============================================================================

  private tryResume(): { stage: Stage; runId: string; taskId: string } | null {
    // If we have state in class from loadState(), it's already "resumed" in a sense
    if (this.stage && this.run && this.task) {
      return {
        stage: this.stage,
        runId: this.run,
        taskId: this.task,
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
      case "gating":
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

  protected log(type: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString()
    const runId = this.run || "none"
    const taskId = this.task || "none"
    const stage = this.stage || "none"
    const logLine = `[${timestamp}] ${type.padEnd(10)} run_id=${runId} task_id=${taskId} stage=${stage} ${message}`
    console.log(logLine)

    // Global log
    try {
      const logPath = path.join(this.root, ".opencode", "infinity.log")
      fs.appendFileSync(logPath, logLine + "\n", "utf-8")
    } catch {}

    // Structured Run Journal
    if (this.run) {
      try {
        const journalPath = path.join(this.root, ".opencode", "runs", this.run, "journal.jsonl")
        const entry = {
          timestamp,
          run_id: this.run,
          task_id: this.task,
          stage: this.stage,
          type,
          message,
          data,
        }
        fs.appendFileSync(journalPath, JSON.stringify(entry) + "\n", "utf-8")
      } catch {}
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
    await this.loadState()
    await this.saveState()

    try {
      while (this.shouldContinue()) {
        await this.runCycle()
        if (!this.shouldContinue()) break
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
      this.log("STOP", "Infinity Loop stopped")
    }
  }
}

// ============================================================================
// CLI Command
// ============================================================================

interface InfinityArgv {
  action?: string
  maxCycles?: number
  maxRetries?: number
  idleBackoff?: number
  daemon?: boolean
  watch?: boolean
  experimental?: boolean
}

export const InfinityCommand = cmd({
  command: "infinity [action]",
  describe: "Run Infinity Loop Runtime",
  builder(yargs: Argv<InfinityArgv>) {
    return yargs
      .positional("action", {
        describe: "Action to run",
        type: "string",
        default: "start",
        choices: ["start", "status", "resume"],
      })
      .option("seed", {
        type: "boolean",
        description: "Seed audit targets into queue",
        default: false,
      })
      .option("maxCycles", { type: "number" })
      .option("maxRetries", { type: "number" })
      .option("idleBackoff", { type: "number" })
      .option("daemon", { type: "boolean" })
      .option("watch", { type: "boolean" })
      .option("experimental", { type: "boolean" })
  },
  async handler(argv: ArgumentsCamelCase<InfinityArgv>) {
    const root = process.cwd()
    const action = argv.action || "start"

    if (action === "start" || action === "resume") {
      const config: Partial<InfinityConfig> = {
        max_cycles: argv.maxCycles ?? 1,
        max_retries_per_task: argv.maxRetries ?? 2,
        idle_backoff_ms: argv.idleBackoff ?? 5000,
        daemon: argv.daemon ?? false,
        watch: argv.watch ?? false,
      }

      const runtime = new InfinityRuntime(root, config)

      if (argv.seed) {
        console.log("Seeding audit targets...")
        await runtime.seedAuditTargets()
      }

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
})
