import { describe, expect, test } from "bun:test"
import { create_audio_machine } from "@opencode-ai/workflow-audio"

describe("workflow audio state machine", () => {
  test("promotes a rapid tool burst into tool.chain", () => {
    const machine = create_audio_machine()

    const first = machine.accept({
      source: "tool.state",
      time: 100,
      sessionID: "ses_1",
      messageID: "msg_1",
      partID: "part_1",
      callID: "call_1",
      tool: "bash",
      status: "running",
    })
    const second = machine.accept({
      source: "tool.state",
      time: 400,
      sessionID: "ses_1",
      messageID: "msg_1",
      partID: "part_2",
      callID: "call_2",
      tool: "read",
      status: "running",
    })
    const third = machine.accept({
      source: "tool.state",
      time: 700,
      sessionID: "ses_1",
      messageID: "msg_1",
      partID: "part_3",
      callID: "call_3",
      tool: "edit",
      status: "running",
    })

    expect(first.map((item) => item.cue)).toEqual(["tool.start"])
    expect(second.map((item) => item.cue)).toEqual(["tool.start"])
    expect(third.map((item) => item.cue)).toEqual(["tool.chain"])
  })

  test("emits plan.ready when todos become active", () => {
    const machine = create_audio_machine()

    const next = machine.accept({
      source: "todo.updated",
      time: 100,
      sessionID: "ses_1",
      open: 2,
    })

    expect(next.map((item) => item.cue)).toEqual(["plan.ready"])
  })
})