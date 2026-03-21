import { describe, expect, test } from "bun:test"
import path from "path"
import { VariantAnalysisTool } from "../../src/tool/variant"
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

describe("tool.variant_analysis", () => {
  test("finds or returns zero instances", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "bug.ts"), "const a = 1;")
      },
    })
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const variant = await VariantAnalysisTool.init()
        const result = await variant.execute(
          {
            pattern: "const a =",
            file_extension: "ts",
          },
          ctx as any,
        )
        expect(result.title).toBe("Variant Analysis")
        expect(result.output).toBeDefined()
      },
    })
  })
})
