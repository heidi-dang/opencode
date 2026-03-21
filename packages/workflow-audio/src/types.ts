export const cue_ids = [
  "turn.start",
  "turn.complete",
  "turn.error",
  "tool.start",
  "tool.finish",
  "tool.error",
  "tool.chain",
  "plan.ready",
  "attention.permission",
  "attention.question",
  "status.retry",
] as const

export const pack_ids = ["minimal-pro", "cyber-ops", "classic-rts"] as const

export const category_ids = ["turn", "tool", "planner", "attention", "error", "status"] as const

export const source_ids = ["session.status", "tool.state", "todo.updated", "permission.asked", "question.asked"] as const

export type CueID = (typeof cue_ids)[number]
export type PackID = (typeof pack_ids)[number]
export type CategoryID = (typeof category_ids)[number]
export type SourceID = (typeof source_ids)[number]

export type WorkflowAudioMeta = {
  priority: number
  cooldown: number
  category: CategoryID
}

export type RuntimeInput =
  | {
      source: "session.status"
      time: number
      sessionID: string
      status: "idle" | "busy" | "retry"
      attempt?: number
    }
  | {
      source: "tool.state"
      time: number
      sessionID: string
      messageID: string
      partID: string
      callID: string
      tool: string
      status: "pending" | "running" | "completed" | "error"
    }
  | {
      source: "todo.updated"
      time: number
      sessionID: string
      open: number
    }
  | {
      source: "permission.asked"
      time: number
      sessionID: string
      permission: string
    }
  | {
      source: "question.asked"
      time: number
      sessionID: string
      count: number
    }