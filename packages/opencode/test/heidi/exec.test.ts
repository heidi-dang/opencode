import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { HeidiExec } from "../../src/heidi/exec"
import { Filesystem } from "../../src/util/filesystem"

describe("heidi exec", () => {
  test("denies read_only redirect writes", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "deny check")
        state.fsm_state = "EXECUTION"
        state.mode = "EXECUTION"
        await HeidiState.write(session.id, state)

        await expect(
          HeidiExec.cmd(session.id, {
            cmd: "echo hi > x.txt",
            cwd: tmp.path,
            profile: "read_only",
            timeout: 1000,
          }),
        ).rejects.toThrow("denied by profile")
      },
    })
  })

  test("rolls back to checkpoint on failing command", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const file = path.join(tmp.path, "a.txt")
        await Filesystem.write(file, "ok")

        await HeidiExec.checkpoint(session.id, "s1", [file])
        await Filesystem.write(file, "bad")

        const result = await HeidiExec.cmd(session.id, {
          cmd: "exit 1",
          cwd: tmp.path,
          profile: "app_local",
          timeout: 1000,
        })

        expect(result.code).toBe(1)
        expect(await Filesystem.readText(file)).toBe("ok")
      },
    })
  })
})
