import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { RunCommandTool } from "../../src/tool/run_command"
import type { Tool } from "../../src/tool/tool"

describe("run_command", () => {
  test("plan-lock drift blocks run_command execution", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        // Use real contract to lock plan and begin execution
        const { HeidiBoundary } = await import("../../src/heidi/boundary")
        await HeidiBoundary.apply({
          run_id: "run-drift-1",
          task_id: session.id,
          action: "start",
          payload: { objective: "test run_command drift" },
        })
        await HeidiBoundary.apply({
          run_id: "run-drift-1",
          task_id: session.id,
          action: "lock_plan",
          payload: {},
        })
        await HeidiBoundary.apply({
          run_id: "run-drift-1",
          task_id: session.id,
          action: "begin_execution",
          payload: {},
        })
        // Mutate the plan file after lock
        const planPath = HeidiState.plan(session.id)
        const orig = await (await import("../../src/util/filesystem")).Filesystem.readText(planPath)
        await (await import("../../src/util/filesystem")).Filesystem.write(planPath, orig + "\n# DRIFT\n")
        const tool = await RunCommandTool.init()
        const ctx = {
          sessionID: session.id,
          messageID: "msg_test_run" as any,
          callID: "",
          agent: "build",
          abort: AbortSignal.any([]),
          messages: [],
          metadata: () => {},
          ask: async () => {},
        }
        await expect(
          tool.execute({ command: "echo ok", profile: "app_local", timeout: 1000 }, ctx),
        ).rejects.toThrow(/drift/i)
      },
    })
  })
  test("rejects outside execution and verification", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiState.ensure(session.id, "run")
        const tool = await RunCommandTool.init()
        const ctx: Tool.Context = {
          sessionID: session.id as any,
          messageID: "msg_test_run" as any,
          callID: "",
          agent: "build",
          abort: AbortSignal.any([]),
          messages: [],
          metadata: () => {},
          ask: async () => {},
        }
        await expect(tool.execute({ command: "echo ok", profile: "app_local", timeout: 1000 }, ctx)).rejects.toThrow(
          "unavailable",
        )
      },
    })
  })
})
