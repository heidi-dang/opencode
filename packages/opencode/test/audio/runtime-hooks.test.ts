import { describe, expect, test } from "bun:test"
import { Bus } from "../../src/bus"
import { MessageV2 } from "../../src/session/message-v2"
import { Instance } from "../../src/project/instance"
import { SessionStatus } from "../../src/session/status"
import { Todo } from "../../src/session/todo"
import { WorkflowAudioRuntime } from "../../src/audio/runtime-hooks"
import { WorkflowAudioTransport } from "../../src/audio/transport"
import { tmpdir } from "../fixture/fixture"

function wait() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("workflow audio runtime", () => {
  test("emits workflow.audio when session becomes busy", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        WorkflowAudioRuntime.ensure()
        const seen: string[] = []
        const stop = Bus.subscribe(WorkflowAudioTransport.Event, (event) => {
          seen.push(event.properties.cue)
        })

        SessionStatus.set("ses_1" as any, { type: "busy" })
        await wait()

        expect(seen).toContain("turn.start")
        stop()
      },
    })
  })

  test("emits workflow.audio for todo activation and tool completion", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        WorkflowAudioRuntime.ensure()
        const seen: string[] = []
        const stop = Bus.subscribe(WorkflowAudioTransport.Event, (event) => {
          seen.push(event.properties.cue)
        })

        await Bus.publish(Todo.Event.Updated, {
          sessionID: "ses_2" as any,
          todos: [{ content: "plan", status: "pending", priority: "high" }],
        })

        await Bus.publish(MessageV2.Event.PartUpdated, {
          part: {
            id: "part_1",
            sessionID: "ses_2" as any,
            messageID: "msg_1" as any,
            type: "tool",
            callID: "call_1",
            tool: "bash",
            state: {
              status: "completed",
              input: {},
              output: "ok",
              title: "bash",
              metadata: {},
              time: { start: 1, end: 2 },
            },
          },
        } as any)

        await wait()

        expect(seen).toContain("plan.ready")
        expect(seen).toContain("tool.finish")
        stop()
      },
    })
  })
})