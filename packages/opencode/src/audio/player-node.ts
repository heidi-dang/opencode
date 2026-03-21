import { spawn } from "node:child_process"
import { which } from "@/util/which"

function run(cmd: string, args: string[]) {
  return new Promise<boolean>((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: "ignore",
      detached: false,
    })
    proc.on("error", () => resolve(false))
    proc.on("exit", (code) => resolve(code === 0))
  })
}

export async function playNodeAudio(file: string) {
  if (process.platform === "darwin") {
    const cmd = which("afplay")
    if (cmd) return run(cmd, [file])
  }

  if (process.platform === "linux") {
    for (const [cmd, args] of [
      ["paplay", [file]],
      ["aplay", [file]],
      ["ffplay", ["-nodisp", "-autoexit", file]],
    ] as const) {
      const hit = which(cmd)
      if (!hit) continue
      return run(hit, [...args])
    }
  }

  if (process.platform === "win32") {
    const cmd = which("powershell") ?? which("pwsh")
    if (cmd) {
      return run(cmd, ["-NoProfile", "-Command", `(New-Object Media.SoundPlayer '${file.replace(/'/g, "''")}').PlaySync()`])
    }
  }

  return false
}