import type { WorkflowAudioEvent } from "@opencode-ai/workflow-audio"
import { WorkflowAudioTransport } from "./transport"

export function emitAudio(info: WorkflowAudioEvent) {
  return WorkflowAudioTransport.publish(info)
}