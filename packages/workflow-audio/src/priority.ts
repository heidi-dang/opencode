import type { WorkflowAudioEvent } from "./events"

export function pick_audio(list: WorkflowAudioEvent[]) {
  return [...list].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return a.time - b.time
  })[0]
}