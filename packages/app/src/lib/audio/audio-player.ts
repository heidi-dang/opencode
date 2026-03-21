import type { WorkflowAudioEvent } from "@opencode-ai/workflow-audio"

export function createAudioPlayer(
  onEvent: (entry: { cue: string; status: "played" | "blocked"; note?: string }) => void,
) {
  const warm = new Set<string>()

  return {
    preload(urls: string[]) {
      if (typeof Audio === "undefined") return
      for (const url of urls) {
        if (warm.has(url)) continue
        warm.add(url)
        const audio = new Audio(url)
        audio.preload = "metadata"
        audio.load()
      }
    },
    async play(info: WorkflowAudioEvent, url: string, volume: number) {
      if (typeof Audio === "undefined") return
      const audio = new Audio(url)
      audio.preload = "auto"
      audio.volume = Math.max(0, Math.min(1, volume))
      try {
        await audio.play()
        onEvent({ cue: info.cue, status: "played" })
      } catch (error) {
        onEvent({
          cue: info.cue,
          status: "blocked",
          note: error instanceof Error ? error.name : String(error),
        })
      }
    },
  }
}
