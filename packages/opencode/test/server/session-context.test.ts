import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { HeidiVerify } from "../../src/heidi/verify"

describe("session context route", () => {
  test("returns typed context with verification", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { Server } = await import("../../src/server/server")
        const app = Server.createApp({})
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "Route context")
        state.fsm_state = "VERIFICATION"
        state.mode = "VERIFICATION"
        state.resume.next_step = "complete"
        await HeidiState.write(session.id, state)
        await HeidiVerify.write(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [{ name: "typecheck", command: "bun typecheck", exit_code: 0, duration_ms: 1 }],
          evidence: { changed_files: ["src/a.ts"], command_summary: ["bun typecheck"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: { required: true, status: "pass", screenshots: [], html: [], console_errors: [], network_failures: [] },
        })
        const res = await app.request(`/session/${session.id}/task/context`, {
          headers: {
            "x-opencode-directory": tmp.path,
          },
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.objective).toBe("Route context")
        expect(body.verification.status).toBe("pass")
        expect(body.version).toBe(2)
        expect(typeof body.freshness.fingerprint).toBe("string")
      },
    })
  })
})
