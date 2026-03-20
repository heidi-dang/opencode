import { describe, expect, spyOn, test } from "bun:test"
import { Agent } from "../../src/agent/agent"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageID } from "../../src/session/schema"
import type { SessionID } from "../../src/session/schema"
import { TaskTool } from "../../src/tool/task"
import { tmpdir } from "../fixture/fixture"

function taskCtx(sessionID: SessionID, abort = new AbortController()) {
  const metadata: unknown[] = []
  return {
    abort,
    metadata,
    ctx: {
      sessionID,
      messageID: MessageID.ascending(),
      agent: "build",
      abort: abort.signal,
      messages: [],
      extra: { bypassAgentCheck: true },
      metadata(input: unknown) {
        metadata.push(input)
      },
      ask: async () => {},
    } as any,
  }
}

function subagentConfig() {
  return {
    config: {
      agent: {
        stall: {
          description: "Stall agent",
          mode: "subagent" as const,
          model: "openai/gpt-5.2",
        },
      },
    },
  }
}

function setGuardEnv(input: { timeout?: string; iterations?: string }) {
  const prev = {
    timeout: process.env.OPENCODE_TASK_TIMEOUT_MS,
    iterations: process.env.OPENCODE_TASK_MAX_ITERATIONS,
  }
  if (input.timeout === undefined) delete process.env.OPENCODE_TASK_TIMEOUT_MS
  else process.env.OPENCODE_TASK_TIMEOUT_MS = input.timeout
  if (input.iterations === undefined) delete process.env.OPENCODE_TASK_MAX_ITERATIONS
  else process.env.OPENCODE_TASK_MAX_ITERATIONS = input.iterations
  return () => {
    if (prev.timeout === undefined) delete process.env.OPENCODE_TASK_TIMEOUT_MS
    else process.env.OPENCODE_TASK_TIMEOUT_MS = prev.timeout
    if (prev.iterations === undefined) delete process.env.OPENCODE_TASK_MAX_ITERATIONS
    else process.env.OPENCODE_TASK_MAX_ITERATIONS = prev.iterations
  }
}

