import { Filesystem } from "../../util/filesystem"
import * as path from "path"
import { readdir } from "fs/promises"
import { Global } from "../../global"
import { TeamPatterns } from "./patterns"
import { TokenOptimizer } from "./optimizer"

export interface ContextItem {
  name: string
  content: string
}

export class ContextLoader {
  static async load(root: string, tags: string[]): Promise<ContextItem[]> {
    const items: ContextItem[] = []
    const base = path.join(root, ".opencode", "context")

    // Load from project-intelligence, core, and external based on tags
    const dirs = ["project-intelligence", "core", "external"]
    
    for (const dir of dirs) {
      const dirPath = path.join(base, dir)
      if (!(await Filesystem.exists(dirPath))) continue

      const files = await readdir(dirPath, { withFileTypes: true })
      for (const file of files) {
        if (file.isDirectory()) continue

        // MVI Principle: Match tags or load core standards
        const match = tags.some((tag) => file.name.includes(tag)) || dir === "core"
        if (!match) continue

        const content = await Filesystem.readText(path.join(dirPath, file.name))
        items.push({
          name: `${dir}/${file.name}`,
          content: TokenOptimizer.optimize(content, 4000),
        })
      }
    }

    // Load Team Patterns
    const teamPatterns = await TeamPatterns.list(root)
    for (const pattern of teamPatterns) {
      items.push({
        name: `patterns/${pattern.name}`,
        content: `${pattern.description}\n\n${pattern.content}`,
      })
    }

    return items
  }
}
