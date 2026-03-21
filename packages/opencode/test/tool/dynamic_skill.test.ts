import { describe, expect, test } from "bun:test"
import { DynamicSkillTool } from "../../src/tool/dynamic_skill"
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

describe("tool.dynamic_skill", () => {
  test("discovers and installs a community skill", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const loader = await DynamicSkillTool.init()
        // Try searching for an invalid skill
        const invalidResult = await loader.execute({ query: "non_existent_skill_123" }, ctx as any)
        expect(invalidResult.output).toContain("Could not find a perfect match")
        
        // Try searching for pydantic-ai which is in the awesome-skills repo
        const validResult = await loader.execute({ query: "pydantic" }, ctx as any)
        expect(validResult.output).toContain("Successfully discovered and installed community skill: pydantic-models-py")
      },
    })
  }, 30000)
})
