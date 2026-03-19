import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiBoundary } from "../../src/heidi/boundary"
import { HeidiState } from "../../src/heidi/state"

describe("heidi boundary", () => {
  test("walks valid lifecycle and writes artifacts", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiBoundary.apply({
          run_id: "run-1",
          task_id: session.id,
          action: "start",
          payload: { objective: "Ship heidi runtime" },
        })

        let state = await HeidiState.read(session.id)
        expect(state.fsm_state).toBe("DISCOVERY")

        await HeidiBoundary.apply({
          run_id: "run-1",
          task_id: session.id,
          action: "lock_plan",
          payload: {},
        })

        await HeidiBoundary.apply({
          run_id: "run-1",
          task_id: session.id,
          action: "begin_execution",
          payload: {},
        })

        state = await HeidiState.read(session.id)
        state.checklist.push({
          id: "c1",
          label: "implement",
          status: "done",
          category: "Modify",
        })
        await HeidiState.write(session.id, state)

        await HeidiBoundary.apply({
          run_id: "run-1",
          task_id: session.id,
          action: "request_verification",
          payload: {},
        })

        const result = await HeidiBoundary.apply({
          run_id: "run-1",
          task_id: session.id,
          action: "complete",
          payload: {
            verification: {
              task_id: session.id,
              status: "pass",
              checks: [],
              evidence: {
                changed_files: [],
                command_summary: [],
                before_after: "ok",
              },
              warnings: [],
              remediation: [],
            },
          },
        })

        expect(result.ok).toBe(true)
        expect(result.fsm_state).toBe("COMPLETE")
        expect(result.artifacts?.exists.task_json).toBe(true)
        expect(result.artifacts?.exists.task_md).toBe(true)
        expect(result.artifacts?.exists.resume).toBe(true)
      },
    })
  })

  test("rejects invalid transition", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await expect(
          HeidiBoundary.apply({
            run_id: "run-2",
            task_id: session.id,
            action: "begin_execution",
            payload: {},
          }),
        ).rejects.toThrow("Plan must be locked")
      },
    })
  })
})
