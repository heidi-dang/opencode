import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { HeidiContext } from "../../src/heidi/context"
import { HeidiMemory } from "../../src/heidi/memory"
import { Filesystem } from "../../src/util/filesystem"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

describe("heidi context", () => {
  test("writes canonical context with resume and long-term memory", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "Ship context")
        state.fsm_state = "EXECUTION"
        state.mode = "EXECUTION"
        state.active_files = ["src/a.ts"]
        state.changed_files = ["src/a.ts"]
        state.resume.next_step = "patch"
        state.verification_commands = ["bun test"]
        await HeidiState.write(session.id, state)
        await HeidiMemory.add(session.id, { type: "fact", key: "ctx", content: "context memory exists" })
        await HeidiMemory.add(SessionID.make("ses_other"), { type: "fact", key: "other", content: "other session memory" })
        await Session.updateMessage({
          id: MessageID.ascending(),
          sessionID: session.id,
          parentID: MessageID.make("msg_parent"),
          mode: "compaction",
          role: "assistant",
          agent: "compaction",
          path: { cwd: tmp.path, root: tmp.path },
          summary: true,
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: "gpt-5.4" as any,
          providerID: "openai" as any,
          time: { created: Date.now() },
        })
        const msg = await Session.messages({ sessionID: session.id, limit: 1 })
        await Session.updatePart({
          id: PartID.ascending(),
          messageID: msg[0]!.info.id,
          sessionID: session.id,
          type: "text",
          text: "We updated src/a.ts and next we patch tests.",
        })
        await Filesystem.write(
          path.join(tmp.path, ".opencode", "heidi", session.id, "knowledge.jsonl"),
          JSON.stringify({ kind: "note", summary: "Use patch tests", source: "task" }) + "\n",
        )
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [{ name: "typecheck", command: "bun typecheck", exit_code: 0, duration_ms: 1 }],
          evidence: { changed_files: ["src/a.ts"], command_summary: ["bun typecheck"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: { required: true, status: "pass", screenshots: [], html: [], console_errors: [], network_failures: [] },
        })
        const ctx = await HeidiContext.write(session.id)
        expect(ctx.objective).toBe("Ship context")
        expect(ctx.resume.next_step).toBe("patch")
        expect(ctx.activity.active_files).toContain("src/a.ts")
        expect(ctx.memory.long_term.some((item) => item.key === "ctx")).toBe(true)
        expect(ctx.memory.long_term.some((item) => item.key === "other")).toBe(false)
        expect(ctx.memory.retrieval.some((item) => item.summary === "Use patch tests")).toBe(true)
        expect(ctx.verification?.status).toBe("pass")
        expect(ctx.version).toBe(2)
        expect(ctx.freshness.fingerprint.length).toBeGreaterThan(10)
        expect(ctx.summary.body).toContain("src/a.ts")
      },
    })
  })
})
