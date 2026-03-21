import type { CueID, PackID } from "./types"

export type PackPreviewCue = {
  event: string
  file: string
  purpose: string
}

export const pack_labels: Record<PackID, string> = {
  "minimal-pro": "Minimal Pro",
  "cyber-ops": "Cyber Ops",
  "classic-rts": "Classic RTS",
}

export const pack_files: Record<PackID, Record<CueID, string>> = {
  "minimal-pro": {
    "turn.start": "wake_chirp.wav",
    "turn.complete": "resolve_up.wav",
    "turn.error": "hard_stop.wav",
    "tool.start": "tick_in.wav",
    "tool.finish": "tick_out.wav",
    "tool.error": "warn_fall.wav",
    "tool.chain": "combo_3_resolve.wav",
    "plan.ready": "plan_mark.wav",
    "attention.permission": "attention_bell.wav",
    "attention.question": "attention_bell.wav",
    "status.retry": "glitch_triplet.wav",
  },
  "cyber-ops": {
    "turn.start": "turn.start.aac",
    "turn.complete": "turn.complete.aac",
    "turn.error": "turn.error.aac",
    "tool.start": "tool.start.aac",
    "tool.finish": "tool.finish.aac",
    "tool.error": "tool.error.aac",
    "tool.chain": "tool.chain.aac",
    "plan.ready": "plan.ready.aac",
    "attention.permission": "attention.permission.aac",
    "attention.question": "attention.question.aac",
    "status.retry": "status.retry.aac",
  },
  "classic-rts": {
    "turn.start": "turn.start.aac",
    "turn.complete": "turn.complete.aac",
    "turn.error": "turn.error.aac",
    "tool.start": "tool.start.aac",
    "tool.finish": "tool.finish.aac",
    "tool.error": "tool.error.aac",
    "tool.chain": "tool.chain.aac",
    "plan.ready": "plan.ready.aac",
    "attention.permission": "attention.permission.aac",
    "attention.question": "attention.question.aac",
    "status.retry": "status.retry.aac",
  },
}

export const pack_preview: Record<PackID, PackPreviewCue[]> = {
  "minimal-pro": [
    { event: "agent.start", file: "wake_chirp.wav", purpose: "AI woke up and locked on." },
    { event: "agent.idle", file: "idle_glow.wav", purpose: "Controlled quiet standby settle." },
    { event: "tool.start", file: "tick_in.wav", purpose: "Dry tactile tool start click." },
    { event: "tool.done", file: "tick_out.wav", purpose: "Precise tool finish click." },
    { event: "plan.ready", file: "plan_mark.wav", purpose: "Two-step checkpoint ready cue." },
    { event: "heartbeat", file: "pulse_soft.wav", purpose: "Quiet low-fatigue life pulse." },
    { event: "needs.input", file: "attention_bell.wav", purpose: "Immediate human attention bell." },
    { event: "warning", file: "warn_fall.wav", purpose: "Restrained caution fall." },
    { event: "blocked", file: "hard_stop.wav", purpose: "Definite workflow barrier cue." },
    { event: "loop.detected", file: "glitch_triplet.wav", purpose: "Irregular repetition diagnostic." },
    { event: "success", file: "resolve_up.wav", purpose: "Polished upward completion cue." },
    { event: "combo.1", file: "combo_1_soft.wav", purpose: "Subtle first-chain momentum cue." },
    { event: "combo.2", file: "combo_2_rise.wav", purpose: "Brighter second-step rise." },
    { event: "combo.3", file: "combo_3_resolve.wav", purpose: "Layered autonomous streak resolve." },
    { event: "combo.max", file: "bravo_max.wav", purpose: "Rare prestige hero finish cue." },
  ],
  "cyber-ops": [],
  "classic-rts": [],
}

export function pack_src(pack: PackID, cue: CueID) {
  return `/audio/${pack}/${pack_files[pack][cue]}`
}