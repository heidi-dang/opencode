import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { Provider } from "../provider/provider"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"
import { PermissionNext } from "@/permission"
import { HeidiTelemetry } from "@/heidi/telemetry"
import { HeidiHealth } from "../heidi/health"
import { setTimeout as sleep } from "node:timers/promises"

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_MAX_ITERATIONS = 8
const POLL_MS = 25
const locks = new Map<string, { sessionID: string }>()

function guardValue(key: string, fallback: number) {
  const value = Number.parseInt(process.env[key] ?? "", 10)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

function timeoutMs() {
  return guardValue("OPENCODE_TASK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)
}

function maxIterations() {
  return guardValue("OPENCODE_TASK_MAX_ITERATIONS", DEFAULT_MAX_ITERATIONS)
}

function unique(files: string[]) {
  return Array.from(new Set(files))
}

export function acquireLocks(sessionID: string, files: string[]) {
  const conflicts = unique(files)
    .map((file) => {
      const owner = locks.get(file)
      if (!owner || owner.sessionID === sessionID) return
      return { file, sessionId: owner.sessionID }
    })
    .filter((item): item is { file: string; sessionId: string } => Boolean(item))

  if (conflicts.length) return conflicts

  for (const file of unique(files)) {
    locks.set(file, { sessionID })
  }
  return []
}

export function releaseLocks(sessionID: string, files: string[]) {
  for (const file of unique(files)) {
    if (locks.get(file)?.sessionID !== sessionID) continue
    locks.delete(file)
  }
}

async function assistantCount(sessionID: string) {
  let count = 0
  for await (const item of MessageV2.stream(SessionID.make(sessionID))) {
    if (item.info.role === "assistant") count++
  }
  return count
}

async function watchIterations(input: { sessionID: string; limit: number; signal: AbortSignal }) {
  while (!input.signal.aborted) {
    const count = await assistantCount(input.sessionID)
    if (count >= input.limit) return count
    await sleep(POLL_MS, undefined, { signal: input.signal }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return
      throw error
    })
  }
}

function output(sessionID: string, text: string) {
  return [
    `task_id: ${sessionID} (for resuming to continue this task if needed)`,
    "",
    "<task_result>",
    text,
    "</task_result>",
  ].join("\n")
}

function result(input: {
  sessionID: string
  title: string
  model: { modelID: string; providerID: string }
  lane?: "research" | "implementation" | "review"
  ownership?: z.infer<typeof parameters>['ownership']
  started: number
  text: string
  status: "completed" | "timeout" | "conflict" | "max_iterations"
  reason?: string
  guard: Record<string, unknown>
}) {
  const finished = Date.now()
  return {
    title: input.title,
    metadata: {
      sessionId: input.sessionID,
      model: input.model,
      lane: input.lane,
      ownership: input.ownership,
      status: input.status,
      ...(input.reason ? { reason: input.reason } : {}),
      guard: input.guard,
      timing: {
        start: input.started,
        end: finished,
        duration_ms: finished - input.started,
      },
    },
    output: output(input.sessionID, input.text),
  }
}

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task"),
  lane: z.enum(["research", "implementation", "review"]).optional(),
  ownership: z
    .object({
      mode: z.enum(["shared", "read_only", "exclusive_edit"]),
      files: z.array(z.string()),
    })
    .optional(),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
    )
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
})

