import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"
import { VerifyState } from "./schema"

export namespace HeidiVerify {
  export async function gate(sessionID: SessionID) {
    const state = await HeidiState.read(sessionID)
    const pending = state.checklist.filter((item) => item.status !== "done")
    if (pending.length) throw new Error("verification gate failed: checklist incomplete")
    if (!state.plan.locked) throw new Error("verification gate failed: plan is not locked")
    if (state.block_reason) throw new Error("verification gate failed: blocked state")
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
