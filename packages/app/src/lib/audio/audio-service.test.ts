import { describe, expect, test } from "bun:test"
import { parseWorkflowAudioEvent } from "./audio-service"

describe("workflow audio event guard", () => {
  test("accepts valid workflow.audio payloads", () => {
    const result = parseWorkflowAudioEvent({
      details: {
        type: "workflow.audio",
        properties: {
          id: "evt_1",
          time: 1,
          cue: "turn.complete",
          category: "turn",
          source: "session.status",
          priority: 50,
        },
      },
    })

    expect(result?.cue).toBe("turn.complete")
  })

  test("rejects non workflow.audio events", () => {
    const result = parseWorkflowAudioEvent({
      details: {
        type: "question.asked",
        properties: {},
      },
    })

    expect(result).toBeUndefined()
  })

  test("rejects malformed workflow.audio payloads", () => {
    const result = parseWorkflowAudioEvent({
      details: {
        type: "workflow.audio",
        properties: {
          id: "evt_1",
          time: 1,
        },
      },
    })

    expect(result).toBeUndefined()
  })
})
