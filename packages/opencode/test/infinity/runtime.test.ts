process.env.HEIDI_ENABLE_FRONTIER = "true"
import { test, expect, mock } from "bun:test"
import path from "path"
import * as fs from "fs"
import { tmpdir } from "../fixture/fixture"
import { InfinityRuntime, type Task } from "../../src/infinity/runtime"
import { InfinityAdapter } from "../../src/infinity/adapter"

// Mock task
const mockTask: Task = {
  id: "task-2026-03-15-001",
  title: "Fix bug",
  source: "internal_audit",
  priority: 1,
  category: "stability",
  scope: ["src/index.ts"],
  acceptance: ["fixed"],
  status: "queued"
}

test("InfinityRuntime stage progression: success path", async () => {
  await using tmp = await tmpdir({ git: true })
  
  // Setup: create a file to "fix"
  const indexPath = path.join(tmp.path, "src/index.ts")
  fs.mkdirSync(path.join(tmp.path, "src"), { recursive: true })
  fs.writeFileSync(indexPath, "export const a = 1", "utf-8")
  
  // Mock adapter
  const adapter = {
    createPlan: async () => ({
      run_id: "run-1",
      task_id: mockTask.id,
      task: mockTask,
      workers: [{ worker_id: "test-worker", scope: ["src/index.ts"] }],
      created_at: new Date().toISOString()
    }),
    inspectTarget: async () => ({
      defect_summary: "bug",
      root_cause: "bad code",
      fix_plan: "fix it",
      allowed_files: ["src/index.ts"],
      verification_commands: ["echo success"],
      confidence: 1
    }),
    patchTarget: async () => ({
      content: "export const a = 2",
      rationale: "fixed"
    }),
    judgeResult: async () => ({
      pass: true,
      retryable: false,
      summary: "Looks good"
    }),
    reportResults: async () => ({
      task_id: mockTask.id,
      run_id: "run-1",
      result: "pass",
      gates: []
    })
  } as unknown as InfinityAdapter

  const runtime = new InfinityRuntime(tmp.path, { max_cycles: 1 }, { adapter })
  runtime.bootstrap()
  
  // Add task to queue
  runtime.writeQueue([mockTask])
  
  // Run cycle
  await runtime.runCycle()
  
  const queue = runtime.readQueue()
  expect(queue[0].status).toBe("passed")
})

test("InfinityRuntime retry loop: verify fails then passes", async () => {
  await using tmp = await tmpdir({ git: true })
  
  // Setup: create a file to "fix"
  const indexPath = path.join(tmp.path, "src/index.ts")
  fs.mkdirSync(path.join(tmp.path, "src"), { recursive: true })
  fs.writeFileSync(indexPath, "export const a = 1", "utf-8")
  
  let verifyAttempts = 0
  
  // Mock adapter
  const adapter = {
    createPlan: async () => ({
      run_id: "run-1",
      task_id: mockTask.id,
      task: mockTask,
      workers: [{ worker_id: "test-worker", scope: ["src/index.ts"] }],
      created_at: new Date().toISOString()
    }),
    inspectTarget: async (task: any, context: any, failure: any) => {
      return {
        defect_summary: "bug",
        root_cause: "bad code",
        fix_plan: "fix it",
        allowed_files: ["src/index.ts"],
        verification_commands: [],
        confidence: 1
      }
    },
    patchTarget: async () => ({
      content: "export const a = 2",
      rationale: "fixed"
    }),
    judgeResult: async () => {
      verifyAttempts++
      return {
        pass: verifyAttempts > 1,
        retryable: false,
        summary: verifyAttempts > 1 ? "Looks good" : "Failed"
      }
    }
  } as unknown as InfinityAdapter

  const runtime = new InfinityRuntime(tmp.path, { max_cycles: 1, max_retries_per_task: 2 }, { adapter })
  runtime.bootstrap()
  runtime.writeQueue([mockTask])
  
  await runtime.runCycle()
  
  // Reporter was called twice (first fail, second pass)
  expect(verifyAttempts).toBe(2)
  const queue = runtime.readQueue()
  expect(queue[0].status).toBe("passed")
})

test("InfinityRuntime rollback: verify fails and max retries reached", async () => {
  await using tmp = await tmpdir({ git: true })
  
  // Setup: create a file to "fix"
  const indexPath = path.join(tmp.path, "src/index.ts")
  fs.mkdirSync(path.join(tmp.path, "src"), { recursive: true })
  fs.writeFileSync(indexPath, "original content", "utf-8")
  
  // Commit it so we can rollback
  const { $ } = require("bun")
  await $`git add src/index.ts`.cwd(tmp.path).quiet()
  await $`git commit -m "initial"`.cwd(tmp.path).quiet()

  // Mock adapter
  const adapter = {
    createPlan: async () => ({
      run_id: "run-1",
      task_id: mockTask.id,
      task: mockTask,
      workers: [{ worker_id: "test-worker", scope: ["src/index.ts"] }],
      created_at: new Date().toISOString()
    }),
    inspectTarget: async () => ({
      defect_summary: "bug",
      root_cause: "bad code",
      fix_plan: "fix it",
      allowed_files: ["src/index.ts"],
      verification_commands: ["exit 1"],
      confidence: 1
    }),
    patchTarget: async () => ({
      content: "MODIFIED content",
      rationale: "fixed"
    }),
    judgeResult: async () => ({
      pass: false,
      retryable: false,
      summary: "Looks bad"
    })
  } as unknown as InfinityAdapter

  const runtime = new InfinityRuntime(tmp.path, { max_cycles: 1, max_retries_per_task: 1 }, { adapter })
  runtime.bootstrap()
  runtime.writeQueue([mockTask])
  
  await runtime.runCycle()
  
  const queue = runtime.readQueue()
  expect(queue[0].status).toBe("failed")
  
  // Check that file was rolled back
  const content = fs.readFileSync(indexPath, "utf-8")
  expect(content).toBe("original content")
})
