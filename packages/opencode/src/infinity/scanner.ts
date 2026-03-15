import { Glob } from "../util/glob"
import { Identifier } from "../id/id"
import * as path from "node:path"
import type { Task } from "./runtime"

export class ProjectScanner {
  constructor(private root: string) {}

  async scan(): Promise<Task[]> {
    const tasks: Task[] = []
    
    // 1. Find all packages
    const packageFiles = await Glob.scan("**/package.json", { cwd: this.root })
    
    for (const pkgFile of packageFiles) {
      if (pkgFile.includes("node_modules")) continue
      if (pkgFile.includes(".opencode")) continue
      
      const pkgPath = path.join(this.root, pkgFile)
      try {
        const content = await Bun.file(pkgPath).json()
        const pkgName = content.name || path.dirname(pkgFile)
        const pkgDir = path.dirname(pkgPath)

        tasks.push({
          id: Identifier.descending("infinity"),
          title: `Package Stability Audit: ${pkgName}`,
          source: "internal_audit",
          priority: 2,
          category: "stability",
          scope: [pkgDir],
          acceptance: [`${pkgName} builds without errors`, `No circular dependencies in ${pkgName}`],
          status: "queued",
          verify_command: `cd ${pkgDir} && bun typecheck`
        })
      } catch {
        // Skip malformed package.json
      }
    }

    return tasks
  }
}
