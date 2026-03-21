import { describe, expect, test } from "bun:test"
import { PlaywrightTool } from "../../src/tool/playwright"
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

describe("tool.playwright_run", () => {
  test("executes playwright command", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const pw = await PlaywrightTool.init()
        const result = await pw.execute(
          {
            test_file: "fake.spec.ts",
          },
          ctx as any,
        )
        expect(result.title).toBe("Playwright Complete")
        expect(result.output).toBeDefined()
      },
    })
  })
})
