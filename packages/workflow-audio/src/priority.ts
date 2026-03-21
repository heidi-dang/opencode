import type { WorkflowAudioEvent } from "./events"

export function pick_audio(list: WorkflowAudioEvent[]) {
  if (list.length === 0) return undefined
  return [...list].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return a.time - b.time
  })[0]
}
