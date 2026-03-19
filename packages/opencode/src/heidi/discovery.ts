import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"

const LIMIT = 8

export namespace HeidiDiscovery {
  export async function start(sessionID: SessionID) {
    const state = await HeidiState.ensure(sessionID, "")
    if (state.fsm_state === "IDLE") {
      state.fsm_state = "DISCOVERY"
      state.mode = "PLANNING"
    }
    if (!state.resume.failed_hypotheses) state.resume.failed_hypotheses = []
    state.resume.next_step = "DISCOVERY"
    await HeidiState.write(sessionID, state)
  }

  export async function action(sessionID: SessionID, key: string) {
    const state = await HeidiState.ensure(sessionID, "")
    const use = state.resume.failed_hypotheses.filter((x) => x.startsWith("discovery:")).length
    const token = `discovery:${key}`
    state.resume.failed_hypotheses.push(token)
    if (use + 1 >= LIMIT && state.fsm_state === "DISCOVERY") {
      state.fsm_state = "PLAN_DRAFT"
      state.next_transition = "PLAN_DRAFT->PLAN_LOCKED"
      state.resume.next_step = "PLAN_DRAFT"
    }
    await HeidiState.write(sessionID, state)
    await HeidiState.updateResume(sessionID)
  }
}
