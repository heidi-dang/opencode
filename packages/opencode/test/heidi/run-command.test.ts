import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { RunCommandTool } from "../../src/tool/run_command"
import type { Tool } from "../../src/tool/tool"

describe("run_command", () => {
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
