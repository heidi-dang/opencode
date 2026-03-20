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

// Fix 6: file lock registry to prevent concurrent subagent edits on the same file
const locks = new Set<string>()

export function acquireLocks(files: string[]) {
  const conflicts = files.filter((f) => locks.has(f))
  if (conflicts.length) return conflicts
  for (const f of files) locks.add(f)
  return []
}

export function releaseLocks(files: string[]) {
  for (const f of files) locks.delete(f)
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
      const owned =
        params.ownership?.mode === "exclusive_edit"
          ? params.ownership.files.map((file) => file.replaceAll("\\", "/"))
          : []
      if (owned.length) {
        const conflicts = acquireLocks(owned)
        if (conflicts.length)
          throw new Error(`File lock conflict: ${conflicts.join(", ")} already being edited by another subagent`)
      }
      let locked = owned.length > 0

      try {
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
          } catch {}
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
          },
        })

        const messageID = MessageID.ascending()

        function cancel() {
          SessionPrompt.cancel(session.id)
        }
        ctx.abort?.addEventListener("abort", cancel)
        using _ = defer(() => ctx.abort?.removeEventListener("abort", cancel))
        const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

        const autonomy = [
          "CRITICAL: You are operating as an autonomous subagent inside the Heidi orchestrator.",
          "You MUST NOT ask the user clarifying questions or wait for interactive confirmation.",
          "You MUST NOT use phrases like 'say generate to begin' or 'let me know when ready'.",
          "Analyze the provided context and execute your task immediately and completely.",
          "If information is missing, make the most reasonable assumption and proceed.",
        ].join("\n")
        promptParts.unshift({ type: "text", text: autonomy })

        const history = ctx.messages ?? []
        const relevant = history.filter((m) => m.info.role === "user" || m.info.role === "assistant")
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

        const started = Date.now()
        const result = await SessionPrompt.prompt({
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
        })

        const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""
        const finished = Date.now()

        const output = [
          `task_id: ${session.id} (for resuming to continue this task if needed)`,
          "",
          "<task_result>",
          text,
          "</task_result>",
        ].join("\n")

        return {
          title: params.description,
          metadata: {
            sessionId: session.id,
            model,
            lane: params.lane,
            ownership: params.ownership,
            timing: {
              start: started,
              end: finished,
              duration_ms: finished - started,
            },
          },
          output,
        }
      } finally {
        if (locked) releaseLocks(owned)
        locked = false
      }
    },
  }
})
