import { test, expect } from "bun:test"
import path from "path"
import * as fs from "fs"
import { tmpdir } from "../fixture/fixture"
import { ContextScout } from "../../src/agent/intelligence/scout"
import { ContextLoader } from "../../src/agent/intelligence/loader"
import { CodebaseRAG } from "../../src/agent/intelligence/rag"

test("ContextScout detects deep patterns", async () => {
  await using tmp = await tmpdir()
  
  const pkg = {
    dependencies: {
      "next": "14.0.0",
      "drizzle-orm": "0.30.0",
      "vitest": "1.0.0"
    },
    workspaces: ["packages/*"]
  }
  fs.writeFileSync(path.join(tmp.path, "package.json"), JSON.stringify(pkg))
  fs.writeFileSync(path.join(tmp.path, "tsconfig.json"), "{}")
  fs.mkdirSync(path.join(tmp.path, ".github/workflows"), { recursive: true })
  fs.mkdirSync(path.join(tmp.path, "packages"), { recursive: true })

  const patterns = await ContextScout.discover(tmp.path)
  
  expect(patterns.stack).toContain("nextjs")
  expect(patterns.stack).toContain("drizzle")
  expect(patterns.testing).toContain("vitest")
  expect(patterns.conventions).toContain("tsconfig")
  expect(patterns.workspaces).toEqual(["packages/*"])
  expect(patterns.ci).toContain("github-actions")
  expect(patterns.dirs).toContain("packages")
})

test("ContextLoader injects tribal knowledge", async () => {
  await using tmp = await tmpdir()
  
  const knowledgeDir = path.join(tmp.path, ".opencode", "knowledge", "gotchas")
  fs.mkdirSync(knowledgeDir, { recursive: true })
  fs.writeFileSync(path.join(knowledgeDir, "auth-flow.md"), "Critical auth gotcha")

  // Loader needs tags to match
  const items = await ContextLoader.load(tmp.path, ["auth"])
  
  const knowledgeItem = items.find(i => i.name.includes("knowledge/gotchas/auth-flow.md"))
  expect(knowledgeItem).toBeDefined()
  expect(knowledgeItem?.content).toContain("Critical auth gotcha")
})

test("CodebaseRAG incremental reindex", async () => {
  await using tmp = await tmpdir()
  
  const indexPath = path.join(tmp.path, ".opencode", "rag", "index.json")
  fs.mkdirSync(path.join(tmp.path, ".opencode", "rag"), { recursive: true })

  const file1 = path.join(tmp.path, "test.ts")
  fs.writeFileSync(file1, "export function a() { return 1 }")
  
  // Initial reindex
  await CodebaseRAG.reindex(tmp.path)
  const index1 = JSON.parse(fs.readFileSync(indexPath, "utf-8"))
  const initialTime = index1.lastIndexed
  
  // Wait a bit to ensure mtime/now changes
  await new Promise(r => setTimeout(r, 10))
  
  // Reindex without changes
  await CodebaseRAG.reindex(tmp.path)
  const index2 = JSON.parse(fs.readFileSync(indexPath, "utf-8"))
  
  // Should have reused chunks (check metadata.mtime)
  expect(index2.chunks[0].metadata.mtime).toBe(index1.chunks[0].metadata.mtime)
  
  // Change file
  fs.writeFileSync(file1, "export function a() { return 2 }")
  await new Promise(r => setTimeout(r, 10))
  
  await CodebaseRAG.reindex(tmp.path)
  const index3 = JSON.parse(fs.readFileSync(indexPath, "utf-8"))
  expect(index3.chunks[0].metadata.mtime).not.toBe(index1.chunks[0].metadata.mtime)
})
