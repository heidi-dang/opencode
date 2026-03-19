import { PatternTool } from "./packages/opencode/src/tool/pattern"
import { Instance } from "./packages/opencode/src/project/instance"

async function run() {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      console.log("Starting Phase 6 Verification...")

      const tool = await PatternTool.init()

      // 1. Mock session history with repeating patterns
      const mockMessages: any[] = [
        { parts: [{ type: "tool", tool: "read" }, { type: "tool", tool: "edit" }] },
        { parts: [{ type: "tool", tool: "read" }, { type: "tool", tool: "edit" }] },
        { parts: [{ type: "tool", tool: "task" }] }
      ]

      console.log("\n1. Testing pattern detection (read -> edit)...")
      const result = await tool.execute({
        min_sequence_length: 2,
        min_occurrences: 2
      }, {
        messages: mockMessages,
        sessionID: "ses_phase6",
        messageID: "msg_phase6",
        callID: "call_phase6",
        agent: "general",
        abort: new AbortController().signal,
        ask: async () => {},
        metadata: async () => {}
      } as any)

      console.log("Title:", result.title)
      console.log("Output:", result.output)

      if (result.output.includes("read -> edit") && result.metadata.count > 0) {
        console.log("PASS: Pattern 'read -> edit' detected correctly.")
      } else {
        console.error("FAIL: Pattern not detected.")
        console.log("Metadata:", JSON.stringify(result.metadata, null, 2))
      }

      console.log("\nPhase 6 Verification Complete.")
    }
  })
}

run().catch(console.error)
