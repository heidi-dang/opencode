import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { HeidiHealth } from "../../src/heidi/health"
import { Server } from "../../src/server/server"

describe("global health route", () => {
  beforeEach(() => {
    HeidiHealth.reset()
  })

  afterEach(() => {
    HeidiHealth.reset()
  })

  test("returns the Heidi summary with zeroed counters by default", async () => {
    const app = Server.createApp({})
    const res = await app.request("/global/health")

    expect(res.status).toBe(200)

    const body = await res.json()

    expect(body.healthy).toBe(true)
    expect(typeof body.version).toBe("string")
    expect(body.heidi).toEqual({
      checkpoint_count: 0,
      rollback_count: 0,
      command_failure_count: 0,
      active_subagents: 0,
      last_timeout_at: null,
      last_conflict_at: null,
      last_rollback_at: null,
    })
  })

  test("returns recorded Heidi metrics in the health payload", async () => {
    HeidiHealth.checkpoint()
    HeidiHealth.rollback()
    HeidiHealth.commandFailure()
    HeidiHealth.subagentStart()
    HeidiHealth.timeout("2026-03-20T10:00:00.000Z")
    HeidiHealth.conflict("2026-03-20T11:00:00.000Z")
    HeidiHealth.rollback("2026-03-20T12:00:00.000Z")

    const app = Server.createApp({})
    const res = await app.request("/global/health")

    expect(res.status).toBe(200)

    const body = await res.json()

    expect(body.heidi).toEqual({
      checkpoint_count: 1,
      rollback_count: 2,
      command_failure_count: 1,
      active_subagents: 1,
      last_timeout_at: "2026-03-20T10:00:00.000Z",
      last_conflict_at: "2026-03-20T11:00:00.000Z",
      last_rollback_at: "2026-03-20T12:00:00.000Z",
    })
  })
})