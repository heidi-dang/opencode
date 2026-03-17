import { Filesystem } from "../../util/filesystem"
import * as path from "path"
import { Glob } from "../../util/glob"
import { Log } from "../../util/log"

/**
 * RepoMap: P2 Context Engine — Symbol-level index of the repository.
 * Provides a lightweight map of the project's classes, functions, and exports.
 */
export class RepoMap {
  private static log = Log.create({ service: "repo-map" })

  static async generate(root: string): Promise<string> {
    const files = await Glob.scan("**/*.{ts,js,tsx,jsx}", {
      cwd: root,
      absolute: false,
      include: "file",
    })

    const filtered = files.filter(
      (f) => !f.includes("node_modules") && !f.includes("dist") && !f.includes(".opencode")
    )

    const map: string[] = ["<repo_map>"]
    
    // Simple regex-based symbol extraction for Phase 2
    // Future phases will use ts-morph for full AST analysis
    for (const f of filtered.slice(0, 100)) { // Limit to 100 files for MVI
      const content = await Filesystem.readText(path.join(root, f))
      const lines = content.split("\n")
      const symbols: string[] = []

      for (const line of lines) {
        const match = line.match(/(export\s+)?(class|function|const|enum|interface|namespace)\s+(\w+)/)
        if (match) {
          symbols.push(match[3])
        }
      }

      if (symbols.length > 0) {
        map.push(`  <file path="${f}">`)
        map.push(`    symbols: ${symbols.join(", ")}`)
        map.push("  </file>")
      }
    }

    map.push("</repo_map>")
    return map.join("\n")
  }
}
