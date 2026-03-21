import { afterEach, describe, expect, test } from "bun:test"
import { createAudioPlayer } from "./audio-player"

const info = {
  id: "evt_1",
  time: 1,
  cue: "turn.complete",
  category: "turn",
  source: "session.status",
  priority: 50,
} as const

describe("audio player", () => {
  const Audio0 = globalThis.Audio

  afterEach(() => {
    globalThis.Audio = Audio0
  })

  test("uses normalized volume without re-scaling", async () => {
    const seen: Array<{ volume: number; url: string }> = []

    class MockAudio {
      preload = ""
      volume = 0

      constructor(url: string) {
        seen.push({ volume: this.volume, url })
      }

      load() {}

      play() {
        seen[seen.length - 1]!.volume = this.volume
        return Promise.resolve()
      }
    }

    globalThis.Audio = MockAudio as unknown as typeof Audio
    const log: Array<{ cue: string; status: "played" | "blocked"; note?: string }> = []

    await createAudioPlayer((entry) => log.push(entry)).play(info, "/audio/minimal-pro/resolve_up.wav", 0.7)

    expect(seen[0]?.url).toBe("/audio/minimal-pro/resolve_up.wav")
    expect(seen[0]?.volume).toBe(0.7)
    expect(log).toEqual([{ cue: "turn.complete", status: "played" }])
  })
})
