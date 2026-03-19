import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { HeidiVerify } from "../../src/heidi/verify"

describe("heidi verify", () => {
  test("gate fails on incomplete checklist", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "verify gate")
        state.plan.locked = true
        state.checklist = [{ id: "1", label: "do thing", status: "todo", category: "Modify" }]
        await HeidiState.write(session.id, state)
        await expect(HeidiVerify.gate(session.id)).rejects.toThrow("checklist incomplete")
      },
    })
  })
})
