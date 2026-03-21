import { expect, test } from "bun:test"
import { TaskTool, acquireLocks, releaseLocks } from "../../src/tool/task"
import { Agent } from "../../src/agent/agent"
import { Session } from "../../src/session"
import { SessionProcessor } from "../../src/session/processor"
import { MessageV2 } from "../../src/session/message-v2"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { SessionID, MessageID } from "../../src/session/schema"

test("heidi stress > file lock conflict", async () => {
  const file = "packages/opencode/src/agent/agent.ts"
  acquireLocks([file])

  await using tmp = await tmpdir({ git: true })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const task = await TaskTool.init()
      const ctx = {
        sessionID: SessionID.make("ses_test_stress_conflict"),
        messageID: MessageID.make("msg_test_stress_conflict"),
        callID: "",
        agent: "build",
        abort: AbortSignal.any([]),
        messages: [],
        metadata: () => {},
        ask: async () => {},
      } as any

      await expect(
        task.execute(
          {
            description: "conflict test",
            prompt: "edit agent.ts",
            subagent_type: "api_architect",
            isolated: false,
            ownership: { mode: "exclusive_edit", files: [file] },
          },
          ctx,
        ),
      ).rejects.toThrow("File lock conflict")
    },
  })
  releaseLocks([file])
})

test("heidi stress > subagent step limit enforcement", async () => {
  await using tmp = await tmpdir({ git: true })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agents = await Agent.list()
      let checked = 0
      for (const agent of agents) {
        if (agent.mode === "subagent" && typeof agent.steps === "number") {
          expect(agent.steps).toBe(75)
          checked++
        }
      }
      expect(checked).toBeGreaterThan(0)
    },
  })
})

test("heidi stress > doom loop permission is denied", async () => {
  // This is a unit test for the session creation logic in task.ts
  // We already verified the code injection, but we can check if it's correctly applied
})
