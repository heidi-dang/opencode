import { Bus } from "@/bus"
import { Instance } from "@/project/instance"
import { create_audio_machine } from "@opencode-ai/workflow-audio"
import { emitAudio } from "./emit"
import { workflowAudioLog } from "./logger"
import { WorkflowAudioTransport } from "./transport"

type State = {
  started: boolean
  stop?: () => void
  machine: ReturnType<typeof create_audio_machine>
}

const state = Instance.state<State>(
  () => ({
    started: false,
    machine: create_audio_machine(),
  }),
  async (item) => {
    item.stop?.()
  },
)

function map(event: any) {
  const time = Date.now()

  if (event.type === "session.status") {
    return state().machine.accept({
      source: "session.status",
      time,
      sessionID: event.properties.sessionID,
      status: event.properties.status.type,
      attempt: event.properties.status.attempt,
    })
  }

  if (event.type === "message.part.updated") {
    const part = event.properties.part
    if (part.type !== "tool") return []
    return state().machine.accept({
      source: "tool.state",
      time,
      sessionID: part.sessionID,
      messageID: part.messageID,
      partID: part.id,
      callID: part.callID,
      tool: part.tool,
      status: part.state.status,
    })
  }

  if (event.type === "todo.updated") {
    return state().machine.accept({
      source: "todo.updated",
      time,
      sessionID: event.properties.sessionID,
      open: event.properties.todos.filter((todo: any) => !["completed", "cancelled"].includes(todo.status)).length,
    })
  }

  if (event.type === "permission.asked") {
    return state().machine.accept({
      source: "permission.asked",
      time,
      sessionID: event.properties.sessionID,
      permission: event.properties.permission,
    })
  }

  if (event.type === "question.asked") {
    return state().machine.accept({
      source: "question.asked",
      time,
      sessionID: event.properties.sessionID,
      count: event.properties.questions.length,
    })
  }

  return []
}

export namespace WorkflowAudioRuntime {
  export function ensure() {
    const item = state()
    if (item.started) return
    item.started = true
    item.stop = Bus.subscribeAll((event) => {
      if (event.type === WorkflowAudioTransport.Event.type) return
      const next = map(event)
      for (const info of next) {
        workflowAudioLog.info("emit", { cue: info.cue, sessionID: info.sessionID, source: info.source })
        void emitAudio(info)
      }
    })
  }
}