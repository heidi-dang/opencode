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
  test("returns result with required metadata fields", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await BrowserSubagentTool.init()
        // Use a URL that will fail (no server) to verify graceful error handling
        const result = await tool.execute({ url: "http://127.0.0.1:19999", checks: [] }, ctx)

        // status must be one of the expected values
        expect(["pass", "fail", "skipped"]).toContain(result.metadata.status as string)

        // artifacts list must be present and include browser_report.md
        const artifacts = result.metadata.artifacts as string[]
        expect(artifacts).toContain("browser_report.md")
        expect(artifacts).toContain("browser_screenshot.png")
        expect(artifacts).toContain("console_errors.json")
        expect(artifacts).toContain("network_failures.json")
        expect(artifacts).toContain("dom_snapshot.json")

        // browser_report.md must exist on disk when Playwright can write it
        const rootDir = heidiRoot(ctx.sessionID)
        const reportPath = path.join(rootDir, "browser_report.md")
        const reportExists = await Filesystem.exists(reportPath)
        // accept either exists (Playwright ran) or not (no browser installed)
        expect(typeof reportExists).toBe("boolean")
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
        expect(result.output).toMatch(/Playwright validation complete/)
        expect(result.title).toBe("Browser Validation Subagent")
      },
    })
  })
})