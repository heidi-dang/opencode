process.env.HEIDI_ENABLE_FRONTIER = "true"
import { test, expect, mock } from "bun:test"
import { Policy } from "../../src/session/policy"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

test("Policy.checkGates blocks finalization on missing verdicts", () => {
  const sessionID = SessionID.make("test-session")
  const msgID = MessageID.make("test-msg")
  
  const messages: any[] = [
    {
      info: { role: "assistant", id: msgID },
      parts: [
        {
          id: PartID.make("p1"),
          type: "subtask",
          agent: "sentry",
          description: "audit",
          prompt: "audit"
        }
      ]
    }
  ]

  const check = Policy.checkGates("heidi", messages)
  expect(check.pass).toBe(false)
  expect(check.reason).toContain("not completed with a verdict yet")
})

test("Policy.checkGates blocks finalization on FAIL verdict", () => {
  const sessionID = SessionID.make("test-session")
  const msgID = MessageID.make("test-msg")
  
  const messages: any[] = [
    {
      info: { role: "assistant", id: msgID },
      parts: [
        {
          id: PartID.make("p1"),
          type: "subtask",
          agent: "sentry",
          description: "audit",
          prompt: "audit"
        }
      ]
    },
    {
      info: { role: "user" },
      parts: [
        {
          id: PartID.make("p2"),
          type: "text",
          text: "VERDICT: FAIL - Security issues found."
        }
      ]
    }
  ]

  const check = Policy.checkGates("heidi", messages)
  expect(check.pass).toBe(false)
  expect(check.reason).toContain("failed")
})

test("Policy.checkGates allows finalization on PASS verdict", () => {
  const sessionID = SessionID.make("test-session")
  const msgID = MessageID.make("test-msg")
  
  const messages: any[] = [
    {
      info: { role: "assistant", id: msgID },
      parts: [
        {
          id: PartID.make("p1"),
          type: "subtask",
          agent: "sentry",
          description: "audit",
          prompt: "audit"
        }
      ]
    },
    {
      info: { role: "user" },
      parts: [
        {
          id: PartID.make("p2"),
          type: "text",
          text: "VERDICT: PASS"
        }
      ]
    }
  ]

  const check = Policy.checkGates("heidi", messages)
  expect(check.pass).toBe(true)
})

test("Policy.requiresApproval rejects benign SQL comments", () => {
  const parts: any[] = [
    {
      type: "tool",
      tool: "bash",
      state: {
        input: { command: "echo '-- This is a SQL comment about schema'" }
      }
    }
  ]
  const approval = Policy.requiresApproval(parts)
  expect(approval).toBeNull()
})

test("Policy.requiresApproval detects actual migrations", () => {
  const parts: any[] = [
    {
      type: "tool",
      tool: "sql",
      state: {
        input: { query: "ALTER TABLE users ADD COLUMN secret TEXT" }
      }
    }
  ]
  const approval = Policy.requiresApproval(parts)
  expect(approval?.name).toBe("database_change")
})

test("Policy.requiresApproval detects file deletion in non-tmp paths", () => {
  const parts: any[] = [
    {
      type: "tool",
      tool: "bash",
      state: {
        input: { command: "rm -rf src/important.ts" }
      }
    }
  ]
  const approval = Policy.requiresApproval(parts)
  expect(approval?.name).toBe("file_deletion")
})
