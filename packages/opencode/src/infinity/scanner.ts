import { Glob } from "../util/glob"
import { Identifier } from "../id/id"
import * as path from "node:path"
import type { Task } from "./runtime"
import { Process } from "../util/process"

export interface TargetMetadata {
  type: "file" | "symbol" | "signal" | "hotspot"
  path: string
  symbol?: string
  reason: string
}

export class ProjectScanner {
  constructor(private root: string) {}

  async scan(): Promise<Task[]> {
    const tasks: Task[] = []
    const targets: TargetMetadata[] = []

    // 1. Source-file inventory
    const files = await Glob.scan("**/*.{ts,tsx,js,jsx,py,go,rs}", { 
      cwd: this.root
    })
    const filteredFiles = files.filter(f => !f.includes("node_modules") && !f.includes(".opencode"))

    // 2. Signal Discovery: TODO/FIXME markers
    for (const file of filteredFiles) {
      const fullPath = path.join(this.root, file)
      const content = await Bun.file(fullPath).text()
      
      const todoMatches = content.match(/\/\/\s*(TODO|FIXME|HACK):?\s*(.*)/gi)
      if (todoMatches) {
        for (const match of todoMatches) {
          targets.push({
            type: "signal",
            path: file,
            reason: `Marker found: ${match.trim()}`
          })
        }
      }
    }

    // 3. Hotspot Discovery: Heavy churn
    try {
      const logLines = await Process.lines(["git", "log", "--pretty=format:", "--name-only", "-n", "100"], { cwd: this.root })
      const counts: Record<string, number> = {}
      logLines.forEach(f => counts[f] = (counts[f] || 0) + 1)
      
      const hotspots = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([f]) => f)

      for (const hotspot of hotspots) {
        targets.push({
          type: "hotspot",
          path: hotspot,
          reason: "High churn hotspot"
        })
      }
    } catch {
      // No git or error
    }

    // Convert targets to tasks
    for (const target of targets) {
      tasks.push({
        id: Identifier.descending("infinity"),
        title: `Audit ${target.type}: ${target.path}`,
        source: "internal_audit",
        priority: target.type === "signal" ? 5 : 2,
        category: "stability",
        scope: [target.path],
        acceptance: [`Issue in ${target.path} is resolved`, `Verification passes for ${target.path}`],
        status: "queued",
        verify_command: this.getVerifyCommand(target.path)
      })
    }

    // Keep package audit as fallback/high-level
    const packageFiles = await Glob.scan("**/package.json", { cwd: this.root })
    for (const pkgFile of packageFiles) {
      if (pkgFile.includes("node_modules")) continue
      tasks.push({
        id: Identifier.descending("infinity"),
        title: `Package Stability Audit: ${path.dirname(pkgFile)}`,
        source: "internal_audit",
        priority: 1,
        category: "stability",
        scope: [path.dirname(pkgFile)],
        acceptance: ["Builds without errors"],
        status: "queued"
      })
    }

    return tasks
  }

  private getVerifyCommand(filePath: string): string | undefined {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      return `bun typecheck` // Future: scope to file if possible
    }
    if (filePath.endsWith(".py")) {
      return `ruff check ${filePath}`
    }
    return undefined
  }
}
