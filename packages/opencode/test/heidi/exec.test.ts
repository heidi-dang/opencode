import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import type { SessionID } from "../../src/session/schema"
import { HeidiState } from "../../src/heidi/state"
import { HeidiExec } from "../../src/heidi/exec"
import { Filesystem } from "../../src/util/filesystem"
import { enterExecution } from "../fixture/heidi"

async function resume(sessionID: SessionID) {
  const files = await HeidiState.files(sessionID)
  return Filesystem.readJson<{ checkpoint_ref: string | null }>(files.resume)
}

describe("heidi exec", () => {
  test("rollback preserves usable resume metadata after failure", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const file = path.join(tmp.path, "a.txt")
        await Filesystem.write(file, "ok")
        const checkpointId = await HeidiExec.checkpoint(session.id, [file], undefined)
        await Filesystem.write(file, "bad")
        await HeidiExec.cmd(session.id, {
          cmd: "exit 1",
          cwd: tmp.path,
          profile: "app_local",
          timeout: 1000,
        })
        // Resume metadata should reflect rollback
        const state = await HeidiState.read(session.id)
        expect(state.resume.checkpoint_id).toBe(checkpointId)
        expect(await Filesystem.readText(file)).toBe("ok")
      },
    })
  })

  test("denies read_only redirect writes", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterExecution(session.id, "deny check")

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

        const checkpointId = await HeidiExec.checkpoint(session.id, [file], undefined)
        expect(typeof checkpointId).toBe("string")
        expect(checkpointId).not.toBeNull()
        expect(checkpointId.length).toBeGreaterThan(0)
        await Filesystem.write(file, "bad")

        const result = await HeidiExec.cmd(session.id, {
          cmd: "exit 1",
          cwd: tmp.path,
          profile: "app_local",
          timeout: 1000,
        })

        expect(result.code).toBe(1)
        expect(await Filesystem.readText(file)).toBe("ok")
        // Assert checkpoint_id in resume matches generated id
        const state = await HeidiState.read(session.id)
        expect(state.resume.checkpoint_id).toBe(checkpointId)
      },
    })
  })

  test("git checkpoint rollback success restores tracked content and removes files created after the checkpoint", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const file = path.join(tmp.path, "a.txt")
        const extra = path.join(tmp.path, "new.txt")
        await Filesystem.write(file, "ok")

        const checkpointId = await HeidiExec.checkpoint(session.id, [file], "git-success")
        await Filesystem.write(file, "bad")
        await Filesystem.write(extra, "new")

        await HeidiExec.rollback(session.id, checkpointId)

        expect(await Filesystem.readText(file)).toBe("ok")
        expect(await Filesystem.exists(extra)).toBe(false)
      },
    })
  })

  test("json fallback rollback restores snapshot content and deletes files that were absent at checkpoint time", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const file = path.join(tmp.path, "a.txt")
        const extra = path.join(tmp.path, "later.txt")
        await Filesystem.write(file, "ok")

        const checkpointId = await HeidiExec.checkpoint(session.id, [file, extra], "json-fallback")
        await Filesystem.write(file, "bad")
        await Filesystem.write(extra, "created later")

        await HeidiExec.rollback(session.id, checkpointId)

        expect(await Filesystem.readText(file)).toBe("ok")
        expect(await Filesystem.exists(extra)).toBe(false)
      },
    })
  })

  test("direct rollback invocation preserves checkpoint metadata and task artifacts", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const file = path.join(tmp.path, "a.txt")
        await Filesystem.write(file, "seed")

        const checkpointId = await HeidiExec.checkpoint(session.id, [file], "direct-rollback")
        const files = await HeidiState.files(session.id)
        await Filesystem.write(file, "mutated")

        await HeidiExec.rollback(session.id, checkpointId)

        expect(await Filesystem.readText(file)).toBe("seed")
        expect(await Filesystem.exists(files.task_json)).toBe(true)
        expect(await Filesystem.exists(files.implementation_plan)).toBe(true)

        const state = await HeidiState.read(session.id)
        expect(state.resume.checkpoint_id).toBe(checkpointId)
        expect(state.checkpoints).toHaveLength(1)
        expect(state.checkpoints[0]?.id).toBe(checkpointId)
        expect(state.commands).toHaveLength(0)
      },
    })
  })

  test("multiple failing commands in sequence restore to the active checkpoint instead of an older checkpoint", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const file = path.join(tmp.path, "a.txt")
        await Filesystem.write(file, "one")

        const first = await HeidiExec.checkpoint(session.id, [file], "first")
        await Filesystem.write(file, "two")
        const second = await HeidiExec.checkpoint(session.id, [file], "second")

        await Filesystem.write(file, "bad-1")
        const firstFail = await HeidiExec.cmd(session.id, {
          cmd: "exit 1",
          cwd: tmp.path,
          profile: "app_local",
          timeout: 1000,
        })

        await Filesystem.write(file, "bad-2")
        const secondFail = await HeidiExec.cmd(session.id, {
          cmd: "exit 1",
          cwd: tmp.path,
          profile: "app_local",
          timeout: 1000,
        })

        expect(first).not.toBe(second)
        expect(firstFail.code).toBe(1)
        expect(secondFail.code).toBe(1)
        expect(await Filesystem.readText(file)).toBe("two")

        const state = await HeidiState.read(session.id)
        expect(state.resume.checkpoint_id).toBe(second)
      },
    })
  })

  test("rollback after restore preserves resume checkpoint metadata and command history invariants", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const file = path.join(tmp.path, "a.txt")
        await Filesystem.write(file, "ok")

        const checkpointId = await HeidiExec.checkpoint(session.id, [file], "invariants")
        await Filesystem.write(file, "bad")
        const result = await HeidiExec.cmd(session.id, {
          cmd: "exit 1",
          cwd: tmp.path,
          profile: "app_local",
          timeout: 1000,
        })

        const state = await HeidiState.read(session.id)
        const saved = await resume(session.id)
        expect(result.code).toBe(1)
        expect(state.resume.checkpoint_id).toBe(checkpointId)
        expect(saved.checkpoint_ref).toBe(checkpointId)
        expect(state.checkpoints).toHaveLength(1)
        expect(state.commands).toHaveLength(1)
        expect(state.commands[0]?.exit_code).toBe(1)
        expect(await Filesystem.readText(file)).toBe("ok")
      },
    })
  })
})
