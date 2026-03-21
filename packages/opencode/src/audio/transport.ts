import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { WorkflowAudioEvent, type WorkflowAudioEvent as Info } from "@opencode-ai/workflow-audio"

export namespace WorkflowAudioTransport {
  export const Event = BusEvent.define("workflow.audio", WorkflowAudioEvent)

  export function publish(info: Info) {
    return Bus.publish(Event, info)
  }
}