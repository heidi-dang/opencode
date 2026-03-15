process.env.HEIDI_ENABLE_FRONTIER = "true"
import { test, expect } from "bun:test"
import { Policy } from "../../src/session/policy"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

const sessionID = SessionID.descending()
const messageID = MessageID.ascending()

test("Policy.requiresApproval detects DB migrations", () => {
  const parts: any[] = [
    {
      id: PartID.make("p1"),
      type: "tool",
      tool: "edit",
      state: { status: "completed", input: { path: "migrations/0001_v1.sql", content: "ALTER TABLE users ADD COLUMN age INT" }, output: "done" }
    }
  ] as any[]

  const checkpoint = Policy.requiresApproval(parts)
  expect(checkpoint).not.toBeNull()
})

test("Policy.requiresApproval detects auth changes", () => {
  const parts: any[] = [
    {
      id: PartID.make("p1"),
      type: "tool",
      tool: "write_to_file",
      state: { status: "completed", input: { path: "src/auth/guard.ts", content: "modify login logic and permissions" }, output: "done" }
    }
  ] as any[]

  const checkpoint = Policy.requiresApproval(parts)
  expect(checkpoint).not.toBeNull()
  expect(checkpoint?.name).toBe("auth_change")
})

test("Policy.shouldPrune follows thresholds", () => {
  expect(Policy.shouldPrune(15)).toBe(true)
  expect(Policy.shouldPrune(30)).toBe(true)
  expect(Policy.shouldPrune(14)).toBe(false)
  expect(Policy.shouldPrune(16)).toBe(false)
})

test("Policy.nextGate triggers Sentry first on edits", () => {
  const messages = [
    {
      parts: [
        { type: "tool", tool: "edit", state: { status: "completed", input: { path: "foo.ts" } } }
      ]
    }
  ] as any[]
  
  const gate = Policy.nextGate("heidi", messages)
  expect(gate?.agent).toBe("sentry")
})

test("Policy.nextGate triggers Vortex for UI changes after Sentry", () => {
  const messages = [
    {
      parts: [
        { type: "tool", tool: "edit", state: { status: "completed", input: { path: "styles.css" } } },
        { type: "subtask", agent: "sentry" }
      ]
    }
  ] as any[]
  
  const gate = Policy.nextGate("heidi", messages)
  expect(gate?.agent).toBe("vortex")
})

test("Policy.nextGate triggers Reviewer last", () => {
  const messages = [
    {
      parts: [
        { type: "tool", tool: "edit", state: { status: "completed", input: { path: "foo.ts" } } },
        { type: "subtask", agent: "sentry" },
        { type: "subtask", agent: "reviewer" }
      ]
    }
  ] as any[]
  
  const gate = Policy.nextGate("heidi", messages)
  expect(gate).toBeNull() // All gates done
})

test("Policy.checkGates handles scoped verdicts (prevents cross-talk)", () => {
  const messages = [
    {
      parts: [
        { type: "subtask", agent: "sentry" },
        { type: "text", text: "Some sentry analysis..." },
        { type: "subtask", agent: "reviewer" },
        { type: "text", text: "Verdict: PASS" } // This belongs to reviewer, not sentry
      ]
    }
  ] as any[]

  const result = Policy.checkGates("heidi", messages)
  expect(result.pass).toBe(false)
  expect(result.reason).toContain("not completed with a verdict yet")
})
