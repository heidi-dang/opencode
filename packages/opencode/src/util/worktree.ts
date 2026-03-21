import { git } from "./git"
import { Instance } from "../project/instance"
import path from "node:path"
import os from "node:os"

export namespace Worktree {
  /**
   * Create a new git worktree for a specific task.
   * Returns the absolute path and branch name of the new worktree.
   */
  export async function add(name: string, root: string = Instance.worktree) {
    const branch = `task/${name}`
    const worktreePath = path.join(os.tmpdir(), `${name}-task-${process.pid}`)

    // Ensure the branch exists or create it
    // If it exists, we just use it (assuming it's a retry or related)
    await git(["branch", branch], { cwd: root })

    const result = await git(["worktree", "add", worktreePath, branch], { cwd: root })
    if (result.exitCode !== 0) {
      // If the worktree already exists, we can still use it
      if (result.stderr.toString().includes("already exists")) {
        return { path: worktreePath, branch }
      }
      throw new Error(`Failed to create worktree at ${worktreePath}: ${result.stderr.toString()}`)
    }

    return { path: worktreePath, branch }
  }

  /**
   * Remove a git worktree and its associated branch.
   */
  export async function remove(worktreePath: string, root: string = Instance.worktree) {
    const list = await Worktree.list(root)
    const match = list.find((w) => w.path === worktreePath)
    
    const result = await git(["worktree", "remove", "--force", worktreePath], { cwd: root })
    if (result.exitCode !== 0) {
      if (!result.stderr.toString().includes("not a worktree")) {
         throw new Error(`Failed to remove worktree at ${worktreePath}: ${result.stderr.toString()}`)
      }
    }

    if (match?.branch && match.branch.startsWith("task/")) {
      await git(["branch", "-D", match.branch], { cwd: root })
    }
  }

  /**
   * List all current worktrees for the repository.
   */
  export async function list(root: string = Instance.worktree): Promise<{ path: string; branch: string }[]> {
    const result = await git(["worktree", "list", "--porcelain"], { cwd: root })
    if (result.exitCode !== 0) return []

    const lines = result.text().split("\n")
    const worktrees: { path: string; branch: string }[] = []
    let current: Partial<{ path: string; branch: string }> = {}

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        current.path = line.substring(9).trim()
      } else if (line.startsWith("branch ")) {
        current.branch = line.substring(7).replace("refs/heads/", "").trim()
      } else if (line === "" && current.path) {
        if (current.branch) {
           worktrees.push(current as { path: string; branch: string })
        }
        current = {}
      }
    }

    return worktrees
  }
}
