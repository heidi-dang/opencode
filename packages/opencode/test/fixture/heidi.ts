import { HeidiBoundary } from "../../src/heidi/boundary"
import { HeidiState } from "../../src/heidi/state"
import { Filesystem } from "../../src/util/filesystem"
import type { SessionID } from "../../src/session/schema"

export async function startTask(sessionID: SessionID, objective: string) {
  await HeidiBoundary.apply({
    run_id: `run-${sessionID}`,
    task_id: sessionID,
    action: "start",
    payload: { objective },
  })
}

export async function enterExecution(sessionID: SessionID, objective: string) {
  await startTask(sessionID, objective)
  await Filesystem.write(
    (await HeidiState.files(sessionID)).implementation_plan,
    "# Goal\nTest\n## Background and discovered repo facts\nNone\n## Scope\nAll\n## Files to modify\n- test.ts\n## Change strategy by component\nNone\n## Verification plan\n- test",
  )
  await HeidiBoundary.apply({
    run_id: `run-${sessionID}`,
    task_id: sessionID,
    action: "begin_execution",
    payload: {},
  })
}

export async function enterVerification(sessionID: SessionID, objective: string) {
  await enterExecution(sessionID, objective)
  const state = await HeidiState.read(sessionID)
  state.checklist = [{ id: "1", label: "do thing", status: "done", category: "Modify", priority: "medium" }]
  await HeidiState.write(sessionID, state)
  await HeidiBoundary.apply({
    run_id: `run-${sessionID}`,
    task_id: sessionID,
    action: "request_verification",
    payload: {},
  })
}

export async function startAndRead(sessionID: SessionID, objective: string) {
  await startTask(sessionID, objective)
  return HeidiState.read(sessionID)
}
