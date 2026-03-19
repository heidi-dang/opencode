import z from "zod"
import { Tool } from "./tool"
import { HeidiVerify } from "../heidi/verify"
import { HeidiState } from "../heidi/state"
import { HeidiBoundary } from "../heidi/boundary"
import { VerifyState } from "../heidi/schema"

export const VerifyTool = Tool.define("verify", {
  description: "Submit formal proof of work (evidence) to verify the current task. Transition state to VERIFICATION.",
  parameters: VerifyState.omit({ task_id: true }),
  async execute(params, ctx) {
    const state = await HeidiState.read(ctx.sessionID)
    
    // Auto-transition if in EXECUTION
    if (state.fsm_state === "EXECUTION") {
      await HeidiBoundary.apply({
        run_id: state.run_id,
        task_id: ctx.sessionID,
        action: "request_verification",
        payload: {}
      })
    }

    const current = await HeidiState.read(ctx.sessionID)
    if (current.fsm_state !== "VERIFICATION") {
      throw new Error(`verify is only available in VERIFICATION state. Current: ${current.fsm_state}`)
    }

    const verify = await HeidiVerify.write(ctx.sessionID, {
      ...params,
      task_id: ctx.sessionID
    })

    return {
      title: `Verification: ${verify.status.toUpperCase()}`,
      metadata: {
        status: verify.status,
        checks: verify.checks.length,
        evidence: verify.evidence
      },
      output: `Task verification ${verify.status === "pass" ? "PASSED" : "FAILED"}. Evidence recorded in task state.`
    }
  }
})
