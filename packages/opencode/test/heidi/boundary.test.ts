import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiBoundary } from "../../src/heidi/boundary"
import { HeidiState } from "../../src/heidi/state"
import { Filesystem } from "../../src/util/filesystem"
import { TaskBoundaryTool } from "../../src/tool/task_boundary"
import { MessageID } from "../../src/session/schema"
import type { SessionID } from "../../src/session/schema"
import { enterExecution, enterVerification } from "../fixture/heidi"
import z from "zod"

const mode = {
  IDLE: "PLANNING",
  DISCOVERY: "PLANNING",
  PLAN_DRAFT: "PLANNING",
  PLAN_LOCKED: "PLANNING",
  EXECUTION: "EXECUTION",
  VERIFICATION: "VERIFICATION",
  COMPLETE: "VERIFICATION",
  BLOCKED: "PLANNING",
} as const

async function seed(sessionID: SessionID, fsm: keyof typeof mode) {
  const state = await HeidiState.ensure(sessionID, "matrix")
  state.run_id = "run-matrix"
  state.objective.text = "matrix"
  state.plan.path = HeidiState.plan(sessionID)
  state.fsm_state = fsm
  state.mode = mode[fsm]
  state.plan.locked = ["PLAN_LOCKED", "EXECUTION", "VERIFICATION", "COMPLETE"].includes(fsm)
  state.block_reason = null
  state.checklist = []
  state.resume.next_step = "seed"
  await HeidiState.write(sessionID, state)
  if (state.plan.locked) await HeidiState.setPlanHash(sessionID)
  return state
}

async function writePass(sessionID: SessionID) {
  await HeidiState.writeVerification(sessionID, {
    task_id: sessionID,
    status: "pass",
    checks: [{ name: "run", command: "echo ok", exit_code: 0, duration_ms: 10, log_ref: "log.txt" }],
    evidence: { changed_files: ["file1.txt"], command_summary: ["echo ok"], before_after: "ok" },
    warnings: [],
    remediation: [],
    browser: {
      required: true,
      status: "pass",
      screenshots: ["shot.png"],
      html: [],
      console_errors: [],
      network_failures: [],
    },
  })
}

