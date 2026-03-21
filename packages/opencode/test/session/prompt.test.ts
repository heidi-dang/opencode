import path from "path"
import { describe, expect, test } from "bun:test"
import { fileURLToPath } from "url"
import { Instance } from "../../src/project/instance"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionPrompt } from "../../src/session/prompt"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("session.prompt missing file", () => {
  test("does not fail the prompt when a file part is missing", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        agent: {
          build: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})

        const missing = path.join(tmp.path, "does-not-exist.ts")
        const msg = await SessionPrompt.prompt({
          sessionID: session.id,
          agent: "build",
          noReply: true,
          parts: [
            { type: "text", text: "please review @does-not-exist.ts" },
            {
              type: "file",
              mime: "text/plain",
              url: `file://${missing}`,
              filename: "does-not-exist.ts",
            },
          ],
        })

        if (msg.info.role !== "user") throw new Error("expected user message")

        const hasFailure = msg.parts.some(
          (part) => part.type === "text" && part.synthetic && part.text.includes("Read tool failed to read"),
        )
        expect(hasFailure).toBe(true)

        await Session.remove(session.id)
      },
    })
  })

  test("keeps stored part order stable when file resolution is async", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        agent: {
          build: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})

        const missing = path.join(tmp.path, "still-missing.ts")
        const msg = await SessionPrompt.prompt({
          sessionID: session.id,
          agent: "build",
          noReply: true,
          parts: [
            {
              type: "file",
              mime: "text/plain",
              url: `file://${missing}`,
              filename: "still-missing.ts",
            },
            { type: "text", text: "after-file" },
          ],
        })

        if (msg.info.role !== "user") throw new Error("expected user message")

        const stored = await MessageV2.get({
          sessionID: session.id,
          messageID: msg.info.id,
        })
        const text = stored.parts.filter((part) => part.type === "text").map((part) => part.text)

        expect(text[0]?.startsWith("Called the Read tool with the following input:")).toBe(true)
        expect(text[1]?.includes("Read tool failed to read")).toBe(true)
        expect(text[2]).toBe("after-file")

        await Session.remove(session.id)
      },
    })
  })
})

describe("session.prompt special characters", () => {
  test("handles filenames with # character", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file#name.txt"), "special content\n")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const template = "Read @file#name.txt"
        const parts = await SessionPrompt.resolvePromptParts(template)
        const fileParts = parts.filter((part) => part.type === "file")

        expect(fileParts.length).toBe(1)
        expect(fileParts[0].filename).toBe("file#name.txt")
        expect(fileParts[0].url).toContain("%23")

        const decodedPath = fileURLToPath(fileParts[0].url)
        expect(decodedPath).toBe(path.join(tmp.path, "file#name.txt"))

        const message = await SessionPrompt.prompt({
          sessionID: session.id,
          parts,
          noReply: true,
        })
        const stored = await MessageV2.get({ sessionID: session.id, messageID: message.info.id })
        const textParts = stored.parts.filter((part) => part.type === "text")
        const hasContent = textParts.some((part) => part.text.includes("special content"))
        expect(hasContent).toBe(true)

        await Session.remove(session.id)
      },
    })
  })
})

describe("session.prompt agent variant", () => {
  test("applies agent variant only when using agent model", async () => {
    const prev = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = "test-openai-key"

    try {
      await using tmp = await tmpdir({
        git: true,
        config: {
          agent: {
            build: {
              model: "openai/gpt-5.2",
              variant: "xhigh",
            },
          },
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})

          const other = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            model: { providerID: ProviderID.make("opencode"), modelID: ModelID.make("kimi-k2.5-free") },
            noReply: true,
            parts: [{ type: "text", text: "hello" }],
          })
          if (other.info.role !== "user") throw new Error("expected user message")
          expect(other.info.variant).toBeUndefined()

          const match = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            noReply: true,
            parts: [{ type: "text", text: "hello again" }],
          })
          if (match.info.role !== "user") throw new Error("expected user message")
          expect(match.info.model).toEqual({ providerID: ProviderID.make("openai"), modelID: ModelID.make("gpt-5.2") })
          expect(match.info.variant).toBe("xhigh")

          const override = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            noReply: true,
            variant: "high",
            parts: [{ type: "text", text: "hello third" }],
          })
          if (override.info.role !== "user") throw new Error("expected user message")
          expect(override.info.variant).toBe("high")

          await Session.remove(session.id)
        },
      })
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = prev
    }
  })
})

