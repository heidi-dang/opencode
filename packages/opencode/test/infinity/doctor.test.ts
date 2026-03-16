import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { InfinityRuntime, type Stage } from "../../src/infinity/runtime"
import { ProjectScanner } from "../../src/infinity/scanner"
import { InfinityAdapter, type TaskDiscovery, type InspectResult, type PatchResult, type JudgeResult } from "../../src/infinity/adapter"
import * as fs from "fs"
import * as path from "path"
import { tmpdir } from "os"
import { Database } from "../../src/storage/db"
import { ProjectTable } from "../../src/project/project.sql"
import { Identifier } from "../../src/id/id"

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

  override async deriveOpportunities(): Promise<TaskDiscovery[]> {
    return []
  }
}

class DoctorRuntime extends InfinityRuntime {
  protected override async getProjectId(): Promise<any> {
    return "project-doctor"
  }
}

describe("Infinity Doctor", () => {
  let testRoot: string

  beforeEach(async () => {
    testRoot = path.join(tmpdir(), `infinity-doctor-${Date.now()}`)
    fs.mkdirSync(testRoot, { recursive: true })
    fs.writeFileSync(path.join(testRoot, "test.ts"), "const x = 'broken'")
    
    // Initialize git repo for tests
    const { Process } = await import("../../src/util/process")
    await Process.run(["git", "init"], { cwd: testRoot })
    await Process.run(["git", "config", "user.email", "doctor@example.com"], { cwd: testRoot })
    await Process.run(["git", "config", "user.name", "Doctor"], { cwd: testRoot })
    await Process.run(["git", "add", "."], { cwd: testRoot })
    await Process.run(["git", "commit", "-m", "Initial commit"], { cwd: testRoot })

    // Ensure project exists in DB for foreign key constraints
    await Database.use(async (db) => {
      await db
        .insert(ProjectTable)
        .values({
          id: "project-doctor" as any,
          worktree: testRoot,
          sandboxes: [],
        })
        .onConflictDoNothing()
    })
  })

  afterEach(() => {
    Database.close()
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  it("should complete a full cycle successfully", async () => {
    const scanner = new MockScanner(testRoot)
    const adapter = new MockAdapter(testRoot)
    const runtime = new DoctorRuntime(testRoot, { max_cycles: 1 }, { scanner, adapter })

    // 1. Bootstrap
    runtime.bootstrap()
    expect(fs.existsSync(path.join(testRoot, ".opencode"))).toBe(true)

    // 2. State Machine Transitions
    await runtime.runCycle()
    
    const runsDir = path.join(testRoot, ".opencode", "runs")
    const runs = fs.readdirSync(runsDir)
    expect(runs.length).toBeGreaterThan(0)
    
    const runId = runs[0]
    const runPath = path.join(runsDir, runId)
    
    // 3. Evidence Pack Check
    expect(fs.existsSync(path.join(runPath, "proof.md"))).toBe(true)
    
    const proof = fs.readFileSync(path.join(runPath, "proof.md"), "utf-8")
    expect(proof).toContain("✅ PASSED")
  })

  it("should enforce change budget", async () => {
    const extremeAdapter = new class extends MockAdapter {
      override async inspectTarget(): Promise<InspectResult> {
        return {
          ...(await super.inspectTarget()),
          allowed_files: ["file1.ts", "file2.ts", "file3.ts", "file4.ts"]
        }
      }
    }(testRoot)
    
    const scanner = new MockScanner(testRoot)
    const runtime = new DoctorRuntime(testRoot, { max_cycles: 1 }, { scanner, adapter: extremeAdapter })
    await runtime.runCycle()
    // Validation: Check that no patch was applied (file remains broken)
    const content = fs.readFileSync(path.join(testRoot, "test.ts"), "utf-8")
    expect(content).toBe("const x = 'broken'")
  })
})
