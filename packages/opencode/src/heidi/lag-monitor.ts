import { Database } from "bun:sqlite"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { git } from "@/util/git"

const log = Log.create({ service: "heidi.lag-monitor" })

export namespace HeidiLagMonitor {
  function dbPath() {
    return path.join(Instance.worktree, ".opencode", "heidi", "index.sqlite")
  }

  // Get the last indexed commit from the index metadata
  async function getLastIndexedCommit(): Promise<string | null> {
    try {
      const metaPath = path.join(Instance.worktree, ".opencode", "heidi", "meta.json")
      if (!(await Filesystem.exists(metaPath))) return null
      const meta = JSON.parse(await Filesystem.readText(metaPath))
      return meta.last_indexed_commit || null
    } catch {
      return null
    }
  }

  // Save the current commit as last indexed
  async function saveLastIndexedCommit(commit: string) {
    const metaPath = path.join(Instance.worktree, ".opencode", "heidi", "meta.json")
    const meta = { last_indexed_commit: commit, updated_at: Date.now() }
    await Filesystem.writeJson(metaPath, meta)
  }

  // Check if index is behind current HEAD
  export async function checkLag(): Promise<{
    isBehind: boolean
    lagCommits: number
    lastIndexedCommit?: string
    currentCommit: string
  }> {
    try {
      // Get current HEAD commit
      const headResult = await git(["rev-parse", "HEAD"], { cwd: Instance.worktree })
      if (headResult.exitCode !== 0) {
        return { isBehind: false, lagCommits: 0, currentCommit: "unknown" }
      }
      const currentCommit = headResult.text().trim()

      // Get last indexed commit
      const lastCommit = await getLastIndexedCommit()

      if (!lastCommit) {
        return { isBehind: true, lagCommits: -1, currentCommit }
      }

      // Count commits between last indexed and current
      const countResult = await git(
        ["rev-list", "--count", `${lastCommit}..${currentCommit}`],
        { cwd: Instance.worktree },
      )

      const lagCommits = countResult.exitCode === 0 ? parseInt(countResult.text().trim()) : 0

      return {
        isBehind: lagCommits > 0,
        lagCommits,
        lastIndexedCommit: lastCommit,
        currentCommit,
      }
    } catch (e) {
      log.error("Failed to check index lag", { error: e })
      return { isBehind: false, lagCommits: 0, currentCommit: "unknown" }
    }
  }

  // Update the index and save current commit
  export async function updateIndex() {
    try {
      const headResult = await git(["rev-parse", "HEAD"], { cwd: Instance.worktree })
      if (headResult.exitCode !== 0) return

      const currentCommit = headResult.text().trim()
      await saveLastIndexedCommit(currentCommit)
      log.info("Updated index lag monitor", { commit: currentCommit })
    } catch (e) {
      log.error("Failed to update index metadata", { error: e })
    }
  }

  // Doctor check function
  export async function doctorCheck(): Promise<{
    healthy: boolean
    message: string
  }> {
    const lag = await checkLag()

    if (!lag.isBehind) {
      return { healthy: true, message: "Index is up to date" }
    }

    if (lag.lagCommits === -1) {
      return {
        healthy: false,
        message: "Index has never been built. Run 'opencode heidi index' to build it.",
      }
    }

    return {
      healthy: false,
      message: `Index is ${lag.lagCommits} commit(s) behind HEAD. Consider re-indexing.`,
    }
  }
}