describe("session.prompt parallel assist", () => {
  test("detects complex heidi work for parallel assist", () => {
    const enabled = SessionPrompt.shouldUseParallelAssist({
      agent: "heidi",
      parts: [
        { type: "text", text: "Investigate a provider bug across multiple files and research the dependency API" },
      ],
    })
    const disabled = SessionPrompt.shouldUseParallelAssist({
      agent: "build",
      parts: [
        { type: "text", text: "Investigate a provider bug across multiple files and research the dependency API" },
      ],
    })

    expect(enabled).toBe(true)
    expect(disabled).toBe(false)
  })

  test("builds a structured Beast research prompt", () => {
    const prompt = SessionPrompt.buildParallelResearchPrompt({
      text: "Debug the provider auth flow and summarize likely fixes.",
      task: {
        lane: "research",
        description: SessionPrompt.PARALLEL_RESEARCH_DESCRIPTION,
        ownership: {
          mode: "read_only",
          files: [],
          reserved: [],
        },
      },
    })

    expect(prompt).toContain("Heidi's parallel research lane")
    expect(prompt).toContain("## Summary")
    expect(prompt).toContain("## Files Read")
    expect(prompt).toContain("## Findings")
    expect(prompt).toContain("## Recommended Changes")
    expect(prompt).toContain("## Risks")
    expect(prompt).toContain("## Open Questions")
  })

  test("assigns exclusive files for small explicit edit tasks", () => {
    const task = SessionPrompt.inferParallelTask({
      text: "Fix and update @src/auth.ts and @src/token.ts to handle refresh correctly.",
      parts: [
        { type: "text" },
        { type: "file", filename: "src/auth.ts", mime: "text/plain" },
        { type: "file", filename: "src/token.ts", mime: "text/plain" },
      ],
    })

    expect(task.lane).toBe("implementation")
    expect(task.description).toBe(SessionPrompt.PARALLEL_IMPLEMENTATION_DESCRIPTION)
    expect(task.ownership).toEqual({
      mode: "exclusive_edit",
      files: ["src/auth.ts"],
      reserved: ["src/token.ts"],
    })
  })

  test("keeps read-only lane when no explicit editable files exist", () => {
    const task = SessionPrompt.inferParallelTask({
      text: "Investigate provider bug across multiple files and summarize recommended changes.",
      parts: [{ type: "text" }],
    })

    expect(task.lane).toBe("research")
    expect(task.ownership).toEqual({
      mode: "read_only",
      files: [],
      reserved: [],
    })
  })

  test("parses Beast report sections", () => {
    const report = SessionPrompt.parseBeastReport(`## Summary
- root cause isolated

## Files Read
- src/a.ts

## Findings
- auth path uses stale state

## Recommended Changes
- file: src/a.ts | action: edit | reason: refresh token before retry

## Risks
- retry loops

## Open Questions
- none`)

    expect(report?.summary).toEqual(["root cause isolated"])
    expect(report?.files).toEqual(["src/a.ts"])
    expect(report?.findings).toEqual(["auth path uses stale state"])
    expect(report?.changes).toEqual([{ file: "src/a.ts", action: "edit", reason: "refresh token before retry" }])
    expect(report?.risks).toEqual(["retry loops"])
    expect(report?.questions).toEqual(["none"])
  })

  test("builds a Heidi synthesis reminder from Beast report", () => {
    const text = SessionPrompt.buildSynthesisReminder({
      text: "ignored",
      report: {
        summary: ["root cause isolated"],
        files: ["src/a.ts"],
        findings: ["auth path uses stale state"],
        changes: [{ file: "src/a.ts", action: "edit", reason: "refresh token before retry" }],
        risks: ["retry loops"],
        questions: ["none"],
      },
    })

    expect(text).toContain("A Beast research lane completed")
    expect(text).toContain("## Beast Summary")
    expect(text).toContain("file: src/a.ts | action: edit | reason: refresh token before retry")
    expect(text).toContain("## Ownership Split")
  })

  test("buildPlanReminder makes planning decide by default", () => {
    const text = SessionPrompt.buildPlanReminder({
      plan: "/tmp/plan.md",
      exists: true,
    })

    expect(text).toContain("Make the best reasonable assumptions and proceed")
    expect(text).toContain("Record those assumptions clearly in the plan")
    expect(text).not.toContain("asking them questions")
    expect(text).not.toContain("clarify ambiguities in the user request up front")
  })

  test("buildPlanReminder limits question usage and preserves plan_exit", () => {
    const text = SessionPrompt.buildPlanReminder({
      plan: "/tmp/plan.md",
      exists: false,
    })

    expect(text).toContain("missing required user-specific information")
    expect(text).toContain("safety, destructive, or irreversible operations")
    expect(text).toContain("true ambiguity with materially different outcomes")
    expect(text).toContain("plan_exit")
    expect(text).toContain("normal way to finish planning")
    expect(text).not.toContain("either asking the user a question or calling plan_exit")
  })

  test("adds a beast research subtask for complex heidi prompts", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        agent: {
          heidi: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const msg = await SessionPrompt.prompt({
          sessionID: session.id,
          agent: "heidi",
          noReply: true,
          parts: [
            {
              type: "text",
              text: "Investigate a provider bug across multiple files, research docs, and summarize recommended changes.",
            },
          ],
        })

        if (msg.info.role !== "user") throw new Error("expected user message")
        const part = msg.parts.find((item) => item.type === "subtask")
        expect(part?.type).toBe("subtask")
        if (!part || part.type !== "subtask") throw new Error("expected subtask part")
        expect(part.agent).toBe("beast_mode")
        expect(part.description).toBe(SessionPrompt.PARALLEL_RESEARCH_DESCRIPTION)
        expect(part.prompt).toContain("## Recommended Changes")
        await Session.remove(session.id)
      },
    })
  })

  test("builds an implementation-lane beast prompt for exclusive-file assignments", () => {
    const task = SessionPrompt.inferParallelTask({
      text: "Fix and update @src/auth.ts and @src/token.ts for a provider bug across multiple files and research dependency behavior.",
      parts: [
        { type: "text" },
        { type: "file", filename: "src/auth.ts", mime: "text/plain" },
        { type: "file", filename: "src/token.ts", mime: "text/plain" },
      ],
    })

    const prompt = SessionPrompt.buildParallelResearchPrompt({
      text: "Fix the targeted auth files.",
      task,
    })

    expect(task.lane).toBe("implementation")
    expect(task.description).toBe(SessionPrompt.PARALLEL_IMPLEMENTATION_DESCRIPTION)
    expect(task.ownership).toEqual({
      mode: "exclusive_edit",
      files: ["src/auth.ts"],
      reserved: ["src/token.ts"],
    })
    expect(prompt).toContain("you may edit only these exclusive files")
    expect(prompt).toContain("src/auth.ts")
    expect(prompt).toContain("Heidi keeps ownership of these reserved files: src/token.ts")
  })
})

describe("session context prompt injection", () => {
  test("includes session context in environment prompt", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { HeidiState } = await import("../../src/heidi/state")
        const { HeidiContext } = await import("../../src/heidi/context")
        const { SystemPrompt } = await import("../../src/session/system")
        const { enterExecution } = await import("../fixture/heidi")
        const session = await Session.create({})
        await enterExecution(session.id, "Prompt objective")
        const state = await HeidiState.read(session.id)
        state.resume.next_step = "continue"
        await HeidiState.write(session.id, state)
        await HeidiContext.write(session.id)
        const env = await SystemPrompt.environment({ api: { id: "gpt-5.4" }, providerID: "openai" } as any, session.id)
        const out = env.join("\\n")
        expect(out).toContain("<session_context>")
        expect(out).toContain("Prompt objective")
        expect(out).toContain('next_step: "continue"')
      },
    })
  })
})
