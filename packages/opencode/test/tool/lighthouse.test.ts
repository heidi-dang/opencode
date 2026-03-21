import { describe, expect, test } from "bun:test"
import { LighthouseTool } from "../../src/tool/lighthouse"
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

describe("tool.lighthouse_audit", () => {
  test("executes lighthouse command", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lighthouse = await LighthouseTool.init()
        const result = await lighthouse.execute(
          {
            url: "http://localhost:9999",
          },
          ctx as any,
        )
        expect(result.title).toBe("Lighthouse Trace")
        expect(result.output).toBeDefined()
      },
    })
  }, 30000)
})
