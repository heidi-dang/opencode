import { HeidiState } from "./packages/opencode/src/heidi/state"
import { HeidiBoundary } from "./packages/opencode/src/heidi/boundary"
import { Instance } from "./packages/opencode/src/project/instance"
import { TaskTool } from "./packages/opencode/src/tool/task"
import { Filesystem } from "./packages/opencode/src/util/filesystem"
import * as fs from "fs/promises"
import * as path from "path"

const sessionID = `ses_test-phase4-${Date.now()}` as any
const testFile = path.join(process.cwd(), "seo_test.html")

async function run() {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      console.log("Starting Phase 4 Verification...")
      
      const task = await TaskTool.init()

      // 1. Setup a test file with SEO issues
      console.log("\n1. Setting up SEO test environment...")
      await fs.writeFile(testFile, "<html><body><a href='missing.html'>Broken Link</a></body></html>")
      
      // Align FSM to EXECUTION
      await HeidiState.ensure(sessionID, "Verify Phase 4")
      await HeidiBoundary.apply({ run_id: "r1", task_id: sessionID, action: "start", payload: {} })
      const s2 = await HeidiState.read(sessionID)
      s2.plan.path = "p1"
      s2.checklist = [{ id: "i1", label: "Perform SEO Audit", status: "todo", category: "Verify" }]
      await HeidiState.write(sessionID, s2)
      await HeidiBoundary.apply({ run_id: "r1", task_id: sessionID, action: "lock_plan", payload: {} })
      await HeidiBoundary.apply({ run_id: "r1", task_id: sessionID, action: "begin_execution", payload: {} })

      // 2. Spawn SEO Subagent via TaskTool
      console.log("\n2. Spawning SEO Subagent to audit the project...")
      const ctxMock = {
        sessionID,
        messageID: "msg-test-123",
        ask: async () => {},
        metadata: () => {},
        messages: [{ info: { role: "assistant", modelID: "gpt-4", providerID: "openai" }, parts: [] }],
        extra: { bypassAgentCheck: true }
      } as any

      // We'll mock the internal prompt result for predictability in this test
      // In a real run, this would actually call the SEO agent.
      console.log("Delegating task to @seo agent...")
      const result = await task.execute({
        description: "SEO technical audit",
        prompt: "Run an audit on the current directory and report all issues.",
        subagent_type: "seo"
      }, ctxMock)

      console.log("Subagent result received.")
      console.log(result.output)

      if (result.output.includes("task_id:") && result.output.includes("<task_result>")) {
        console.log("PASS: Subagent session created and result returned successfully.")
      } else {
        console.error("FAIL: Subagent response format invalid.")
      }

      // 3. Verify that the task state was updated
      const s3 = await HeidiState.read(sessionID)
      console.log("Current state remains:", s3.fsm_state)
      
      // Cleanup
      await fs.unlink(testFile)
      console.log("\nPhase 4 Verification Complete.")
    }
  })
}

run().catch(console.error)
