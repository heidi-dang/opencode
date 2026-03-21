import { combo } from "./combo"
import { cue_meta } from "./defaults"
import type { WorkflowAudioEvent } from "./events"
import type { RuntimeInput } from "./types"

type Session = {
  status?: "idle" | "busy" | "retry"
  retry?: number
  open?: number
  tools: Map<string, string>
  burst?: { count: number; time: number }
}

function create_session(): Session {
  return {
    tools: new Map(),
  }
}

export function create_audio_machine() {
  const sessions = new Map<string, Session>()

  const get = (sessionID: string) => {
    const hit = sessions.get(sessionID)
    if (hit) return hit
    const next = create_session()
    sessions.set(sessionID, next)
    return next
  }

  const emit = (
    cue: keyof typeof cue_meta,
    input: RuntimeInput,
    extra?: Partial<WorkflowAudioEvent>,
  ): WorkflowAudioEvent => ({
    id: [input.source, input.sessionID, cue, input.time, extra?.combo ?? ""].join(":"),
    cue,
    source: input.source,
    category: cue_meta[cue].category,
    priority: cue_meta[cue].priority,
    time: input.time,
    sessionID: input.sessionID,
    ...extra,
  })

  return {
    accept(input: RuntimeInput) {
      const state = get(input.sessionID)

      if (input.source === "session.status") {
        if (input.status === "busy" && state.status !== "busy") {
          state.status = "busy"
          return [emit("turn.start", input, { dedupe: `${input.sessionID}:busy` })]
        }

        if (input.status === "idle") {
          const cue = state.status === "retry" ? "turn.complete" : state.status === "busy" ? "turn.complete" : undefined
          state.status = "idle"
          state.retry = undefined
          if (!cue) return []
          return [emit(cue, input, { dedupe: `${input.sessionID}:idle` })]
        }

        if (state.retry === input.attempt) return []
        state.status = "retry"
        state.retry = input.attempt
        return [emit("status.retry", input, { dedupe: `${input.sessionID}:retry:${input.attempt ?? 0}` })]
      }

      if (input.source === "todo.updated") {
        const first = (state.open ?? 0) === 0 && input.open > 0
        state.open = input.open
        if (!first) return []
        return [emit("plan.ready", input, { dedupe: `${input.sessionID}:plan:${input.open}` })]
      }

      if (input.source === "permission.asked") {
        return [emit("attention.permission", input, { dedupe: `${input.sessionID}:permission:${input.permission}` })]
      }

      if (input.source === "question.asked") {
        return [emit("attention.question", input, { dedupe: `${input.sessionID}:question:${input.count}` })]
      }

      const prev = state.tools.get(input.callID)
      state.tools.set(input.callID, input.status)

      if ((input.status === "pending" || input.status === "running") && prev !== "pending" && prev !== "running") {
        state.burst = combo(state.burst, input.time)
        if (state.burst.count >= 3) {
          return [emit("tool.chain", input, { combo: "tool.chain", dedupe: `${input.sessionID}:tool.chain` })]
        }
        return [emit("tool.start", input, { dedupe: `${input.sessionID}:${input.callID}:start` })]
      }

      if (input.status === "completed" && prev !== "completed") {
        return [emit("tool.finish", input, { dedupe: `${input.sessionID}:${input.callID}:completed` })]
      }

      if (input.status === "error" && prev !== "error") {
        return [emit("tool.error", input, { dedupe: `${input.sessionID}:${input.callID}:error` })]
      }

      return []
    },
  }
}