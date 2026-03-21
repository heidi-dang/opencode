import { createSignal } from "solid-js"

export type AudioEntry = {
  cue: string
  status: "queued" | "played" | "blocked" | "dropped" | "disabled"
  time: number
  note?: string
}

export function createAudioStore(limit = 24) {
  const [list, setList] = createSignal<AudioEntry[]>([])

  return {
    list,
    push(entry: AudioEntry) {
      setList((prev) => [entry, ...prev].slice(0, limit))
    },
  }
}