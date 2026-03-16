process.env.HEIDI_ENABLE_FRONTIER = "true"
import { test, expect } from "bun:test"
import path from "path"
import * as fs from "fs"
import { tmpdir } from "../fixture/fixture"
import {
  InfinityRuntime,
  type Task,
  type KnowledgePattern,
} from "../../src/infinity/runtime"
import { InfinityAdapter } from "../../src/infinity/adapter"

const mockTask: Task = {
  id: "task-mem-001",
  title: "Memory loop",
  source: "internal_audit",
  priority: 1,
  category: "stability",
  scope: ["src/lib.ts"],
  acceptance: [],
  status: "queued"
}

class TestRuntime extends InfinityRuntime {
  getMemory(scope: string[]) { return this.readMemory(scope) }
  async runLibrarian() { return (this as any).stageLibrarian() }
  async runDev() { return (this as any).stageDev() }
}

test("readMemory: filters by scope and returns formatted string", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  const patternDir = path.join(tmp.path, ".opencode", "knowledge", "patterns")
  fs.mkdirSync(patternDir, { recursive: true })

  const p1: KnowledgePattern = {
    id: "p1",
    task_category: "stability",
    scope_hint: ["src/lib.ts"],
    lesson: "Use camelCase",
    outcome: "pass",
    created_at: new Date("2025-01-01").toISOString()
  }
  const p2: KnowledgePattern = {
    id: "p2",
    task_category: "perf",
    scope_hint: ["src/other.ts"],
    lesson: "Avoid loops",
    outcome: "pass",
    created_at: new Date("2025-01-02").toISOString()
  }

  fs.writeFileSync(path.join(patternDir, "p1.json"), JSON.stringify(p1))
  fs.writeFileSync(path.join(patternDir, "p2.json"), JSON.stringify(p2))

  const mem = rt.getMemory(["src/lib.ts"])
  expect(mem).toContain("[Pattern p1]")
  expect(mem).toContain("Use camelCase")
  expect(mem).not.toContain("[Pattern p2]")
})

test("readMemory: limits to 10 newest matching patterns", async () => {
  await using tmp = await tmpdir({ git: false })
  const rt = new TestRuntime(tmp.path)
  const patternDir = path.join(tmp.path, ".opencode", "knowledge", "patterns")
  fs.mkdirSync(patternDir, { recursive: true })

  for (let i = 0; i < 15; i++) {
    const p: KnowledgePattern = {
      id: `p${i}`,
      task_category: "stability",
      scope_hint: ["src/lib.ts"],
      lesson: `Lesson ${i}`,
      outcome: "pass",
      created_at: new Date(2025, 0, i + 1).toISOString()
    }
    fs.writeFileSync(path.join(patternDir, `p${i}.json`), JSON.stringify(p))
  }

  const mem = rt.getMemory(["src/lib.ts"])
  const lines = mem.split("\n")
  expect(lines.length).toBe(10)
  // Should be newest first (p14 is newest)
  expect(lines[0]).toContain("[Pattern p14]")
})

test("stageLibrarian: extracts and writes real lessons via adapter", async () => {
  await using tmp = await tmpdir({ git: true })
  
  const adapter = {
    extractLessons: async () => ["Always use snake_case for DB", "Avoid any types"],
    judgeResult: async () => ({ pass: true })
  } as unknown as InfinityAdapter

  const rt = new TestRuntime(tmp.path, { max_cycles: 1 }, { adapter })
  rt.bootstrap()
  rt.writeQueue([mockTask])
  
  // Seed a passing run state
  const runId = "run-test-librarian"
  const runDir = path.join(tmp.path, ".opencode", "runs", runId)
  fs.mkdirSync(path.join(tmp.path, "src"), { recursive: true })
  fs.mkdirSync(path.join(runDir, "metrics"), { recursive: true })
  fs.writeFileSync(path.join(runDir, "state.json"), JSON.stringify({
    run_id: runId,
    task_id: mockTask.id,
    stage: "librarian",
    status: "passed",
    attempts: 1,
    created_at: new Date().toISOString()
  }))
  fs.writeFileSync(path.join(runDir, "plan.json"), JSON.stringify({
    run_id: runId,
    task: mockTask,
    workers: []
  }))
  // Seed an empty journal so readEvents doesn't crash
  fs.writeFileSync(path.join(runDir, "journal.jsonl"), JSON.stringify({ event: "start" }) + "\n")

  // Set internal state to match seeded run
  ;(rt as any).run = runId;
  ;(rt as any).task = mockTask.id;

  await rt.runLibrarian()

  const patternDir = path.join(tmp.path, ".opencode", "knowledge", "patterns")
  const files = fs.readdirSync(patternDir)
  const allContent = files.map(f => fs.readFileSync(path.join(patternDir, f), "utf-8")).join("\n")
  expect(allContent).toContain("Always use snake_case for DB")
  expect(allContent).toContain("Avoid any types")
})

test("stageDev: injects memory into adapter inspect context", async () => {
  await using tmp = await tmpdir({ git: true })
  
  // 1. Seed existing memory
  const patternDir = path.join(tmp.path, ".opencode", "knowledge", "patterns")
  fs.mkdirSync(patternDir, { recursive: true })
  const p1: KnowledgePattern = {
    id: "prev-lesson",
    task_category: "stability",
    scope_hint: ["src/lib.ts"],
    lesson: "NEVER use var",
    outcome: "pass",
    created_at: new Date().toISOString()
  }
  fs.writeFileSync(path.join(patternDir, "p1.json"), JSON.stringify(p1))

  // 2. Mock adapter to capture the context
  let capturedContext = ""
  const adapter = {
    inspectTarget: async (_task: any, context: string) => {
      capturedContext = context
      return {
        defect_summary: "bug", root_cause: "x", fix_plan: "y",
        allowed_files: ["src/lib.ts"], confidence: 1.0, verification_commands: []
      }
    },
    patchTarget: async () => ({ content: "export const a = 1", rationale: "fix" })
  } as unknown as InfinityAdapter

  const rt = new TestRuntime(tmp.path, { max_cycles: 1 }, { adapter })
  rt.bootstrap()

  // 3. Setup active run context
  const runId = "run-dev-memory"
  const runDir = path.join(tmp.path, ".opencode", "runs", runId)
  fs.mkdirSync(path.join(tmp.path, "src"), { recursive: true })
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(tmp.path, "src/lib.ts"), "export const a = 0")
  
  fs.mkdirSync(path.join(runDir, "metrics"), { recursive: true })
  fs.writeFileSync(path.join(runDir, "plan.json"), JSON.stringify({
    run_id: runId,
    task: mockTask,
    workers: []
  }))
  fs.writeFileSync(path.join(runDir, "state.json"), JSON.stringify({
    run_id: runId,
    task_id: mockTask.id,
    stage: "dev",
    status: "queued",
    attempts: 0,
    created_at: new Date().toISOString()
  }));
  (rt as any).run = runId;
  (rt as any).task = mockTask.id;

  await rt.runDev()

  expect(capturedContext).toContain("## Previous Learnings")
  expect(capturedContext).toContain("NEVER use var")
  expect(capturedContext).toContain("## Repo Context")
})
