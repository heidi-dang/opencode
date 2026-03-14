import { Filesystem } from "../../util/filesystem"
import * as path from "path"
import { mkdir, readdir } from "fs/promises"
import { Instance } from "../../project/instance"
import { Log } from "../../util/log"

export interface Pattern {
  name: string
  description: string
  content: string
  updatedAt: number
  author?: string
}

export class TeamPatterns {
  private static log = Log.create({ service: "team.patterns" })

  static async sync(root: string): Promise<void> {
    const patternDir = path.join(root, ".opencode", "patterns")
    await mkdir(patternDir, { recursive: true }).catch(() => {})
    
    // In a real scenario, this might involve git pull or fetching from a remote
    this.log.info("Syncing team patterns", { patternDir })
  }

  static async list(root: string): Promise<Pattern[]> {
    const patternDir = path.join(root, ".opencode", "patterns")
    if (!(await Filesystem.exists(patternDir))) return []

    const files = await readdir(patternDir)
    const patterns: Pattern[] = []

    for (const file of files) {
      if (!file.endsWith(".json")) continue
      const content = await Filesystem.readJson(path.join(patternDir, file)).catch(() => null)
      if (content) patterns.push(content as Pattern)
    }

    return patterns
  }

  static async register(root: string, pattern: Pattern): Promise<void> {
    const patternDir = path.join(root, ".opencode", "patterns")
    await mkdir(patternDir, { recursive: true }).catch(() => {})
    
    const filePath = path.join(patternDir, `${pattern.name.toLowerCase().replace(/\s+/g, "-")}.json`)
    await Filesystem.writeJson(filePath, {
      ...pattern,
      updatedAt: Date.now()
    }, 0o644)
    
    this.log.info("Registered team pattern", { name: pattern.name })
  }
}
