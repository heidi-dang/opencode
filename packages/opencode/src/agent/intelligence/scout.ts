import { Filesystem } from "../../util/filesystem"
import * as path from "path"
import { readdir } from "fs/promises"
import { Global } from "../../global"

export interface ProjectPatterns {
  stack: string[]
  conventions: string[]
  dirs: string[]
}

export class ContextScout {
  static async discover(root: string): Promise<ProjectPatterns> {
    const patterns: ProjectPatterns = {
      stack: [],
      conventions: [],
      dirs: []
    }

    const pkg = (await Filesystem.readJson(
      path.join(root, "package.json")
    ).catch(() => ({}))) as any

    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    // Detect Stack
    if (deps.typescript) patterns.stack.push("typescript")
    if (deps.vite) patterns.stack.push("vite")
    if (deps.next) patterns.stack.push("nextjs")
    if (deps.react) patterns.stack.push("react")
    if (deps.solid) patterns.stack.push("solidjs")
    if (deps.tailwindcss) patterns.stack.push("tailwind")
    if (deps.drizzle) patterns.stack.push("drizzle")

    // Detect Conventions
    if (await Filesystem.exists(path.join(root, "tsconfig.json"))) patterns.conventions.push("tsconfig")
    if (await Filesystem.exists(path.join(root, ".eslintrc"))) patterns.conventions.push("eslint")
    if (await Filesystem.exists(path.join(root, "biome.json"))) patterns.conventions.push("biome")

    // Important Dirs
    const list = await readdir(root, { withFileTypes: true })
    for (const item of list) {
      if (item.isDirectory() && ["src", "packages", "apps", "lib"].includes(item.name)) {
        patterns.dirs.push(item.name)
      }
    }

    return patterns
  }

  static async persist(root: string, patterns: ProjectPatterns) {
    const dir = path.join(root, ".opencode", "context", "project-intelligence")
    await Filesystem.writeJson(path.join(dir, "tech-stack.json"), patterns, 0o644)
  }
}
