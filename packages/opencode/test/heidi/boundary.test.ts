import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiBoundary } from "../../src/heidi/boundary"
import { HeidiState } from "../../src/heidi/state"
import { Filesystem } from "../../src/util/filesystem"
import { TaskBoundaryTool } from "../../src/tool/task_boundary"
import { MessageID } from "../../src/session/schema"
import { enterVerification } from "../fixture/heidi"
import { PlanExitTool } from "../../src/tool/plan"
import * as QuestionModule from "../../src/question"
import { MessageV2 } from "../../src/session/message-v2"

describe("heidi boundary", () => {
  let ask: ReturnType<typeof spyOn>

  beforeEach(() => {
    ask = spyOn(QuestionModule.Question, "ask")
  })

  afterEach(() => {
    ask.mockRestore()
  })

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

  test("begin_execution auto-locks a complete plan from discovery", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiBoundary.apply({
          run_id: "run-2",
          task_id: session.id,
          action: "start",
          payload: { objective: "Auto-lock and execute" },
        })
        await Filesystem.write(
          (await HeidiState.files(session.id)).implementation_plan,
          "# Goal\nTest\n## Background and discovered repo facts\nNone\n## Scope\nAll\n## Files to modify\n- test.ts\n## Change strategy by component\nNone\n## Verification plan\n- test",
        )
        const result = await HeidiBoundary.apply({
          run_id: "run-2",
          task_id: session.id,
          action: "begin_execution",
          payload: {},
        })
        expect(result.fsm_state).toBe("EXECUTION")
        const state = await HeidiState.read(session.id)
        expect(state.plan.locked).toBe(true)
        expect(state.objective.locked).toBe(true)
      },
    })
  })

  test("begin_execution gives guided error when plan is incomplete", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiBoundary.apply({
          run_id: "run-2b",
          task_id: session.id,
          action: "start",
          payload: { objective: "Explain next step" },
        })
        await expect(
          HeidiBoundary.apply({
            run_id: "run-2b",
            task_id: session.id,
            action: "begin_execution",
            payload: {},
          }),
        ).rejects.toThrow(/Missing sections: .*Next action: lock_plan/i)
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

  test("set_mode allows switching mode without throwing (softened error)", async () => {
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
        const result = await HeidiBoundary.apply({
          run_id: "run-5",
          task_id: session.id,
          action: "set_mode",
          payload: { mode: "EXECUTION" },
        })
        expect(result.ok).toBe(true)
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
          "# Goal\nTest\n## Background and discovered repo facts\nNone\n## Scope\nAll\n## Files to modify\nNone\n## Change strategy by component\nNone\n## Verification plan\nNone",
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
        expect(state.resume.next_step).toBe("write_plan")
      },
    })
  })

  test("task boundary tool begin_execution auto-locks complete plan", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const tool = await TaskBoundaryTool.init()
        await tool.execute(
          {
            action: "start",
            payload: { objective: "Tool path execution" },
          },
          {
            sessionID: session.id,
            messageID: MessageID.make("msg_test-task-boundary-exec"),
            callID: "call_test-task-boundary-exec",
            agent: "heidi",
            abort: AbortSignal.any([]),
            messages: [],
            metadata: () => {},
            ask: async () => {},
          },
        )
        await Filesystem.write(
          (await HeidiState.files(session.id)).implementation_plan,
          "# Goal\nTest\n## Background and discovered repo facts\nNone\n## Scope\nAll\n## Files to modify\n- test.ts\n## Change strategy by component\nNone\n## Verification plan\n- test",
        )
        const result = await tool.execute(
          {
            action: "begin_execution",
            payload: {},
          },
          {
            sessionID: session.id,
            messageID: MessageID.make("msg_test-task-boundary-exec"),
            callID: "call_test-task-boundary-exec",
            agent: "heidi",
            abort: AbortSignal.any([]),
            messages: [],
            metadata: () => {},
            ask: async () => {},
          },
        )
        expect(result.metadata.fsm_state).toBe("EXECUTION")
      },
    })
  })

  test("task boundary tool begin_execution preserves guided error", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const tool = await TaskBoundaryTool.init()
        await tool.execute(
          {
            action: "start",
            payload: { objective: "Tool path error" },
          },
          {
            sessionID: session.id,
            messageID: MessageID.make("msg_test-task-boundary-err"),
            callID: "call_test-task-boundary-err",
            agent: "heidi",
            abort: AbortSignal.any([]),
            messages: [],
            metadata: () => {},
            ask: async () => {},
          },
        )
        await expect(
          tool.execute(
            {
              action: "begin_execution",
              payload: {},
            },
            {
              sessionID: session.id,
              messageID: MessageID.make("msg_test-task-boundary-err"),
              callID: "call_test-task-boundary-err",
              agent: "heidi",
              abort: AbortSignal.any([]),
              messages: [],
              metadata: () => {},
              ask: async () => {},
            },
          ),
        ).rejects.toThrow(/Missing sections: .*Next action: lock_plan/i)
      },
    })
  })

  test("plan_exit begins execution before switching to build agent", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiBoundary.apply({
          run_id: "run-plan-exit",
          task_id: session.id,
          action: "start",
          payload: { objective: "Plan exit handoff" },
        })
        await Filesystem.write(
          (await HeidiState.files(session.id)).implementation_plan,
          "# Goal\nTest\n## Background and discovered repo facts\nNone\n## Scope\nAll\n## Files to modify\n- test.ts\n## Change strategy by component\nNone\n## Verification plan\n- test",
        )
        ask.mockResolvedValueOnce([["Yes"]])
        const tool = await PlanExitTool.init()
        await tool.execute(
          {},
          {
            sessionID: session.id,
            messageID: MessageID.make("msg_plan_exit"),
            callID: "call_plan_exit",
            agent: "plan",
            abort: AbortSignal.any([]),
            messages: [],
            metadata: () => {},
            ask: async () => {},
          },
        )
        const state = await HeidiState.read(session.id)
        expect(state.fsm_state).toBe("EXECUTION")
        const msgs = await Session.messages({ sessionID: session.id, limit: 1 })
        expect(msgs[0]?.parts.some((part) => part.type === "text" && "synthetic" in part && part.synthetic)).toBe(true)
      },
    })
  })

  test("plan_exit does not switch agent when begin_execution fails", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await HeidiBoundary.apply({
          run_id: "run-plan-exit-fail",
          task_id: session.id,
          action: "start",
          payload: { objective: "Plan exit blocked" },
        })
        ask.mockResolvedValueOnce([["Yes"]])
        const tool = await PlanExitTool.init()
        await expect(
          tool.execute(
            {},
            {
              sessionID: session.id,
              messageID: MessageID.make("msg_plan_exit_fail"),
              callID: "call_plan_exit_fail",
              agent: "plan",
              abort: AbortSignal.any([]),
              messages: [],
              metadata: () => {},
              ask: async () => {},
            },
          ),
        ).rejects.toThrow(/Missing sections: .*Next action: lock_plan/i)
        const state = await HeidiState.read(session.id)
        expect(state.fsm_state).toBe("DISCOVERY")
        const msgs = await Array.fromAsync(MessageV2.stream(session.id))
        expect(
          msgs
            .flatMap((msg) => msg.parts)
            .some((part) => part.type === "text" && "synthetic" in part && part.synthetic),
        ).toBe(false)
      },
    })
  })
})
