import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiDiscovery } from "../../src/heidi/discovery"
import { HeidiState } from "../../src/heidi/state"

describe("heidi discovery", () => {
  test("moves to plan draft when budget is exhausted", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiDiscovery.start(session.id, "Discovery objective")
        for (let i = 0; i < 8; i++) {
          await HeidiDiscovery.action(session.id, `k-${i}`)
        }
        const state = await HeidiState.read(session.id)
        expect(state.fsm_state).toBe("PLAN_DRAFT")
      },
    })
  })
})
