import type { CueID, PackID, WorkflowAudioMeta } from "./types"

export const cue_meta: Record<CueID, WorkflowAudioMeta> = {
  "turn.start": { priority: 30, cooldown: 200, category: "turn" },
  "turn.complete": { priority: 50, cooldown: 500, category: "turn" },
  "turn.error": { priority: 90, cooldown: 700, category: "error" },
  "tool.start": { priority: 35, cooldown: 120, category: "tool" },
  "tool.finish": { priority: 40, cooldown: 160, category: "tool" },
  "tool.error": { priority: 85, cooldown: 400, category: "error" },
  "tool.chain": { priority: 60, cooldown: 1200, category: "tool" },
  "plan.ready": { priority: 55, cooldown: 1200, category: "planner" },
  "attention.permission": { priority: 95, cooldown: 800, category: "attention" },
  "attention.question": { priority: 92, cooldown: 800, category: "attention" },
  "status.retry": { priority: 70, cooldown: 1200, category: "status" },
}

export const default_pack: PackID = "minimal-pro"

export const default_audio = {
  enabled: true,
  pack: default_pack,
  volume: 70,
  debug: false,
}