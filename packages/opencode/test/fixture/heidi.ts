import { HeidiBoundary } from "../../src/heidi/boundary"
import { HeidiState } from "../../src/heidi/state"
import { root as heidiRoot } from "../../src/heidi/state"
import { Filesystem } from "../../src/util/filesystem"
import type { SessionID } from "../../src/session/schema"
import path from "path"

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

/** Write all required Phase 5 artifact files so HeidiVerify.gate can pass in tests.
 *  Does NOT write implementation_plan.md (locked by enterExecution) or
 *  verification.json (managed by HeidiState.writeVerification). */
export async function writeArtifactPack(sessionID: SessionID, { browser = false } = {}) {
  const dir = heidiRoot(sessionID)
  await Filesystem.write(path.join(dir, "task.md"), "- [x] Test task")
  await Filesystem.write(path.join(dir, "diff_summary.md"), "## Diff\nTest diff")
  await Filesystem.write(path.join(dir, "test_output.txt"), "All tests passed")
  if (browser) {
    await Filesystem.write(path.join(dir, "browser_report.md"), "# Browser Report\nAll checks passed")
  }
}
