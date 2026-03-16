process.env.HEIDI_ENABLE_FRONTIER = "true"
import { test, expect } from "bun:test"
import path from "path"
import * as fs from "fs"
import { tmpdir } from "../fixture/fixture"
import {
  InfinityRuntime,
  PatchViolation,
  type Task,
  type PatchContract,
} from "../../src/infinity/runtime"
import { InfinityAdapter } from "../../src/infinity/adapter"

const mockTask: Task = {
  id: "task-patch-001",
  title: "Fix bug",
  source: "internal_audit",
  priority: 1,
  category: "stability",
  scope: ["src/index.ts"],
  acceptance: ["fixed"],
  status: "queued",
}

// Helper to access protected methods
class TestRuntime extends InfinityRuntime {
  contract(scope: string[], files: string[], constraints?: string[]): PatchContract {
    return this.buildContract(scope, files, constraints)
  }
  validate(contract: PatchContract, rel: string, before: string, after: string) {
    return this.validatePatch(contract, rel, before, after)
  }
  async tempAndMove(file: string, content: string, check: boolean) {
    return this.writeTempAndMove(file, content, check)
  }
}

// ============================================================================
// buildContract
// ============================================================================

test("buildContract: intersects scope with allowed_files", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  const c = rt.contract(["src/index.ts"], ["src/index.ts", "evil.ts"])
  expect(c.allowed_files).toEqual(["src/index.ts"])
})

test("buildContract: falls back to scope when no intersection", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  const c = rt.contract(["src/index.ts"], ["other/file.ts"])
  // No match → falls back to task scope
  expect(c.allowed_files).toEqual(["src/index.ts"])
})

test("buildContract: reads max_lines from constraints", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  const c = rt.contract(["src/index.ts"], ["src/index.ts"], ["max_lines_50"])
  expect(c.max_lines_changed).toBe(50)
})

test("buildContract: require_syntax_check disabled by constraint", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  const c = rt.contract(["src/index.ts"], ["src/index.ts"], ["no_syntax_check"])
  expect(c.require_syntax_check).toBe(false)
})

// ============================================================================
// validatePatch
// ============================================================================

test("validatePatch: rejects out-of-scope file", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  const c = rt.contract(["src/index.ts"], ["src/index.ts"])
  expect(() => rt.validate(c, "evil.ts", "a", "b")).toThrow("not in the allowed_files contract")
})

test("validatePatch: rejects oversized patch", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  const c: PatchContract = { allowed_files: ["src/index.ts"], max_lines_changed: 5, require_syntax_check: false }
  const before = Array(3).fill("line").join("\n")
  const after = Array(200).fill("newline").join("\n")
  expect(() => rt.validate(c, "src/index.ts", before, after)).toThrow("max 5")
})

test("validatePatch: accepts in-scope small patch", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  const c: PatchContract = { allowed_files: ["src/index.ts"], max_lines_changed: 200, require_syntax_check: false }
  expect(() => rt.validate(c, "src/index.ts", "const a = 1\n", "const a = 2\n")).not.toThrow()
})

// ============================================================================
// writeTempAndMove
// ============================================================================

test("writeTempAndMove: writes content atomically (no syntax check)", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  fs.mkdirSync(path.join(tmp.path, "src"), { recursive: true })
  const file = path.join(tmp.path, "src/index.ts")
  fs.writeFileSync(file, "const a = 1", "utf-8")
  await rt.tempAndMove(file, "const a = 2", false)
  expect(fs.readFileSync(file, "utf-8")).toBe("const a = 2")
  // Temp file should be cleaned up
  expect(fs.existsSync(`${file}.infinity.tmp`)).toBe(false)
})

// ============================================================================
// stageDev: real adapter integration
// ============================================================================

test("stageDev: calls adapter.patchTarget and writes file to disk", async () => {
  await using tmp = await tmpdir({ git: true })
  fs.mkdirSync(path.join(tmp.path, "src"), { recursive: true })
  fs.writeFileSync(path.join(tmp.path, "src/index.ts"), "export const a = 1", "utf-8")

  const adapter = {
    createPlan: async () => ({
      run_id: "run-1",
      task_id: mockTask.id,
      task: mockTask,
      workers: [{ worker_id: "test-worker", scope: ["src/index.ts"] }],
      created_at: new Date().toISOString(),
    }),
    inspectTarget: async () => ({
      defect_summary: "off-by-one",
      root_cause: "value is 1",
      fix_plan: "change to 2",
      allowed_files: ["src/index.ts"],
      verification_commands: [],
      confidence: 0.9,
    }),
    patchTarget: async () => ({
      content: "export const a = 2",
      rationale: "incremented value",
    }),
    judgeResult: async () => ({ pass: true, retryable: false, summary: "ok" }),
  } as unknown as InfinityAdapter

  const runtime = new InfinityRuntime(tmp.path, { max_cycles: 1 }, { adapter })
  runtime.bootstrap()
  runtime.writeQueue([mockTask])
  await runtime.runCycle()

  // File should be patched on disk
  const content = fs.readFileSync(path.join(tmp.path, "src/index.ts"), "utf-8")
  expect(content).toBe("export const a = 2")

  // Task should be passed
  const queue = runtime.readQueue()
  expect(queue[0].status).toBe("passed")
})

// stageDev: adapter returns original content unchanged (noop patch)
test("stageDev: adapter noop patch leaves file unchanged", async () => {
  await using tmp = await tmpdir({ git: true })
  fs.mkdirSync(path.join(tmp.path, "src"), { recursive: true })
  const filePath = path.join(tmp.path, "src/index.ts")
  // Use valid TS content so bun --check passes
  fs.writeFileSync(filePath, "export const orig = 1", "utf-8")

  const noopTask: Task = { ...mockTask, constraints: ["no_syntax_check"] }

  const adapter = {
    createPlan: async () => ({
      run_id: "run-1",
      task_id: noopTask.id,
      task: noopTask,
      workers: [{ worker_id: "w1", scope: ["src/index.ts"] }],
      created_at: new Date().toISOString(),
    }),
    inspectTarget: async () => ({
      defect_summary: "noop",
      root_cause: "none",
      fix_plan: "return original",
      allowed_files: ["src/index.ts"],
      verification_commands: [],
      confidence: 1.0,
    }),
    // Adapter returns original content — no actual change
    patchTarget: async (_inspect: any, before: string) => ({ content: before, rationale: "noop" }),
    judgeResult: async () => ({ pass: true, retryable: false, summary: "ok" }),
  } as unknown as InfinityAdapter

  const runtime = new InfinityRuntime(tmp.path, { max_cycles: 1 }, { adapter })
  runtime.bootstrap()
  runtime.writeQueue([noopTask])
  await runtime.runCycle()

  // File should remain unchanged (adapter returned same content)
  const content = fs.readFileSync(filePath, "utf-8")
  expect(content).toBe("export const orig = 1")
})
