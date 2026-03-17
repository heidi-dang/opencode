import fs from "fs/promises"
import path from "path"
import { Global } from "../global"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"
import { BEST_PERFORMANCE_CONFIG } from "./defaults"
import { Log } from "../util/log"
import * as prompts from "@clack/prompts"
import { UI } from "../cli/ui"

const log = Log.create({ service: "sanitize" })

export namespace Sanitize {
  const WHITELIST = ["agent", "agents", "command", "commands", "tool", "tools", "theme", "themes", "knowledge", "pattern", "patterns", "glossary", "blueprint", "blueprints"]
  const SKIP_LIST = ["context", "rag", "runs", "schemas", "node_modules", "package.json", "bun.lock", "infinity.log", "queue.json"]
  const NORMALIZATION_MAP: Record<string, string> = {
    agent: "agents",
    command: "commands",
    tool: "tools",
    theme: "themes",
    pattern: "patterns",
    blueprint: "blueprints",
  }

  interface SanitizeSummary {
    purged: string[]
    synced: string[]
    skipped: string[]
  }

  export async function run() {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const root = Instance.worktree
        const localOpencode = path.join(root, ".opencode")
        const globalRoot = path.join(Global.Path.config)
        const globalConfigPath = path.join(globalRoot, "opencode.json")

        const summary: SanitizeSummary = {
          purged: [],
          synced: [],
          skipped: [],
        }

        // 1. Purge redundant configs
        const purgePatterns = [
          path.join(root, "opencode.json"),
          path.join(root, "opencode.jsonc"),
          path.join(localOpencode, "opencode.json"),
          path.join(localOpencode, "opencode.jsonc"),
          path.join(globalRoot, "opencode.jsonc"), // Remove global jsonc to favor json
        ]

        for (const file of purgePatterns) {
          if (await Filesystem.exists(file)) {
            await fs.rm(file, { force: true })
            summary.purged.push(path.relative(root, file))
            log.info("purged config", { file })
          }
        }

        // 2. Selective Sync & Normalization
        if (await Filesystem.exists(localOpencode)) {
          const entries = await fs.readdir(localOpencode, { withFileTypes: true })
          for (const entry of entries) {
            if (SKIP_LIST.includes(entry.name)) {
              summary.skipped.push(entry.name)
              continue
            }

            if (WHITELIST.includes(entry.name)) {
              const sourcePath = path.join(localOpencode, entry.name)
              const targetDirName = NORMALIZATION_MAP[entry.name] || entry.name
              const targetPath = path.join(globalRoot, targetDirName)

              if (entry.isDirectory()) {
                await fs.mkdir(targetPath, { recursive: true })
                await copySelective(sourcePath, targetPath)
                summary.synced.push(`${entry.name} -> ${targetDirName}`)
              }
            }
          }
        }

        // 3. Install Elite Global Config
        await fs.mkdir(globalRoot, { recursive: true })
        await Filesystem.writeJson(globalConfigPath, BEST_PERFORMANCE_CONFIG)
        log.info("installed elite global config", { path: globalConfigPath })

        printSummary(summary)
      },
    })
  }

  async function copySelective(src: string, dest: string) {
    const entries = await fs.readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.name === "opencode.json" || entry.name === "opencode.jsonc" || entry.name === "node_modules") {
        continue
      }

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true })
        await copySelective(srcPath, destPath)
      } else {
        // Deterministic: Local wins
        await fs.copyFile(srcPath, destPath)
        UI.println(`    ${UI.Style.TEXT_SUCCESS}✔${UI.Style.TEXT_NORMAL} Synced ${entry.name} to global`)
        log.debug("synced file", { from: srcPath, to: destPath })
      }
    }
  }

  function printSummary(s: SanitizeSummary) {
    UI.empty()
    const orange = "\x1b[38;5;214m"
    const reset = "\x1b[0m"
    const dim = "\x1b[2m"

    UI.println(`${orange}Elite Sanitize Summary${reset}`)
    if (s.purged.length) UI.println(`  ${UI.Style.TEXT_DANGER}Purged:${reset}  ${s.purged.join(", ")}`)
    if (s.synced.length) UI.println(`  ${UI.Style.TEXT_SUCCESS}Synced:${reset}  ${s.synced.join(", ")}`)
    if (s.skipped.length) UI.println(`  ${dim}Skipped:${reset} ${s.skipped.join(", ")}`)
    UI.println(`  ${UI.Style.TEXT_INFO}Built:${reset}   Elite global configuration installed at ~/.config/opencode/`)
    UI.empty()
  }
}
