import { HeidiState } from "./packages/opencode/src/heidi/state"
import { HeidiBoundary } from "./packages/opencode/src/heidi/boundary"
import { HeidiExec } from "./packages/opencode/src/heidi/exec"
import { Instance } from "./packages/opencode/src/project/instance"
import { ReadTool } from "./packages/opencode/src/tool/read"
import { WriteTool } from "./packages/opencode/src/tool/write"
import { EditTool } from "./packages/opencode/src/tool/edit"
import { TransactionTool } from "./packages/opencode/src/tool/transaction"
import { VerifyTool } from "./packages/opencode/src/tool/verify"
import { Filesystem } from "./packages/opencode/src/util/filesystem"
import * as fs from "fs/promises"
import * as path from "path"

const sessionID = `ses_test-phase3-${Date.now()}` as any
const testFile = path.join(process.cwd(), "test_phase3.txt")

async function run() {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      console.log("Starting Phase 3 Verification...")
      
      const transaction = await TransactionTool.init()
      const edit = await EditTool.init()
      const verify = await VerifyTool.init()
      const read = await ReadTool.init()

      const ctxMock = {
        sessionID,
        ask: async () => {},
        metadata: () => {},
        messages: [],
        extra: {}
      } as any

      // Setup
      await fs.writeFile(testFile, "line1\nline2\nline3\nline4\nline5\n")
      
      // 1. Test Atomic Transaction with Rollback
      console.log("\n1. Testing Atomic Transaction (Rollback on Error)...")
      const state = await HeidiState.ensure(sessionID, "Verify Phase 3")
      
      // Align FSM
      await HeidiBoundary.apply({ run_id: "r1", task_id: sessionID, action: "start", payload: {} })
      const state2 = await HeidiState.read(sessionID)
      state2.plan.path = "p1"
      state2.checklist = [{ id: "i1", label: "task", status: "todo", category: "Modify" }]
      await HeidiState.write(sessionID, state2)
      await HeidiBoundary.apply({ run_id: "r1", task_id: sessionID, action: "lock_plan", payload: {} })
      await HeidiBoundary.apply({ run_id: "r1", task_id: sessionID, action: "begin_execution", payload: {} })

      // Current state: EXECUTION
      
      // PRE-READ (Phase 2 Safety)
      await read.execute({ filePath: testFile }, ctxMock)

      // Begin transaction
      await transaction.execute({ action: "begin", name: "multi-edit" }, ctxMock)
      
      // Apply first edit
      await edit.execute({ filePath: testFile, oldString: "line2", newString: "line2-mod" }, ctxMock)
      
      // Apply second edit that FAILS
      try {
        await edit.execute({ filePath: testFile, oldString: "MISSING", newString: "ERROR" }, ctxMock)
        console.error("FAIL: Second edit should have failed")
      } catch (e) {
        console.log("PASS: Second edit failed as expected:", (e as Error).message)
      }

      // Verify FIRST edit was rolled back
      const content = await fs.readFile(testFile, "utf8")
      if (content.includes("line2-mod")) {
        console.error("FAIL: First edit was NOT rolled back!")
      } else {
        console.log("PASS: First edit was correctly rolled back.")
      }

      // 2. Test Precision Anchoring
      console.log("\n2. Testing Precision Anchoring...")
      await fs.writeFile(testFile, "header\nfoo\nmiddle\nfoo\nfooter\n")
      
      // Re-read after native write
      await read.execute({ filePath: testFile }, ctxMock)

      // Try to replace 'foo' without context (should fail)
      try {
        await edit.execute({ filePath: testFile, oldString: "foo", newString: "bar" }, ctxMock)
        console.error("FAIL: Ambiguous replacement should have failed")
      } catch (e) {
        console.log("PASS: Ambiguous replacement failed as expected.")
      }

      // Replace 'foo' with 'before' context
      await edit.execute({ 
        filePath: testFile, 
        oldString: "foo", 
        newString: "bar-1",
        before: "header\n"
      }, ctxMock)

      const contentPrecision = await fs.readFile(testFile, "utf8")
      if (contentPrecision.includes("header\nbar-1\nmiddle\nfoo")) {
        console.log("PASS: Precision anchoring matched the correct occurrence.")
      } else {
        console.error("FAIL: Precision anchoring did not match correctly. Content:\n", contentPrecision)
      }

      // 3. Test Verification Gate
      console.log("\n3. Testing Verification Gate...")
      // Mark task as done
      const s3 = await HeidiState.read(sessionID)
      s3.checklist[0].status = "done"
      await HeidiState.write(sessionID, s3)
      
      // Submit verification Proof of Work
      console.log("Submitting proof of work...")
      await verify.execute({
        status: "pass",
        checks: [{ name: "build", command: "bun build", exit_code: 0, duration_ms: 100 }],
        evidence: { changed_files: [testFile], command_summary: ["built successfully"], before_after: "diff..." },
        warnings: [],
        remediation: []
      }, ctxMock)

      const s4 = await HeidiState.read(sessionID)
      console.log("New FSM state:", s4.fsm_state)
      if (s4.fsm_state === "VERIFICATION") {
        console.log("PASS: Successfully transitioned to VERIFICATION via proof of work.")
      } else {
        console.error("FAIL: FSM state is not VERIFICATION")
      }

      // Complete the task
      console.log("Completing task...")
      const res = await HeidiBoundary.apply({
        run_id: "r1",
        task_id: sessionID,
        action: "complete",
        payload: {
          verification: {
            task_id: sessionID,
            status: "pass",
            checks: [],
            evidence: { changed_files: [], command_summary: [], before_after: "" },
            warnings: [],
            remediation: []
          }
        }
      })

      if (res.fsm_state === "COMPLETE") {
        console.log("PASS: Task completed successfully.")
      } else {
        console.error("FAIL: Task did not reach COMPLETE state.")
      }

      // Cleanup
      await fs.unlink(testFile)
    }
  })
}

run().catch(console.error)
