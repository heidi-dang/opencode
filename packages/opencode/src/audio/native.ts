import path from "node:path"
import { playNodeAudio } from "./player-node"
import { playTerminalBell } from "./player-terminal"

const files = {
  "turn.start": "bip-bop-01.aac",
  "turn.complete": "yup-02.aac",
  "turn.error": "nope-03.aac",
  "tool.start": "bip-bop-03.aac",
  "tool.finish": "yup-04.aac",
  "tool.error": "nope-05.aac",
  "tool.chain": "staplebops-02.aac",
  "plan.ready": "alert-02.aac",
  "attention.permission": "alert-05.aac",
  "attention.question": "alert-07.aac",
  "status.retry": "alert-09.aac",
} as const

function asset(cue: keyof typeof files) {
  return path.resolve(import.meta.dir, "../../ui/src/assets/audio", files[cue])
}

export async function playNativeCue(cue: keyof typeof files) {
  // Check OPENCODE_AUDIO_ENABLED env or config
  if (process.env.OPENCODE_AUDIO_ENABLED === "0") return false
  // Optionally: check config.audio.enabled if passed in future
  const target = asset(cue)
  const file = Bun.file(target)
  if (await file.exists()) {
    const ok = await playNodeAudio(target)
    if (ok) return true
  }
  return playTerminalBell()
}