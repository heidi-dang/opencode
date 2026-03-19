import { HeidiMemory } from "./packages/opencode/src/heidi/memory"
import { Instance } from "./packages/opencode/src/project/instance"
import { SystemPrompt } from "./packages/opencode/src/session/system"
import { Provider } from "./packages/opencode/src/provider/provider"
import { Filesystem } from "./packages/opencode/src/util/filesystem"
import * as fs from "fs/promises"
import path from "path"

const sessionA = "ses_phase5_A" as any
const sessionB = "ses_phase5_B" as any

async function run() {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      console.log("Starting Phase 5 Verification...")

      // 1. Clear existing memory for a clean test
      const memFile = path.join(process.cwd(), ".opencode", "heidi", "memory.jsonl")
      await fs.rm(memFile, { force: true })
      
      console.log("\n1. Saving a fact in Session A...")
      await HeidiMemory.add(sessionA, {
        type: "fact",
        key: "Project Secret",
        content: "The password to the mainframe is 'antigravity-123'"
      }, "project")

      // 2. Query in Session B (simulated by checking System Prompt)
      console.log("\n2. Simulating Session B and checking System Prompt...")
      const mockModel = {
        id: "gpt-4",
        providerID: "openai",
        api: { id: "gpt-4" }
      } as any
      const env = await SystemPrompt.environment(mockModel)
      const systemPromptText = env.join("\n")

      if (systemPromptText.includes("antigravity-123")) {
        console.log("PASS: Memory successfully injected into the system prompt of a new session.")
      } else {
        console.error("FAIL: Memory missing from system prompt.")
        console.log("Got prompt fragment:", systemPromptText.slice(-500))
      }

      // 3. Test Search Tool functionality
      console.log("\n3. Testing Memory Search Tool logic...")
      const results = await HeidiMemory.query("Secret", "project")
      if (results.length > 0 && results[0].content.includes("antigravity-123")) {
        console.log("PASS: Memory search returned correct results.")
      } else {
        console.error("FAIL: Memory search failed.")
      }

      console.log("\nPhase 5 Verification Complete.")
    }
  })
}

run().catch(console.error)
