import { describe, expect, test } from "bun:test"
import path from "path"
import { VexorTool } from "../../src/tool/vexor"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { SessionID, MessageID } from "../../src/session/schema"

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

describe("tool.vexor_search", () => {
  test("basic vexor search", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "function myFunc() { return 1; }")
      },
    })
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const vexor = await VexorTool.init()
        const result = await vexor.execute(
          {
            query: "myFunc",
            path: tmp.path,
          },
          ctx as any,
        )
        expect(result.title).toBe("Vexor Map")
        expect(result.output).toBeDefined()
      },
    })
  })
})
