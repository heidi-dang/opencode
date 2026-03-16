import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { InfinityRuntime, type Task, type Metrics } from "../../src/infinity/runtime"
import { tmpdir } from "../fixture/fixture"
import * as fs from "fs"
import * as path from "path"
import { InfinityAdapter, type InspectResult, type PatchResult } from "../../src/infinity/adapter"

describe("Infinity Multi-Worker", () => {
  test("stagePlanner: assigns multiple workers", async () => {
    await using tmp = await tmpdir({ git: true })
    const runtime = new InfinityRuntime(tmp.path, { max_workers: 3 } as any, {})
    runtime.bootstrap()

    const mockTask: Task = {
      id: "task-001",
      title: "Test Multi-worker",
      source: "internal_audit",
      priority: 1,
      category: "stability",
      scope: ["src/index.ts"],
      acceptance: ["Tests pass"],
      status: "queued"
    }
    runtime.writeQueue([mockTask])

    await (runtime as any).stagePlanner()

    const plan = (runtime as any).readPlan((runtime as any).run)
    expect(plan.workers.length).toBe(3)
    expect(plan.workers[0].worker_id).toBe("dev-1")
    expect(plan.workers[2].worker_id).toBe("dev-3")
  })

  test("stageDev + stagePerformance: generates candidates and selects winner", async () => {
    await using tmp = await tmpdir({ git: true })
    
    // Setup target file
    const indexPath = path.join(tmp.path, "src/index.ts")
    fs.mkdirSync(path.dirname(indexPath), { recursive: true })
    fs.writeFileSync(indexPath, "console.log('original')", "utf-8")

    // Mock Adapter that returns different results per call
    let callCount = 0
    const adapter = {
      inspectTarget: async () => ({
        confidence: 0.9,
        defect_summary: "bug",
        allowed_files: ["src/index.ts"]
      }),
      patchTarget: async () => {
        callCount++
        return {
          content: `console.log('patched by worker ${callCount}')`,
          rationale: `Fix ${callCount}`
        }
      }
    } as unknown as InfinityAdapter

    // Custom runtime that mocks calculateMetrics to return specific quality for each worker
    class TestRuntime extends InfinityRuntime {
      metricsIdx = 0
      metricSequence = [
        { lint_errors: 1, type_errors: 1, test_failures: 1, timestamp: "" },  // Baseline
        { lint_errors: 10, type_errors: 10, test_failures: 1, timestamp: "" }, // Worker 1 (Fail)
        { lint_errors: 0, type_errors: 0, test_failures: 0, timestamp: "" },  // Worker 2 (Winner)
      ]

      protected override async calculateMetrics() {
        return this.metricSequence[this.metricsIdx++] as Metrics
      }
    }

    const runtime = new TestRuntime(tmp.path, { max_workers: 2 } as any, { adapter })
    runtime.bootstrap()

    const mockTask: Task = {
      id: "task-001",
      title: "Test Multi-worker",
      source: "internal_audit",
      priority: 1,
      category: "stability",
      scope: ["src/index.ts"],
      acceptance: ["Tests pass"],
      status: "queued"
    }
    runtime.writeQueue([mockTask])

    await (runtime as any).stagePlanner()
    await (runtime as any).stageDev()
    
    // Verify candidates exist
    const runId = (runtime as any).run
    const runDir = path.join(tmp.path, ".opencode", "runs", runId)
    expect(fs.existsSync(path.join(runDir, "candidates", "dev-1", "metrics.json"))).toBe(true)
    expect(fs.existsSync(path.join(runDir, "candidates", "dev-2", "metrics.json"))).toBe(true)

    await (runtime as any).stagePerformance()

    const state = runtime.readRunState(runId)!
    expect(state.winner_worker_id).toBe("dev-2")
    
    // Verify winner's file applied to root
    const rootContent = fs.readFileSync(indexPath, "utf-8")
    expect(rootContent).toContain("patched by worker 2")
  })
})
