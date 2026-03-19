import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"
import { VerifyState } from "./schema"

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
    if (!verify.checks || verify.checks.length < 1) throw new Error("verification gate failed: checks missing")
    if (!verify.evidence ||
      !Array.isArray(verify.evidence.changed_files) || verify.evidence.changed_files.length < 1 ||
      !Array.isArray(verify.evidence.command_summary) || verify.evidence.command_summary.length < 1 ||
      !verify.evidence.before_after) {
      throw new Error("verification gate failed: evidence is empty or ceremonial")
    }
    if (!verify.browser || verify.browser.required !== true || verify.browser.status !== "pass") {
      throw new Error("verification gate failed: browser evidence missing or stubbed")
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