describe("tool.task", () => {
  test("description sorts subagents by name and is stable across calls", async () => {
    await using tmp = await tmpdir({
      config: {
        agent: {
          zebra: {
            description: "Zebra agent",
            mode: "subagent",
          },
          alpha: {
            description: "Alpha agent",
            mode: "subagent",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const build = await Agent.get("build")
        const first = await TaskTool.init({ agent: build })
        const second = await TaskTool.init({ agent: build })

        expect(first.description).toBe(second.description)

        const alpha = first.description.indexOf("- alpha: Alpha agent")
        const explore = first.description.indexOf("- explore:")
        const general = first.description.indexOf("- general:")
        const zebra = first.description.indexOf("- zebra: Zebra agent")

        expect(alpha).toBeGreaterThan(-1)
        expect(explore).toBeGreaterThan(alpha)
        expect(general).toBeGreaterThan(explore)
        expect(zebra).toBeGreaterThan(general)
      },
    })
  })

  test("returns structured timeout metadata when a subagent exceeds the hard timeout", async () => {
    const restore = setGuardEnv({ timeout: "10", iterations: "8" })
    const prompt = spyOn(SessionPrompt as any, "prompt").mockImplementation(
      () => new Promise(() => {}) as never,
    )
    const cancel = spyOn(SessionPrompt, "cancel").mockImplementation(() => undefined)

    try {
      await using tmp = await tmpdir(subagentConfig())
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const parent = await Session.create({})
          const tool = await TaskTool.init()
          const { ctx } = taskCtx(parent.id)

          const result = await tool.execute(
            {
              description: "timed task",
              prompt: "stall forever",
              subagent_type: "stall",
            },
            ctx,
          )

          expect(result.metadata).toMatchObject({
            status: "timeout",
            reason: "subagent_timeout",
            guard: {
              timeout_ms: 10,
              child_cancelled: true,
            },
          })
          expect(result.output).toContain("timed out")
          expect(cancel).toHaveBeenCalledWith(result.metadata.sessionId)
        },
      })
    } finally {
      restore()
      prompt.mockRestore()
      cancel.mockRestore()
    }
  })

  test("propagates timeout abort to the child session", async () => {
    const restore = setGuardEnv({ timeout: "10", iterations: "8" })
    let cancelled = false
    const prompt = spyOn(SessionPrompt as any, "prompt").mockImplementation(
      () =>
        new Promise((resolve) => {
          const loop = () => {
            if (cancelled) {
              resolve({
                info: { role: "assistant" },
                parts: [{ type: "text", text: "aborted" }],
              } as never)
              return
            }
            setTimeout(loop, 1)
          }
          loop()
        }) as never,
    )
    const cancel = spyOn(SessionPrompt, "cancel").mockImplementation(() => {
      cancelled = true
      return undefined
    })

    try {
      await using tmp = await tmpdir(subagentConfig())
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const parent = await Session.create({})
          const tool = await TaskTool.init()
          const { ctx } = taskCtx(parent.id)

          const result = await tool.execute(
            {
              description: "cancel timed task",
              prompt: "stall until timeout",
              subagent_type: "stall",
            },
            ctx,
          )

          expect(result.metadata.status).toBe("timeout")
          expect(cancelled).toBe(true)
          expect(cancel).toHaveBeenCalledTimes(1)
        },
      })
    } finally {
      restore()
      prompt.mockRestore()
      cancel.mockRestore()
    }
  })

  test("returns structured max-iteration metadata when the child session keeps looping", async () => {
    const restore = setGuardEnv({ timeout: "1000", iterations: "2" })
    let cancelled = false
    const prompt = spyOn(SessionPrompt as any, "prompt").mockImplementation(
      (input: any) =>
        new Promise(async (resolve) => {
          const write = async () => {
            await Session.updateMessage({
              id: MessageID.ascending(),
              sessionID: input.sessionID,
              parentID: input.messageID,
              role: "assistant",
              mode: "stall",
              agent: "stall",
              cost: 0,
              path: {
                cwd: Instance.directory,
                root: Instance.worktree,
              },
              time: {
                created: Date.now(),
              },
              tokens: {
                input: 0,
                output: 0,
                reasoning: 0,
                cache: { read: 0, write: 0 },
              },
              modelID: input.model.modelID,
              providerID: input.model.providerID,
            })
          }

          await write()
          await write()

          const loop = () => {
            if (cancelled) {
              resolve({
                info: { role: "assistant" },
                parts: [{ type: "text", text: "stopped" }],
              } as never)
              return
            }
            setTimeout(loop, 1)
          }
          loop()
        }) as never,
    )
    const cancel = spyOn(SessionPrompt, "cancel").mockImplementation(() => {
      cancelled = true
      return undefined
    })

    try {
      await using tmp = await tmpdir(subagentConfig())
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const parent = await Session.create({})
          const tool = await TaskTool.init()
          const { ctx } = taskCtx(parent.id)

          const result = await tool.execute(
            {
              description: "looping task",
              prompt: "keep iterating",
              subagent_type: "stall",
            },
            ctx,
          )

          expect(result.metadata).toMatchObject({
            status: "max_iterations",
            reason: "subagent_max_iterations",
            guard: {
              max_iterations: 2,
              triggered: "max_iterations",
              child_cancelled: true,
            },
          })
          expect(cancelled).toBe(true)
        },
      })
    } finally {
      restore()
      prompt.mockRestore()
      cancel.mockRestore()
    }
  })

  test("fails the second parallel exclusive-edit task when both target the same file", async () => {
    const restore = setGuardEnv({ timeout: "1000", iterations: "8" })
    let release = () => {}
    let started = () => {}
    const wait = new Promise<void>((resolve) => {
      started = resolve
    })
    const prompt = spyOn(SessionPrompt as any, "prompt").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          started()
          release = () => {
            resolve({
              info: { role: "assistant" },
              parts: [{ type: "text", text: "done" }],
            } as never)
          }
        }) as never,
    )
    const cancel = spyOn(SessionPrompt, "cancel").mockImplementation(() => undefined)

    try {
      await using tmp = await tmpdir(subagentConfig())
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const parent = await Session.create({})
          const tool = await TaskTool.init()
          const first = taskCtx(parent.id)
          const second = taskCtx(parent.id)
          const files = ["src/task.ts"]

          const running = tool.execute(
            {
              description: "first writer",
              prompt: "hold lock",
              subagent_type: "stall",
              ownership: { mode: "exclusive_edit", files },
            },
            first.ctx,
          )

          await wait

          const blocked = await tool.execute(
            {
              description: "second writer",
              prompt: "try same file",
              subagent_type: "stall",
              ownership: { mode: "exclusive_edit", files },
            },
            second.ctx,
          )

          expect(blocked.metadata).toMatchObject({
            status: "conflict",
            reason: "ownership_conflict",
            guard: {
              conflicts: [{ file: "src/task.ts" }],
            },
          })
          expect(blocked.output).toContain("already owned")

          release()
          const finished = await running
          expect(finished.metadata.status).toBe("completed")
        },
      })
    } finally {
      restore()
      prompt.mockRestore()
      cancel.mockRestore()
    }
  })

  test("does not start a second subagent run for a conflicting file lease", async () => {
    const restore = setGuardEnv({ timeout: "1000", iterations: "8" })
    let release = () => {}
    let started = () => {}
    const wait = new Promise<void>((resolve) => {
      started = resolve
    })
    const prompt = spyOn(SessionPrompt as any, "prompt").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          started()
          release = () => {
            resolve({
              info: { role: "assistant" },
              parts: [{ type: "text", text: "done" }],
            } as never)
          }
        }) as never,
    )
    const cancel = spyOn(SessionPrompt, "cancel").mockImplementation(() => undefined)

    try {
      await using tmp = await tmpdir(subagentConfig())
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const parent = await Session.create({})
          const tool = await TaskTool.init()
          const files = ["src/task.ts"]

          const running = tool.execute(
            {
              description: "first writer",
              prompt: "hold lock",
              subagent_type: "stall",
              ownership: { mode: "exclusive_edit", files },
            },
            taskCtx(parent.id).ctx,
          )

          await wait

          const blocked = await tool.execute(
            {
              description: "second writer",
              prompt: "try same file",
              subagent_type: "stall",
              ownership: { mode: "exclusive_edit", files },
            },
            taskCtx(parent.id).ctx,
          )

          expect(blocked.metadata.status).toBe("conflict")
          expect(prompt).toHaveBeenCalledTimes(1)

          release()
          await running
        },
      })
    } finally {
      restore()
      prompt.mockRestore()
      cancel.mockRestore()
    }
  })
})