export const TaskTool = Tool.define("task", async (ctx) => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary" || a.name === "idea_generator"))

  // Filter agents by permissions if agent provided
  const caller = ctx?.agent
  const accessibleAgents = caller
    ? agents.filter((a) => PermissionNext.evaluate("task", a.name, caller.permission).action !== "deny")
    : agents
  const list = accessibleAgents.toSorted((a, b) => a.name.localeCompare(b.name))

  const description = DESCRIPTION.replace(
    "{agents}",
    list
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const config = await Config.get()
      const guard = {
        timeout_ms: timeoutMs(),
        max_iterations: maxIterations(),
      }

      // Skip permission check when user explicitly invoked via @ or command subtask
      if (!ctx.extra?.bypassAgentCheck) {
        await ctx.ask({
          permission: "task",
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const agent = await Agent.resolve(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)

      const hasTaskPermission = agent.permission.some((rule) => rule.permission === "task")

      const session = await iife(async () => {
        if (params.task_id) {
          const found = await Session.get(SessionID.make(params.task_id)).catch((err) => {
            HeidiTelemetry.warn(ctx.sessionID, "task.session_get", err)
            return null
          })
          if (found) return found
        }

        return await Session.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${agent.name} subagent)`,
          permission: [
            {
              permission: "doom_loop",
              pattern: "*",
              action: "deny",
            },
            {
              permission: "todowrite",
              pattern: "*",
              action: "deny",
            },
            {
              permission: "todoread",
              pattern: "*",
              action: "deny",
            },
            ...(hasTaskPermission
              ? []
              : [
                  {
                    permission: "task" as const,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(config.experimental?.primary_tools?.map((t) => ({
              pattern: "*",
              action: "allow" as const,
              permission: t,
            })) ?? []),
          ],
        })
      })
      const model = await iife(async () => {
        if (agent.model) return agent.model
        try {
          const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
          if (msg.info.role === "assistant") {
            return {
              modelID: msg.info.modelID,
              providerID: msg.info.providerID,
            }
          }
        } catch (e) {}
        const def = await Provider.defaultModel()
        return { modelID: def.modelID, providerID: def.providerID }
      })

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
          model,
          lane: params.lane,
          ownership: params.ownership,
          guard,
        },
      })

      const started = Date.now()
      const owned = params.ownership?.mode === "exclusive_edit" ? unique(params.ownership.files) : []
      if (owned.length) {
        const conflicts = acquireLocks(session.id, owned)
        if (conflicts.length) {
          HeidiHealth.conflict()
          return result({
            sessionID: session.id,
            title: params.description,
            model,
            lane: params.lane,
            ownership: params.ownership,
            started,
            status: "conflict",
            reason: "ownership_conflict",
            guard: {
              ...guard,
              triggered: "ownership_conflict",
              conflicts,
              child_cancelled: false,
            },
            text: `Subagent did not start because these files are already owned by another active task: ${conflicts.map((item) => item.file).join(", ")}.`,
          })
        }
      }
      using _locks = defer(() => {
        if (owned.length) releaseLocks(session.id, owned)
      })

      const messageID = MessageID.ascending()

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort?.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort?.removeEventListener("abort", cancel))
      const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

      // Weakness 1 fix: inject autonomy preamble so subagents never stall on interactive prompts
      const autonomy = [
        "CRITICAL: You are operating as an autonomous subagent inside the Heidi orchestrator.",
        "You MUST NOT ask the user clarifying questions or wait for interactive confirmation.",
        "You MUST NOT use phrases like 'say generate to begin' or 'let me know when ready'.",
        "Analyze the provided context and execute your task immediately and completely.",
        "If information is missing, make the most reasonable assumption and proceed.",
      ].join("\n")
      promptParts.unshift({ type: "text", text: autonomy })

      // Weakness 4 fix: enrich subagent prompt with structured context from Heidi's session
      const history = ctx.messages ?? []
      const relevant = history.filter((m) => m.info.role === "user" || m.info.role === "assistant")
      // Fix 5: adaptive depth — 3 for short conversations, up to 6 for longer ones
      const depth = Math.min(6, Math.max(3, Math.ceil(relevant.length * 0.15)))
      const recent = relevant
        .slice(-depth)
        .flatMap((m) => m.parts.filter((p) => p.type === "text").map((p) => (p as any).text))
        .filter(Boolean)
        .join("\n---\n")
      if (recent) {
        const envelope = [
          "<context_from_heidi>",
          `Agent: ${params.subagent_type}`,
          `Task: ${params.description}`,
          `Lane: ${params.lane ?? "default"}`,
          `Recent conversation context:\n${recent}`,
          "</context_from_heidi>",
        ].join("\n")
        promptParts.unshift({ type: "text", text: envelope })
      }

      const watch = new AbortController()
      const prompt = SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          ...(hasTaskPermission ? {} : { task: false }),
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
        },
        parts: promptParts,
      }).then(
        (result) => ({ type: "result" as const, result }),
        (error) => ({ type: "error" as const, error }),
      )

      const timeout = new Promise<{ type: "timeout" }>((resolve) => {
        const id = setTimeout(() => resolve({ type: "timeout" }), guard.timeout_ms)
        watch.signal.addEventListener("abort", () => clearTimeout(id), { once: true })
      })

      const iterations = watchIterations({
        sessionID: session.id,
        limit: guard.max_iterations,
        signal: watch.signal,
      }).then((count) => ({ type: "max_iterations" as const, count }))

      HeidiHealth.subagentStart()
      try {
        const outcome = await Promise.race([prompt, timeout, iterations])
        watch.abort()

        if (outcome.type === "timeout") {
          HeidiHealth.timeout()
          SessionPrompt.cancel(session.id)
          return result({
            sessionID: session.id,
            title: params.description,
            model,
            lane: params.lane,
            ownership: params.ownership,
            started,
            status: "timeout",
            reason: "subagent_timeout",
            guard: {
              ...guard,
              triggered: "timeout",
              child_cancelled: true,
            },
            text: `Subagent timed out after ${guard.timeout_ms}ms and the child session was cancelled.`,
          })
        }

        if (outcome.type === "max_iterations") {
          SessionPrompt.cancel(session.id)
          return result({
            sessionID: session.id,
            title: params.description,
            model,
            lane: params.lane,
            ownership: params.ownership,
            started,
            status: "max_iterations",
            reason: "subagent_max_iterations",
            guard: {
              ...guard,
              triggered: "max_iterations",
              iterations: outcome.count,
              child_cancelled: true,
            },
            text: `Subagent was stopped after hitting the max iteration guard (${guard.max_iterations} assistant iterations).`,
          })
        }

        if (outcome.type === "error") throw outcome.error

        const text = outcome.result.parts.findLast((x) => x.type === "text")?.text ?? ""
        return result({
          sessionID: session.id,
          title: params.description,
          model,
          lane: params.lane,
          ownership: params.ownership,
          started,
          status: "completed",
          guard: {
            ...guard,
            triggered: null,
            child_cancelled: false,
          },
          text,
        })
      } finally {
        watch.abort()
        HeidiHealth.subagentStop()
      }
    },
  }
})
