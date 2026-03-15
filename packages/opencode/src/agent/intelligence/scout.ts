import { Filesystem } from "../../util/filesystem"
import * as path from "path"
import { readdir } from "fs/promises"
import { Global } from "../../global"

export interface ProjectPatterns {
  stack: string[]
  conventions: string[]
  dirs: string[]
  workspaces?: string[]
  testing?: string[]
  ci?: string[]
}

export class ContextScout {
  static async discover(root: string): Promise<ProjectPatterns> {
    const patterns: ProjectPatterns = {
      stack: [],
      conventions: [],
      dirs: [],
      testing: [],
      ci: []
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
    if (deps["solid-js"]) patterns.stack.push("solidjs")
    if (deps.tailwindcss) patterns.stack.push("tailwind")
    if (deps["drizzle-orm"]) patterns.stack.push("drizzle")
    if (deps["@prisma/client"] || deps.prisma) patterns.stack.push("prisma")
    if (deps.knex) patterns.stack.push("knex")
    if (deps.typeorm) patterns.stack.push("typeorm")

    // Detect Testing
    if (deps.jest) patterns.testing?.push("jest")
    if (deps.vitest) patterns.testing?.push("vitest")
    if (deps["@playwright/test"]) patterns.testing?.push("playwright")
    if (deps.cypress) patterns.testing?.push("cypress")
    if (deps.mocha) patterns.testing?.push("mocha")
    if (deps.bun || deps["@types/bun"]) patterns.testing?.push("bun")

    // Detect Conventions
    if (await Filesystem.exists(path.join(root, "tsconfig.json"))) patterns.conventions.push("tsconfig")
    if (await Filesystem.exists(path.join(root, ".eslintrc.json")) || await Filesystem.exists(path.join(root, ".eslintrc.js"))) patterns.conventions.push("eslint")
    if (await Filesystem.exists(path.join(root, "biome.json"))) patterns.conventions.push("biome")
    if (await Filesystem.exists(path.join(root, "turbo.json"))) patterns.conventions.push("turborepo")

    // Detect Workspaces
    if (pkg.workspaces) {
      patterns.workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages
    }

    // Detect CI
    if (await Filesystem.exists(path.join(root, ".github/workflows"))) patterns.ci?.push("github-actions")
    if (await Filesystem.exists(path.join(root, ".gitlab-ci.yml"))) patterns.ci?.push("gitlab-ci")

    // Important Dirs
    const list = await readdir(root, { withFileTypes: true })
    for (const item of list) {
      if (item.isDirectory() && ["src", "packages", "apps", "lib", "test", "tests"].includes(item.name)) {
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
