import { describe, expect, test } from "bun:test"
import { AuditorTool } from "../../src/tool/auditor"
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

describe("tool.vibe_audit", () => {
  test("executes auditor and catches failures", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const auditor = await AuditorTool.init()
        
        // No files
        const emptyResult = await auditor.execute({ files: [] }, ctx as any)
        expect(emptyResult.title).toBe("Vibe Audit")
        
        // Fake file
        const result = await auditor.execute({ files: ["fake.ts"] }, ctx as any)
        expect(result.title).toBe("Vibe Audit")
        expect(result.output).toBeDefined()
      },
    })
  })
})
