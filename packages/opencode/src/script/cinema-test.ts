import { HeidiState } from "../heidi/state"
import { HeidiBoundary } from "../heidi/boundary"
import { SessionID } from "../../session/schema"

/**
 * Stress tests the Heidi Cinema UI layers and transitions.
 * Run with: bun ./packages/opencode/script/cinema-test.ts
 */
async function test() {
  const sessionID = "ses_cinema_stress" as any
  console.log("🎬 Starting Heidi Cinema Stress Test...")

  // 1. Restart / Discovery
  console.log("Phase 1: Discovery (Restart)")
  await HeidiBoundary.apply({
    action: "start",
    payload: { objective: "Stress test the 4-layer UI stack with a complex refactor" },
    task_id: sessionID
  })

  const state = await HeidiState.read(sessionID)
  console.log(`Current state: ${state.fsm_state} (${state.mode})`)

  // 2. Planning
  console.log("Phase 2: Planning")
  // (In real life, Heidi would write a plan and lock it)
  
  console.log("✅ Stress test session prepared. Open the UI and check 'ses_cinema_stress'.")
}

test().catch(console.error)