describe("heidi boundary", () => {
  test("valid lifecycle writes artifacts", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterVerification(session.id, "Ship heidi runtime")
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [
            {
              name: "run",
              command: "echo ok",
              exit_code: 0,
              duration_ms: 10,
              log_ref: "log1.txt",
            },
          ],
          evidence: {
            changed_files: ["file1.txt", "file2.txt"],
            command_summary: ["echo ok", "ls"],
            before_after: "1",
          },
          browser: {
            required: true,
            status: "pass",
            screenshots: ["shot1.png", "shot2.png"],
            html: [],
            console_errors: [],
            network_failures: [],
          },
          warnings: ["all good"],
          remediation: [
            {
              file: "file1.txt",
              line: 1,
              rule_id: "R1",
              message: "no remediation needed",
              next_action: "none",
            },
          ],
        })
        const result = await HeidiBoundary.apply({
          run_id: "run-1",
          task_id: session.id,
          action: "complete",
          payload: {},
        })
        expect(result.ok).toBe(true)
        expect(result.fsm_state).toBe("COMPLETE")
        expect(result.artifacts?.exists.task_json).toBe(true)
        expect(result.artifacts?.exists.task_md).toBe(true)
        expect(result.artifacts?.exists.resume).toBe(true)
      },
    })
  })

  test("invalid transition rejects begin_execution before plan lock", async () => {
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
        ).rejects.toThrow(/PLAN_LOCKED/)
      },
    })
  })

  test("start requires non-empty objective", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await expect(
          HeidiBoundary.apply({
            run_id: "run-4",
            task_id: session.id,
            action: "start",
            payload: { objective: "" },
          }),
        ).rejects.toThrow()
      },
    })
  })

  test("set_mode rejects mismatched derived mode", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiBoundary.apply({
          run_id: "run-5",
          task_id: session.id,
          action: "start",
          payload: { objective: "Keep mode derived" },
        })
        await expect(
          HeidiBoundary.apply({
            run_id: "run-5",
            task_id: session.id,
            action: "set_mode",
            payload: { mode: "EXECUTION" },
          }),
        ).rejects.toThrow(/derived/)
      },
    })
  })

  test("set_mode allows matching derived mode without mutation", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiBoundary.apply({
          run_id: "run-6",
          task_id: session.id,
          action: "start",
          payload: { objective: "Keep planning" },
        })
        const result = await HeidiBoundary.apply({
          run_id: "run-6",
          task_id: session.id,
          action: "set_mode",
          payload: { mode: "PLANNING" },
        })
        expect(result.mode).toBe("PLANNING")
        expect(result.fsm_state).toBe("DISCOVERY")
      },
    })
  })

  test("plan-lock drift is detected", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiBoundary.apply({
          run_id: "run-3",
          task_id: session.id,
          action: "start",
          payload: { objective: "Detect drift" },
        })
        await Filesystem.write(
          (await HeidiState.files(session.id)).implementation_plan,
          "# Goal\nTest\n## Background and discovered repo facts\nNone\n## Scope\nAll\n## Files to modify\nNone\n## Change strategy by component\nNone\n## Verification plan\nNone"
        )
        await HeidiBoundary.apply({
          run_id: "run-3",
          task_id: session.id,
          action: "lock_plan",
          payload: {},
        })
        const files = await HeidiState.files(session.id)
        const planPath = files.implementation_plan
        const orig = await Filesystem.readText(planPath)
        await Filesystem.write(planPath, orig + "\n# DRIFT\n")
        await expect(
          HeidiBoundary.apply({
            run_id: "run-3",
            task_id: session.id,
            action: "begin_execution",
            payload: {},
          }),
        ).rejects.toThrow(/drift/i)
      },
    })
  })

  test("task boundary tool fills missing ids from context", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const tool = await TaskBoundaryTool.init()
        await tool.execute(
          {
            action: "start",
            payload: { objective: "Auto fill ids" },
          },
          {
            sessionID: session.id,
            messageID: MessageID.make("msg_test-task-boundary"),
            callID: "call_test-task-boundary",
            agent: "heidi",
            abort: AbortSignal.any([]),
            messages: [],
            metadata: () => {},
            ask: async () => {},
          },
        )
        const state = await HeidiState.read(session.id)
        expect(state.task_id).toBe(session.id)
        expect(state.run_id).toMatch(/^tool_/)
        expect(state.fsm_state).toBe("DISCOVERY")
      },
    })
  })

  for (const row of [
    { name: "IDLE start -> DISCOVERY", from: "IDLE", action: "start", to: "DISCOVERY" },
    { name: "IDLE block -> BLOCKED", from: "IDLE", action: "block", to: "BLOCKED" },
    { name: "DISCOVERY lock_plan -> PLAN_LOCKED", from: "DISCOVERY", action: "lock_plan", to: "PLAN_LOCKED" },
    { name: "DISCOVERY block -> BLOCKED", from: "DISCOVERY", action: "block", to: "BLOCKED" },
    { name: "PLAN_DRAFT lock_plan -> PLAN_LOCKED", from: "PLAN_DRAFT", action: "lock_plan", to: "PLAN_LOCKED" },
    { name: "PLAN_DRAFT block -> BLOCKED", from: "PLAN_DRAFT", action: "block", to: "BLOCKED" },
    { name: "PLAN_LOCKED begin_execution -> EXECUTION", from: "PLAN_LOCKED", action: "begin_execution", to: "EXECUTION" },
    { name: "PLAN_LOCKED reopen_plan -> DISCOVERY", from: "PLAN_LOCKED", action: "reopen_plan", to: "DISCOVERY" },
    { name: "PLAN_LOCKED block -> BLOCKED", from: "PLAN_LOCKED", action: "block", to: "BLOCKED" },
    { name: "EXECUTION request_verification -> VERIFICATION", from: "EXECUTION", action: "request_verification", to: "VERIFICATION" },
    { name: "EXECUTION reopen_plan -> DISCOVERY", from: "EXECUTION", action: "reopen_plan", to: "DISCOVERY" },
    { name: "EXECUTION block -> BLOCKED", from: "EXECUTION", action: "block", to: "BLOCKED" },
    { name: "VERIFICATION complete -> COMPLETE", from: "VERIFICATION", action: "complete", to: "COMPLETE" },
    { name: "VERIFICATION begin_execution -> EXECUTION", from: "VERIFICATION", action: "begin_execution", to: "EXECUTION" },
    { name: "VERIFICATION reopen_plan -> DISCOVERY", from: "VERIFICATION", action: "reopen_plan", to: "DISCOVERY" },
    { name: "VERIFICATION block -> BLOCKED", from: "VERIFICATION", action: "block", to: "BLOCKED" },
    { name: "COMPLETE block -> BLOCKED", from: "COMPLETE", action: "block", to: "BLOCKED" },
    { name: "BLOCKED block -> BLOCKED", from: "BLOCKED", action: "block", to: "BLOCKED" },
  ] as const) {
    test(`allowed transition matrix: ${row.name}`, async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})
          if (row.from !== "IDLE") await seed(session.id, row.from)

          if (row.from === "EXECUTION" || row.from === "VERIFICATION") {
            const state = await HeidiState.read(session.id)
            state.checklist = [{ id: "c1", label: "done", status: "done", category: "Modify", priority: "low" }]
            await HeidiState.write(session.id, state)
          }

          if (row.from === "VERIFICATION" && row.action === "complete") {
            await writePass(session.id)
          }

          const input = (
            row.action === "start"
              ? {
                  run_id: "run-matrix",
                  task_id: session.id,
                  action: row.action,
                  payload: { objective: "matrix" },
                }
              : row.action === "reopen_plan"
                ? {
                    run_id: "run-matrix",
                    task_id: session.id,
                    action: row.action,
                    payload: { reason: "matrix" },
                  }
                : row.action === "block"
                  ? {
                      run_id: "run-matrix",
                      task_id: session.id,
                      action: row.action,
                      payload: { reason: "matrix" },
                    }
                  : {
                      run_id: "run-matrix",
                      task_id: session.id,
                      action: row.action,
                      payload: {},
                    }
          ) as z.input<typeof HeidiBoundary.Input>

          const result = await HeidiBoundary.apply(input)

          expect(result.ok).toBe(true)
          expect(result.fsm_state).toBe(row.to)
        },
      })
    })
  }

  for (const row of [
    { name: "IDLE begin_execution", from: "IDLE", action: "begin_execution", error: /plan_locked or verification/i },
    { name: "DISCOVERY request_verification", from: "DISCOVERY", action: "request_verification", error: /plan is not locked|invalid transition/i },
    { name: "PLAN_DRAFT complete", from: "PLAN_DRAFT", action: "complete", error: /only complete from verification/i },
    { name: "PLAN_LOCKED request_verification", from: "PLAN_LOCKED", action: "request_verification", error: /invalid transition/i },
    { name: "EXECUTION complete", from: "EXECUTION", action: "complete", error: /only complete from verification/i },
    { name: "VERIFICATION lock_plan", from: "VERIFICATION", action: "lock_plan", error: /invalid transition/i },
    { name: "COMPLETE begin_execution", from: "COMPLETE", action: "begin_execution", error: /plan_locked or verification/i },
    { name: "BLOCKED complete", from: "BLOCKED", action: "complete", error: /only complete from verification/i },
  ] as const) {
    test(`illegal transition matrix rejects: ${row.name}`, async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})
          await seed(session.id, row.from)
          await expect(
            HeidiBoundary.apply({
              run_id: "run-illegal",
              task_id: session.id,
              action: row.action,
              payload: {},
            } as z.input<typeof HeidiBoundary.Input>),
          ).rejects.toThrow(row.error)
        },
      })
    })
  }

  test("plan drift rejection is explicit for begin_execution, request_verification, and complete", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const locked = await Session.create({})
        await HeidiBoundary.apply({
          run_id: "run-drift-begin",
          task_id: locked.id,
          action: "start",
          payload: { objective: "drift begin" },
        })
        await HeidiBoundary.apply({
          run_id: "run-drift-begin",
          task_id: locked.id,
          action: "lock_plan",
          payload: {},
        })
        const lockedPlan = HeidiState.plan(locked.id)
        const lockedText = await Filesystem.readText(lockedPlan)
        await Filesystem.write(lockedPlan, `${lockedText}\n# DRIFT-BEGIN\n`)
        await expect(
          HeidiBoundary.apply({
            run_id: "run-drift-begin",
            task_id: locked.id,
            action: "begin_execution",
            payload: {},
          }),
        ).rejects.toThrow(/drift/i)

        const exec = await Session.create({})
        await enterExecution(exec.id, "drift verify")
        let state = await HeidiState.read(exec.id)
        state.checklist = [{ id: "c1", label: "done", status: "done", category: "Modify", priority: "low" }]
        await HeidiState.write(exec.id, state)
        const execPlan = HeidiState.plan(exec.id)
        const execText = await Filesystem.readText(execPlan)
        await Filesystem.write(execPlan, `${execText}\n# DRIFT-VERIFY\n`)
        await expect(
          HeidiBoundary.apply({
            run_id: "run-drift-verify",
            task_id: exec.id,
            action: "request_verification",
            payload: {},
          }),
        ).rejects.toThrow(/drift/i)

        const verify = await Session.create({})
        await enterVerification(verify.id, "drift complete")
        await writePass(verify.id)
        const verifyPlan = HeidiState.plan(verify.id)
        const verifyText = await Filesystem.readText(verifyPlan)
        await Filesystem.write(verifyPlan, `${verifyText}\n# DRIFT-COMPLETE\n`)
        await expect(
          HeidiBoundary.apply({
            run_id: "run-drift-complete",
            task_id: verify.id,
            action: "complete",
            payload: {},
          }),
        ).rejects.toThrow(/drift/i)
      },
    })
  })

  test("complete requires the verification gate and persisted evidence before transition", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterVerification(session.id, "gate")

        await expect(
          HeidiBoundary.apply({
            run_id: "run-gate",
            task_id: session.id,
            action: "complete",
            payload: {},
          }),
        ).rejects.toThrow(/evidence missing/i)
      },
    })
  })

  test("auto-filled task boundary fields remain stable across repeated tool calls", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const tool = await TaskBoundaryTool.init()
        const ctx = {
          sessionID: session.id,
          messageID: MessageID.make("msg_test-task-boundary-stable"),
          callID: "call_test-task-boundary-stable",
          agent: "heidi",
          abort: AbortSignal.any([]),
          messages: [],
          metadata: () => {},
          ask: async () => {},
        }

        await tool.execute(
          {
            action: "start",
            payload: { objective: "Auto fill ids" },
          },
          ctx,
        )
        const first = await HeidiState.read(session.id)

        await tool.execute(
          {
            action: "lock_plan",
            payload: {},
          },
          ctx,
        )
        const second = await HeidiState.read(session.id)

        expect(first.task_id).toBe(session.id)
        expect(second.task_id).toBe(session.id)
        expect(second.run_id).toBe(first.run_id)
        expect(second.objective.text).toBe(first.objective.text)
        expect(second.plan.path).toBe(first.plan.path)
      },
    })
  })
})
