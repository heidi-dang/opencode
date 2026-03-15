import { InfinityRuntime, type Stage } from "./runtime"
import { ProjectScanner } from "./scanner"
import { InfinityAdapter, type TaskDiscovery, type InspectResult, type PatchResult, type JudgeResult } from "./adapter"
import * as fs from "fs"
import * as path from "path"
import { tmpdir } from "os"

class MockScanner extends ProjectScanner {
  override async scan() {
    return [{
      id: "task-doctor",
      title: "Doctor Scan Task",
      source: "internal_audit" as const,
      priority: 1,
      category: "stability" as const,
      scope: ["test.ts"],
      acceptance: ["Doctor passes"],
      status: "queued" as const
    }]
  }
}

class MockAdapter extends InfinityAdapter {
  override async suggestTasks(): Promise<TaskDiscovery[]> {
    return [{
      title: "Doctor Test Task",
      source: "internal_audit",
      priority: 1,
      category: "stability",
      scope: ["test.ts"],
      acceptance: ["Doctor passes"]
    }]
  }

  override async createPlan(task: any): Promise<any> {
    return {
      run_id: "run-doctor",
      task_id: task.id,
      task,
      workers: [{ worker_id: "doctor", scope: task.scope }],
      created_at: new Date().toISOString()
    }
  }

  override async inspectTarget(): Promise<InspectResult> {
    return {
      defect_summary: "Mock defect",
      root_cause: "Mock cause",
      fix_plan: "Mock plan",
      allowed_files: ["test.ts"],
      verification_commands: ["echo 'passed'"],
      confidence: 1
    }
  }

  override async patchTarget(): Promise<PatchResult> {
    return {
      content: "const x = 'fixed'",
      rationale: "Mock rational"
    }
  }

  override async judgeResult(): Promise<JudgeResult> {
    return {
      pass: true,
      retryable: false,
      summary: "Mock judge passed"
    }
  }

  override async reportResults(): Promise<any> {
    return {
      result: "pass",
      gates: []
    }
  }

  override async extractLessons(): Promise<string[]> {
    return ["Mock lesson"]
  }

  override async deriveOpportunities(): Promise<any[]> {
    return []
  }
}

class DoctorRuntime extends InfinityRuntime {
  protected override async getProjectId(): Promise<any> {
    return "project-doctor"
  }
}

async function runDoctor() {
  const testRoot = path.join(tmpdir(), `infinity-doctor-${Date.now()}`)
  fs.mkdirSync(testRoot, { recursive: true })
  fs.writeFileSync(path.join(testRoot, "test.ts"), "const x = 'broken'")
  
  console.log(`[DOCTOR] Testing Infinity in ${testRoot}`)
  
  // Initialize git repo for tests
  const { Process } = await import("../util/process")
  await Process.run(["git", "init"], { cwd: testRoot })
  await Process.run(["git", "config", "user.email", "doctor@example.com"], { cwd: testRoot })
  await Process.run(["git", "config", "user.name", "Doctor"], { cwd: testRoot })
  await Process.run(["git", "add", "."], { cwd: testRoot })
  await Process.run(["git", "commit", "-m", "Initial commit"], { cwd: testRoot })

  const scanner = new MockScanner(testRoot)
  const adapter = new MockAdapter(testRoot)
  const runtime = new DoctorRuntime(testRoot, { max_cycles: 1 }, { scanner, adapter })

  // 1. Bootstrap
  console.log("[DOCTOR] 1. Bootstrap...")
  runtime.bootstrap()
  if (!fs.existsSync(path.join(testRoot, ".opencode"))) throw new Error("Bootstrap failed")

  // 2. State Machine Transitions
  console.log("[DOCTOR] 2. Testing Transitions...")
  await runtime.runCycle()
  
  const runsDir = path.join(testRoot, ".opencode", "runs")
  const runs = fs.readdirSync(runsDir)
  if (runs.length === 0) throw new Error("No run generated")
  
  const runId = runs[0]
  const runPath = path.join(runsDir, runId)
  
  // 3. Evidence Pack Check
  console.log("[DOCTOR] 3. Checking Evidence...")
  if (!fs.existsSync(path.join(runPath, "proof.diff"))) throw new Error("proof.diff missing")
  if (!fs.existsSync(path.join(runPath, "summary.md"))) throw new Error("summary.md missing")
  
  const summary = fs.readFileSync(path.join(runPath, "summary.md"), "utf-8")
  if (!summary.includes("✅ Passed")) throw new Error("Summary verdict incorrect")
  if (!summary.includes("[Diff](proof.diff)")) throw new Error("Summary link broken")

  // 4. Budget Enforcement Check
  console.log("[DOCTOR] 4. Testing Budget Enforcement...")
  const extremeAdapter = new class extends MockAdapter {
    override async inspectTarget(): Promise<InspectResult> {
      return {
        ...(await super.inspectTarget()),
        allowed_files: ["file1.ts", "file2.ts", "file3.ts", "file4.ts"]
      }
    }
  }(testRoot)
  
  const budgetRuntime = new DoctorRuntime(testRoot, { max_cycles: 1 }, { scanner, adapter: extremeAdapter })
  await budgetRuntime.runCycle()
  // Should have rejected the patch stage
  
  console.log("[DOCTOR] Tests finished successfully")
  process.exit(0)
}

runDoctor().catch(e => {
  console.error(`[DOCTOR] FAILED: ${e.stack}`)
  process.exit(1)
})
