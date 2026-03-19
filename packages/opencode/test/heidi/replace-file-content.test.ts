import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { ReplaceFileContentTool } from "../../src/tool/replace_file_content"
import type { Tool } from "../../src/tool/tool"
import { Filesystem } from "../../src/util/filesystem"

describe("replace_file_content", () => {
  test("applies anchored replace in execution", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "x.ts")
        await Filesystem.write(file, "const a = 1\n")
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "edit")
        state.fsm_state = "EXECUTION"
        state.mode = "EXECUTION"
        await HeidiState.write(session.id, state)
        const ctx: Tool.Context = {
          sessionID: session.id as any,
          messageID: "msg_test_replace" as any,
          callID: "",
          agent: "build",
          abort: AbortSignal.any([]),
          messages: [],
          metadata: () => {},
          ask: async () => {},
        }

        const tool = await ReplaceFileContentTool.init()
        await tool.execute(
          {
            path: file,
            search_string: "const a = 1",
            replace_string: "const a = 2",
            anchor: "const a = 1",
          },
          ctx,
        )

        expect(await Filesystem.readText(file)).toContain("const a = 2")
      },
    })
  })
})
