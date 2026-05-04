import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"
import { VerifyState } from "./schema"
import { Filesystem } from "@/util/filesystem"
import path from "path"

export namespace HeidiVerify {
  export async function preflight(sessionID: SessionID) {
    const state = await HeidiState.read(sessionID)
    const pending = state.checklist.filter((item) => item.status !== "done")
    if (pending.length) throw new Error("verification gate failed: checklist incomplete")
    if (!state.plan.locked) throw new Error("verification gate failed: plan is not locked")
    if (state.block_reason) throw new Error("verification gate failed: blocked state")
    if (typeof HeidiState.checkPlanDrift === "function") {
      await HeidiState.checkPlanDrift(sessionID)
    }
    return true
  }

  export async function gate(sessionID: SessionID) {
    await HeidiVerify.preflight(sessionID)
    const verify = await HeidiState.readVerification(sessionID)
    if (!verify) throw new Error("verification gate failed: evidence missing")
    if (verify.status !== "pass") throw new Error("verification gate failed: status is not pass")
    if (!verify.checks || verify.checks.length < 1) throw new Error("verification gate failed: checks missing")
    if (!verify.evidence) throw new Error("verification gate failed: evidence content missing")
    const hasEvidence =
      typeof verify.evidence === "string"
        ? verify.evidence.length > 0
        : verify.evidence.changed_files.length > 0 || verify.evidence.command_summary.length > 0

    if (!hasEvidence) {
      throw new Error("verification gate failed: evidence is empty or ceremonial")
    }
    if (verify.browser?.required === true && verify.browser.status !== "pass") {
      throw new Error("verification gate failed: browser evidence missing or failed")
    }

    // Phase 5: Artifact-First Task Pack Validator checks
    const rootDir = HeidiState.root(sessionID)
    const requiredFiles = [
      "implementation_plan.md",
      "task.md",
      "verification.json",
      "diff_summary.md",
      "test_output.txt"
    ]
    
    if (verify.browser?.required === true) {
      requiredFiles.push("browser_report.md")
    }

    for (const file of requiredFiles) {
      const exists = await Filesystem.exists(path.join(rootDir, file))
      if (!exists) {
        throw new Error(`verification gate failed: missing required artifact ${file}`)
      }
    }

    return true
  }

  export async function write(sessionID: SessionID, input: VerifyState) {
    const verify = VerifyState.parse(input)
    await HeidiState.writeVerification(sessionID, verify)
    const state = await HeidiState.read(sessionID)
    state.verification_commands = verify.checks.map((item) => item.command)
    await HeidiState.write(sessionID, state)
    await HeidiState.updateResume(sessionID)
    return verify
  }
}
