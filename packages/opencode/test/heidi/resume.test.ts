import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { Filesystem } from "../../src/util/filesystem"

describe("heidi resume", () => {
  test("writes resume payload with next step", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "resume")
        state.fsm_state = "DISCOVERY"
        state.resume.next_step = "PLAN_DRAFT"
        await HeidiState.write(session.id, state)
        await HeidiState.updateResume(session.id)
        const paths = await HeidiState.files(session.id)
        const resume = await Filesystem.readJson<any>(paths.resume)
        expect(resume.next_step).toBe("PLAN_DRAFT")
      },
    })
  })
})
