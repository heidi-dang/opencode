import path from "node:path"
import { Filesystem } from "../util/filesystem"
import { Log } from "../util/log"
import { Config } from "../config/config"
import { git } from "../util/git"

export type UiSource = 
  | { type: "dev-url"; origin: string }
  | { type: "dist"; path: string }
  | { type: "repo-dist"; path: string }
  | { type: "hosted"; origin: string }

export class UiSourceResolver {
  private static readonly log = Log.create({ service: "ui-resolver" })

  static async resolve(opts: {
    uiDevUrl?: string
    uiDist?: string
    config?: Config.Info
  }): Promise<{ source: UiSource; reason: string }> {
    const config = opts.config?.server

    // 1. Explicit CLI --ui-dev-url
    if (opts.uiDevUrl) {
      if (await this.isReachable(opts.uiDevUrl)) {
        return { 
          source: { type: "dev-url", origin: opts.uiDevUrl }, 
          reason: "CLI flag --ui-dev-url" 
        }
      }
      this.log.error(`!! Explicitly requested CLI --ui-dev-url "${opts.uiDevUrl}" is unreachable.`, {
        action: "Falling back to next available source"
      })
    }

    // 2. Config server.uiDevUrl (Persistent override)
    const configDevUrl = config?.uiDevUrl || process.env.OPENCODE_UI_DEV_URL
    if (configDevUrl) {
      if (await this.isReachable(configDevUrl)) {
        return { 
          source: { type: "dev-url", origin: configDevUrl }, 
          reason: "explicit uiDevUrl" 
        }
      }
      this.log.warn(`Config server.uiDevUrl "${configDevUrl}" is unreachable.`, {
        action: "Falling back to next available source"
      })
    }

    // 3. Explicit CLI --ui-dist
    if (opts.uiDist) {
      const fullPath = path.resolve(opts.uiDist)
      if (await this.isValidDist(fullPath)) {
        return { 
          source: { type: "dist", path: fullPath }, 
          reason: "explicit uiDist"
        }
      }
      this.log.error(`!! Explicitly requested CLI --ui-dist "${opts.uiDist}" is invalid (missing index.html).`, {
        path: fullPath,
        action: "Falling back to next available source"
      })
    }

    // 4. Config server.uiDist (Persistent config)
    if (config?.uiDist) {
      const fullPath = path.resolve(config.uiDist)
      if (await this.isValidDist(fullPath)) {
        return { 
          source: { type: "dist", path: fullPath }, 
          reason: "explicit uiDist"
        }
      }
      this.log.warn(`Config server.uiDist "${config.uiDist}" is invalid (missing index.html).`, {
        path: fullPath,
        action: "Falling back to next available source"
      })
    }

    // 5. Auto-detect repo-local packages/app/dist
    const repoDist = await this.detectRepoDist()
    if (repoDist) {
      return { 
        source: { type: "repo-dist", path: repoDist }, 
        reason: "auto-detected local build" 
      }
    }

    // 6. Hosted fallback
    this.log.info("No valid local UI source detected; using hosted fallback.")
    return { 
      source: { type: "hosted", origin: "https://app.opencode.ai" }, 
      reason: "no valid local UI source found" 
    }
  }

  private static async isReachable(url: string): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 1000)
      const res = await fetch(url, { method: "HEAD", signal: controller.signal })
      clearTimeout(timeout)
      // Any server response (even 404/500) counts as reachable for a dev origin
      return true
    } catch {
      return false
    }
  }

  private static async isValidDist(dir: string): Promise<boolean> {
    if (!(await Filesystem.isDir(dir))) return false
    return Filesystem.exists(path.join(dir, "index.html"))
  }

  private static async detectRepoDist(): Promise<string | undefined> {
    try {
      const res = await git(["rev-parse", "--show-toplevel"], { cwd: process.cwd() })
      if (res.exitCode === 0) {
        const root = res.text().trim()
        const dist = path.join(root, "packages", "app", "dist")
        if (await this.isValidDist(dist)) {
          return dist
        }
      }
    } catch {
      // Ignore
    }
    return undefined
  }
}
