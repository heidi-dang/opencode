import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { HeidiExec } from "../../src/heidi/exec"
import { Filesystem } from "../../src/util/filesystem"

function scrub(state: Awaited<ReturnType<typeof HeidiState.read>>) {
  return {
    ...state,
    run_id: "RUN",
    task_id: "TASK",
    plan: {
      ...state.plan,
      path: "PLAN",
      hash: state.plan.hash ? "HASH" : "",
      amendments: state.plan.amendments.map(() => ({ id: "AMEND", reason: "REASON", timestamp: "TIME" })),
    },
    commands: state.commands.map((item) => ({
      ...item,
      id: "CMD",
      cwd: "CWD",
      timestamp: "TIME",
    })),
    checkpoints: state.checkpoints.map((item) => ({
      ...item,
      id: "CHECKPOINT",
      files: item.files.map(() => "FILE"),
      created_at: "TIME",
    })),
    active_files: state.active_files.map(() => "FILE"),
    changed_files: state.changed_files.map(() => "FILE"),
    resume: {
      ...state.resume,
      checkpoint_id: state.resume.checkpoint_id ? "CHECKPOINT" : null,
    },
  }
}

async function recover() {
  await using tmp = await tmpdir({ git: true })
  return Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const session = await Session.create({})
      const file = path.join(tmp.path, "state.txt")
      await HeidiState.ensure(session.id, "recover")
      await Filesystem.write(file, "seed")
      const checkpointId = await HeidiExec.checkpoint(session.id, [file], "recover")
      await Filesystem.write(file, "mutated")
      const result = await HeidiExec.cmd(session.id, {
        cmd: "exit 1",
        cwd: tmp.path,
        profile: "app_local",
        timeout: 1000,
      })
      const state = await HeidiState.read(session.id)
      const files = await HeidiState.files(session.id)
      const resume = await Filesystem.readJson(files.resume)
      return {
        checkpointId,
        result,
        file: await Filesystem.readText(file),
        state: scrub(state),
        resume,
      }
    },
  })
}

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

  test("checkpoint failure recovery state is deterministic across identical runs", async () => {
    const first = await recover()
    const second = await recover()

    expect(first.checkpointId).not.toBe(second.checkpointId)
    expect(first.result.code).toBe(1)
    expect(second.result.code).toBe(1)
    expect(first.file).toBe("seed")
    expect(second.file).toBe("seed")
    expect(first.state).toEqual(second.state)
  })

  test("checkpoint failure recovery writes deterministic resume checkpoint state", async () => {
    const item = await recover()

    expect(item.resume).toMatchObject({
      fsm_state: "IDLE",
      checkpoint_ref: item.checkpointId,
      next_step: "DISCOVERY",
    })
    expect(item.state.resume.checkpoint_id).toBe("CHECKPOINT")
    expect(item.state.commands).toHaveLength(1)
    expect(item.state.checkpoints).toHaveLength(1)
  })
})
