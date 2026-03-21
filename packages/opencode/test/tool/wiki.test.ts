import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { WikiTool } from "../../src/tool/wiki"
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

describe("tool.wiki_sync", () => {
  test("generates and updates wiki file", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const wiki = await WikiTool.init()
        const result = await wiki.execute(
          {
            action: "generate",
            component: "AuthSystem",
            markdown: "# Auth Wiki",
          },
          ctx as any,
        )
        expect(result.title).toBe("Wiki Update")
        expect(result.output).toContain("authsystem.md")
        
        const content = await fs.readFile(path.join(tmp.path, ".opencode", "wiki", "authsystem.md"), "utf8")
        expect(content).toBe("# Auth Wiki")
      },
    })
  })
})
