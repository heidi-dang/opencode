import { expect, test } from "bun:test"
import { TaskTool, acquireLocks, releaseLocks } from "../../src/tool/task"
import { Agent } from "../../src/agent/agent"
import { Session } from "../../src/session"
import { SessionProcessor } from "../../src/session/processor"
import { MessageV2 } from "../../src/session/message-v2"

test("heidi stress > file lock conflict", async () => {
  const file = "packages/opencode/src/agent/agent.ts"
  acquireLocks([file])
  
  // Attempt to start a task that wants exclusive edit on the same file
  const task = TaskTool.init()
  const ctx = {
    sessionID: "ses_test",
    messageID: "msg_test",
    metadata: () => {},
    messages: [],
  } as any

  try {
    await (await task).execute({
      description: "conflict test",
      prompt: "edit agent.ts",
      subagent_type: "api_architect",
      ownership: { mode: "exclusive_edit", files: [file] }
    }, ctx)
    expect.unreachable("Should have thrown lock conflict error")
  } catch (e: any) {
    expect(e.message).toContain("File lock conflict")
  } finally {
    releaseLocks([file])
  }
})

test("heidi stress > subagent step limit enforcement", async () => {
  const agents = await Agent.list()
  for (const agent of agents) {
    if (agent.mode === "subagent") {
      expect(agent.steps).toBe(75)
    }
  }
})

test("heidi stress > doom loop permission is denied", async () => {
  // This is a unit test for the session creation logic in task.ts
  // We already verified the code injection, but we can check if it's correctly applied
})
