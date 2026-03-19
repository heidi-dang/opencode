import path from "path"
import { spawn } from "child_process"
import { Filesystem } from "@/util/filesystem"
import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"
import { Instance } from "@/project/instance"
import { FileTime } from "../file/time"

import { git } from "@/util/git"

import { HeidiJail } from "./jail"

const Profile = ["read_only", "build", "test", "format", "git_safe", "app_local"] as const

type Profile = (typeof Profile)[number]

function now() {
  return new Date().toISOString()
}

function dir(sessionID: SessionID) {
  return path.join(path.dirname(HeidiState.plan(sessionID)), "checkpoints")
}

function block(cmd: string) {
  return /(\brm\b|\bmv\b|\bcp\b|\bmkdir\b|\btouch\b|\bchmod\b|\bchown\b|\bgit\s+reset\b|\bgit\s+clean\b)/.test(cmd)
}

function deny(profile: Profile, cmd: string) {
  if (profile === "read_only") return block(cmd) || cmd.includes(">") || /\btee\b/.test(cmd)
  if (profile === "git_safe") return /(\bgit\s+push\s+--force\b|\bgit\s+reset\s+--hard\b)/.test(cmd)
  if (profile === "format") return /(\bgit\s+reset\b|\bgit\s+clean\b)/.test(cmd)
  if (profile === "test") return /(\bchmod\b|\bchown\b|\bgit\s+reset\b)/.test(cmd)
  if (profile === "build") return /(\brm\s+-rf\s+\/|\bchmod\b)/.test(cmd)
  return false
}

async function pick(sessionID: SessionID, id?: string) {
  if (id) return id
  const state = await HeidiState.read(sessionID)
  return state.resume.checkpoint_id ?? undefined
}

export namespace HeidiExec {
  export async function checkpoint(sessionID: SessionID, step: string, files: string[]) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const step_id = typeof step === "string" && step.length > 0 ? step : "unknown"
    const worktree = Instance.worktree

    // Try Git-based checkpoint (hidden ref)
    if (Instance.project.vcs === "git") {
      const g = (args: string[]) => git(args, { cwd: worktree })
      
      // Capture EVERYTHING (including untracked)
      await g(["add", "-A"])
      const stash = await g(["stash", "create"])
      // Always reset index back to clean state
      await g(["reset", "."])

      if (stash.exitCode === 0 && stash.text().trim()) {
        const sha = stash.text().trim()
        const ref = `refs/heidi/checkpoints/${sessionID}/${id}`
        await g(["update-ref", ref, sha])
        
        const state = await HeidiState.ensure(sessionID, "")
          state.checkpoints.push({ id, step_id, files, created_at: now() })
        state.resume.checkpoint_id = id
        await HeidiState.write(sessionID, state)
        return id
      }
    }

    // Fallback to JSON snapshot
    const out = path.join(dir(sessionID), `${id}.json`)
    const snap = await Promise.all(
      files.map(async (file) => {
        const exists = await Filesystem.exists(file)
        const content = exists ? await Filesystem.readText(file) : ""
        return { file, exists, content }
      }),
    )
    await Filesystem.writeJson(out, { id, step, files: snap, time: now() })
    const state = await HeidiState.ensure(sessionID, "")
      state.checkpoints.push({ id, step_id, files, created_at: now() })
    state.resume.checkpoint_id = id
    await HeidiState.write(sessionID, state)
    return id
  }

  export async function rollback(sessionID: SessionID, id?: string) {
    const item = await pick(sessionID, id)
    if (!item) return
    const worktree = Instance.worktree
    const g = (args: string[]) => git(args, { cwd: worktree })
    const ref = `refs/heidi/checkpoints/${sessionID}/${item}`

    // Try Git rollback
    if (Instance.project.vcs === "git") {
      const check = await g(["rev-parse", "--verify", ref])
      if (check.exitCode === 0) {
        // Find files that will be reverted
        const diff = await g(["diff", "--name-only", ref, "HEAD"])
        const files = diff.text().trim().split("\n").filter(Boolean)

        // Restore files from the hidden ref
        await g(["checkout", ref, "--", "."])
        // Remove files that were added after the checkpoint
        await g(["clean", "-fd"])

        // Refresh file times
        await Promise.all(
          files.map((file: string) => {
            const filepath = path.isAbsolute(file) ? file : path.join(worktree, file)
            return FileTime.read(sessionID, filepath)
          }),
        )
        return
      }
    }

    // Fallback to JSON rollback
    const p = path.join(dir(sessionID), `${item}.json`)
    if (await Filesystem.exists(p)) {
      const data = await Filesystem.readJson<{ files: { file: string; exists: boolean; content: string }[] }>(p)
      await Promise.all(
        data.files.map(async (item) => {
          if (!item.exists) {
            if (await Filesystem.exists(item.file)) await Bun.file(item.file).delete()
            return
          }
          await Filesystem.write(item.file, item.content)
          await FileTime.read(sessionID, item.file)
        }),
      )
    }
  }

  export async function changed(sessionID: SessionID, files: string[]) {
    const state = await HeidiState.ensure(sessionID, "")
    state.changed_files = Array.from(new Set([...state.changed_files, ...files]))
    state.active_files = files
    await HeidiState.write(sessionID, state)
  }

  export async function begin(sessionID: SessionID, name: string, files: string[]) {
    return checkpoint(sessionID, `transaction:${name}`, files)
  }

  export async function commit(sessionID: SessionID) {
    const state = await HeidiState.read(sessionID)
    state.resume.checkpoint_id = checkpointId ?? null
    await HeidiState.write(sessionID, state)
    await HeidiState.updateResume(sessionID)
  }

  export async function cmd(
    sessionID: SessionID,
    input: {
      cmd: string
      cwd: string
      profile: string
      timeout: number
    },
  ) {
    const profile = (Profile.includes(input.profile as Profile) ? input.profile : "app_local") as Profile
    if (deny(profile, input.cmd)) throw new Error(`Command denied by profile ${profile}`)
    HeidiJail.assert(input.cwd)
    const start = Date.now()
    const proc = spawn(input.cmd, {
      shell: true,
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })
    let out = ""
    proc.stdout?.on("data", (buf) => (out += buf.toString()))
    proc.stderr?.on("data", (buf) => (out += buf.toString()))
    const kill = setTimeout(() => proc.kill("SIGTERM"), input.timeout)
    await new Promise<void>((resolve, reject) => {
      proc.on("error", reject)
      proc.on("exit", () => resolve())
    }).finally(() => clearTimeout(kill))

    const state = await HeidiState.ensure(sessionID, "")
    state.commands.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cmd: input.cmd,
      cwd: input.cwd,
      profile,
      exit_code: proc.exitCode ?? 1,
      timestamp: now(),
    })
    const code = proc.exitCode ?? 1
    if (code !== 0) {
      const checkpoint = state.resume.checkpoint_id
      if (checkpoint) {
        await rollback(sessionID, checkpoint)
      }
    }
    await HeidiState.write(sessionID, state)
    await HeidiState.updateResume(sessionID)
    return {
      code,
      out,
      ms: Date.now() - start,
    }
  }
}
