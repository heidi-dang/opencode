
import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiBoundary } from "../../src/heidi/boundary"
import { HeidiState } from "../../src/heidi/state"
import { Filesystem } from "../../src/util/filesystem"

describe("heidi boundary", () => {
  test("valid lifecycle writes artifacts", async () => {
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
        state.objective.text = "Ship heidi runtime"
        await HeidiState.write(session.id, state)
        await HeidiBoundary.apply({
          run_id: "run-1",
          task_id: session.id,
          action: "lock_plan",
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
          action: "begin_execution",
          payload: {},
        })
        await HeidiBoundary.apply({
          run_id: "run-1",
          task_id: session.id,
          action: "request_verification",
          payload: {},
        })
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [
            {
              name: "run",
              command: "echo ok",
              exit_code: 0,
              duration_ms: 10,
              log_ref: "log1.txt"
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
              next_action: "none"
            }
          ],
        })
        const result = await HeidiBoundary.apply({
          run_id: "run-1",
          task_id: session.id,
          action: "complete",
          payload: {
            verification: {
              task_id: session.id,
              status: "pass",
              checks: [
                {
                  name: "run",
                  command: "echo ok",
                  exit_code: 0,
                  duration_ms: 10,
                  log_ref: "log1.txt"
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
                  next_action: "none"
                }
              ],
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
        ).rejects.toThrow()
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
})
