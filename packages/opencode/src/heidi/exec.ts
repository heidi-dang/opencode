import path from "path"
import { spawn } from "child_process"
import { Filesystem } from "@/util/filesystem"
import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"
import { Instance } from "@/project/instance"

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
  return false
}

function inside(cwd: string) {
  return Instance.containsPath(cwd)
}

export namespace HeidiExec {
  export async function checkpoint(sessionID: SessionID, step: string, files: string[]) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
    state.checkpoints.push({
      id,
      step_id: step,
      files,
      created_at: now(),
    })
    state.resume.checkpoint_id = id
    await HeidiState.write(sessionID, state)
    await HeidiState.updateResume(sessionID)
    return id
  }

  export async function rollback(sessionID: SessionID, id: string) {
    const data = await Filesystem.readJson<{ files: { file: string; exists: boolean; content: string }[] }>(
      path.join(dir(sessionID), `${id}.json`),
    )
    await Promise.all(
      data.files.map(async (item) => {
        if (!item.exists) {
          if (await Filesystem.exists(item.file)) await Bun.file(item.file).delete()
          return
        }
        await Filesystem.write(item.file, item.content)
      }),
    )
  }

  export async function changed(sessionID: SessionID, files: string[]) {
    const state = await HeidiState.ensure(sessionID, "")
    state.changed_files = Array.from(new Set([...state.changed_files, ...files]))
    state.active_files = files
    await HeidiState.write(sessionID, state)
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
    if (!inside(input.cwd)) throw new Error(`cwd outside workspace boundary: ${input.cwd}`)
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
    return {
      code,
      out,
      ms: Date.now() - start,
    }
  }
}
