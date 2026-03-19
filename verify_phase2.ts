import { Instance } from "./packages/opencode/src/project/instance"
import { HeidiExec } from "./packages/opencode/src/heidi/exec"
import { HeidiState } from "./packages/opencode/src/heidi/state"
import { SessionID } from "./packages/opencode/src/session/schema"
import { Filesystem } from "./packages/opencode/src/util/filesystem"
import { HeidiBoundary } from "./packages/opencode/src/heidi/boundary"
import { git } from "./packages/opencode/src/util/git"
import path from "path"

async function run() {
  const directory = process.cwd()
  const sessionID = "ses_test-phase2-v2" as SessionID

  await Instance.provide({
    directory,
    fn: async () => {
      console.log("--- Initializing Task ---")
      await HeidiBoundary.apply({
        run_id: "test-run-2",
        task_id: sessionID,
        action: "start",
        payload: { objective: "Test execution safety" }
      })

      const testFile = path.join(directory, "phase2_test.txt")
      await Filesystem.write(testFile, "initial content")

      console.log("\n--- Testing Git Checkpoint & Write ---")
      // Mock being in EXECUTION
      const state = await HeidiState.read(sessionID)
      state.fsm_state = "EXECUTION"
      await HeidiState.write(sessionID, state)

      const id = await HeidiExec.checkpoint(sessionID, "test-edit", [testFile])
      console.log("Checkpoint created:", id)

      const ref = `refs/heidi/checkpoints/${sessionID}/${id}`
      const checkRef = await git(["rev-parse", "--verify", ref], { cwd: directory })
      if (checkRef.exitCode === 0) {
        console.log("Git Ref Verified:", checkRef.text().trim())
      } else {
        console.log("Git Ref Failed")
        process.exit(1)
      }

      console.log("\n--- Testing Rollback ---")
      await Filesystem.write(testFile, "TAMPERED CONTENT")
      console.log("Modified file. Content:", await Filesystem.readText(testFile))
      
      await HeidiExec.rollback(sessionID, id)
      const restored = await Filesystem.readText(testFile)
      console.log("Restored content:", restored)
      
      if (restored === "initial content") {
        console.log("Rollback Success")
      } else {
        console.log("Rollback Failed")
        process.exit(1)
      }

      console.log("\n--- Testing Workspace Jail ---")
      try {
        const jail = require("./packages/opencode/src/heidi/jail").HeidiJail
        jail.assert("/tmp/escape.txt")
        console.log("Jail Failed (allowed escape)")
        process.exit(1)
      } catch (e: any) {
        console.log("Jail Success (blocked escape):", e.message)
      }

      console.log("\nPHASE 2 VERIFICATION SUCCESS")
      const fs = require("fs/promises")
      await fs.unlink(testFile)
      // Clean up ref
      await git(["update-ref", "-d", ref], { cwd: directory })
    }
  })
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
