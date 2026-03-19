import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"

describe("heidi state", () => {
  test("files() reports artifact paths and existence", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiState.ensure(session.id, "paths")
        const files = await HeidiState.files(session.id)
        expect(files.task_json.endsWith("task.json")).toBe(true)
        expect(files.exists.task_json).toBe(true)
        expect(files.exists.implementation_plan).toBe(true)
      },
    })
  })
})
