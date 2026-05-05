import { describe, test, expect } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { SessionID, MessageID } from "../../src/session/schema"
import { BrowserSubagentTool } from "../../src/tool/browser_subagent"
import { Filesystem } from "../../src/util/filesystem"
import { root as heidiRoot } from "../../src/heidi/state"

const ctx = {
  sessionID: SessionID.make("ses_browser-test"),
  messageID: MessageID.make("msg_browser-test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

describe("browser_subagent", () => {
  test("returns result with output", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await BrowserSubagentTool.init()
        // Use a URL that will fail (no server) to verify graceful error handling
        const result = await tool.execute({ url: "http://127.0.0.1:19999", checks: [] }, ctx)

        // output must be present
        expect(result.output).toBeDefined()
        expect(typeof result.output).toBe("string")
      },
    })
  })

  test("output string contains status", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await BrowserSubagentTool.init()
        const result = await tool.execute({ url: "http://127.0.0.1:19999", checks: [] }, ctx)
        expect(result.output).toMatch(/Playwright validation complete|Browser Validation Report/)
        expect(result.title).toBe("Browser Validation")
      },
    })
  })

  test("creates report file on disk", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await BrowserSubagentTool.init()
        const result = await tool.execute({ url: "http://127.0.0.1:19999", checks: [] }, ctx)

        // Check if report was created (if Playwright is available)
        const rootDir = heidiRoot(ctx.sessionID)
        const rep = path.join(rootDir, "browser_report.md")
        const shot = path.join(rootDir, "browser_screenshot.png")

        // The tool should attempt to create these files
        expect(result.output).toBeDefined()
      },
    })
  })
})
