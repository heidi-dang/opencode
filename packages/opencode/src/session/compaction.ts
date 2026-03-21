import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Session } from "."
import { SessionID, MessageID, PartID } from "./schema"
import { Instance } from "../project/instance"
import { Provider } from "../provider/provider"
import { MessageV2 } from "./message-v2"
import z from "zod"
import { Token } from "../util/token"
import { Log } from "../util/log"
import { SessionProcessor } from "./processor"
import { fn } from "@/util/fn"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Config } from "@/config/config"
import { ProviderTransform } from "@/provider/transform"
import { ModelID, ProviderID } from "@/provider/schema"
import path from "path"
import { SessionCompression } from "./compression"

export namespace SessionCompaction {
  const log = Log.create({ service: "session.compaction" })

  export const Event = {
    Compacted: BusEvent.define(
      "session.compacted",
      z.object({
        sessionID: SessionID.zod,
      }),
    ),
  }

  const COMPACTION_BUFFER = 20_000
  const DEFAULT_PROTECTED_TOOLS = ["skill", "task", "todowrite", "todoread", "batch", "plan_enter", "plan_exit"]
  const WRITE_TOOLS = new Set(["write", "edit", "multiedit", "apply_patch", "replace_file_content"])
  const READ_TOOLS = new Set(["read"])
  const INPUT_PLACEHOLDER = "[Old tool input content cleared]"
  const ERROR_INPUT_PLACEHOLDER = "[Failed tool input removed after several turns]"

  function tools(cfg: Awaited<ReturnType<typeof Config.get>>, extra: string[] = []) {
    return new Set([...DEFAULT_PROTECTED_TOOLS, ...(cfg.compaction?.protectedTools ?? []), ...extra])
  }

  function stable(input: unknown): string {
    if (input === null || typeof input !== "object") return JSON.stringify(input)
    if (Array.isArray(input)) return `[${input.map(stable).join(",")}]`

    return `{${Object.keys(input)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((input as Record<string, unknown>)[key])}`)
      .join(",")}}`
  }

  function compactInput(input: unknown, text: string, key?: string): unknown {
    if (typeof input === "string") {
      if (key === "filePath") return input
      return text
    }

    if (Array.isArray(input)) {
      if (key === "filePaths") return input
      return input.map((item) => compactInput(item, text))
    }

    if (!input || typeof input !== "object") return input

    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([name, value]) => {
        if (name === "filePath" && typeof value === "string") return [name, value]
        if (name === "filePaths" && Array.isArray(value)) return [name, value]
        return [name, compactInput(value, text, name)]
      }),
    )
  }

  function collectPaths(input: unknown) {
    const result = new Set<string>()

    const visit = (value: unknown, key?: string) => {
      if (!value) return

      if (typeof value === "string") {
        if (key === "filePath") {
          const item = path.isAbsolute(value) ? path.relative(Instance.worktree, value) : value
          result.add(item.replaceAll("\\", "/"))
        }
        return
      }

      if (Array.isArray(value)) {
        if (key === "filePaths") {
          value.forEach((item) => {
            if (typeof item !== "string") return
            const next = path.isAbsolute(item) ? path.relative(Instance.worktree, item) : item
            result.add(next.replaceAll("\\", "/"))
          })
          return
        }
        value.forEach((item) => visit(item))
        return
      }

      if (typeof value !== "object") return
      Object.entries(value as Record<string, unknown>).forEach(([name, item]) => visit(item, name))
    }

    visit(input)
    return result
  }

  function compactToolInput(part: MessageV2.ToolPart, text: string) {
    if (part.state.status !== "completed" && part.state.status !== "error") return 0
    if (part.state.time.inputCompacted) return 0

    const size = Token.estimate(JSON.stringify(part.state.input))
    part.state.input = compactInput(part.state.input, text) as Record<string, any>
    part.state.time.inputCompacted = Date.now()
    return size
  }

  function compactToolOutput(part: MessageV2.ToolPart) {
    if (part.state.status !== "completed") return 0
    if (part.state.time.compacted) return 0

    const size = Token.estimate(part.state.output)
    part.state.time.compacted = Date.now()
    return size
  }

  export async function isOverflow(input: { tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
    const config = await Config.get()
    if (config.compaction?.auto === false) return false
    const context = input.model.limit.context
    if (context === 0) return false

    const count =
      input.tokens.total ||
      input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write

    const reserved =
      config.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model))
    const usable = input.model.limit.input
      ? input.model.limit.input - reserved
      : context - ProviderTransform.maxOutputTokens(input.model)
    return count >= usable
  }

  export const PRUNE_MINIMUM = 20_000
  export const PRUNE_PROTECT = 40_000

  // goes backwards through parts until there are 40_000 tokens worth of tool
  // calls. then erases output of previous tool calls. idea is to throw away old
  // tool calls that are no longer relevant.
  export async function prune(input: { sessionID: SessionID }) {
    const config = await Config.get()
    if (config.compaction?.prune === false) return
    log.info("pruning")
    const msgs = await Session.messages({ sessionID: input.sessionID })
    const pruneTools = tools(config)
    const dedupeTools = tools(config, config.compaction?.deduplicate?.protectedTools ?? [])
    const errorTools = tools(config, config.compaction?.purgeErrors?.protectedTools ?? [])
    const errorTurns = Math.max(1, config.compaction?.purgeErrors?.turns ?? 4)
    let total = 0
    let stale = 0
    let out = 0
    let inputSize = 0
    let turns = 0
    let deduped = 0
    let purged = 0
    let writes = 0
    const toPrune: MessageV2.ToolPart[] = []
    const updates = new Map<string, MessageV2.ToolPart>()
    const seen = new Set<string>()
    const reads = new Set<string>()

    loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
      const msg = msgs[msgIndex]
      if (msg.info.role === "user") turns++
      if (msg.info.role === "assistant" && msg.info.summary) break loop
      for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
        const part = msg.parts[partIndex]
        if (part.type !== "tool") continue

        const sig = `${part.tool}:${stable(part.state.input)}`
        if (part.state.status === "completed") {
          if (READ_TOOLS.has(part.tool)) collectPaths(part.state.input).forEach((item) => reads.add(item))

          if (config.compaction?.deduplicate?.enabled !== false && !dedupeTools.has(part.tool)) {
            if (seen.has(sig)) {
              out += compactToolOutput(part)
              inputSize += compactToolInput(part, INPUT_PLACEHOLDER)
              updates.set(part.id, part)
              deduped++
              continue
            }
            seen.add(sig)
          }

          if (
            config.compaction?.supersedeWrites?.enabled !== false &&
            WRITE_TOOLS.has(part.tool) &&
            [...collectPaths(part.state.input)].some((item) => reads.has(item))
          ) {
            inputSize += compactToolInput(part, INPUT_PLACEHOLDER)
            updates.set(part.id, part)
            writes++
          }

          if (pruneTools.has(part.tool)) continue
          if (part.state.time.compacted) break loop

          const estimate = Token.estimate(part.state.output)
          total += estimate
          if (turns < 2 || total <= PRUNE_PROTECT) continue

          stale += estimate
          toPrune.push(part)
          continue
        }

        if (part.state.status !== "error") continue

        if (config.compaction?.deduplicate?.enabled !== false && !dedupeTools.has(part.tool)) {
          if (seen.has(sig)) {
            inputSize += compactToolInput(part, ERROR_INPUT_PLACEHOLDER)
            updates.set(part.id, part)
            deduped++
            continue
          }
          seen.add(sig)
        }

        if (config.compaction?.purgeErrors?.enabled === false) continue
        if (turns < errorTurns) continue
        if (errorTools.has(part.tool)) continue

        inputSize += compactToolInput(part, ERROR_INPUT_PLACEHOLDER)
        updates.set(part.id, part)
        purged++
      }
    }

    if (stale > PRUNE_MINIMUM) {
      for (const part of toPrune) {
        out += compactToolOutput(part)
        updates.set(part.id, part)
      }
    }

    log.info("found", { stale, total, out, input: inputSize, deduped, purged, writes })
    if (updates.size === 0) return

    for (const part of updates.values()) await Session.updatePart(part)
    log.info("pruned", { count: updates.size, out, input: inputSize, deduped, purged, writes })
  }

  export async function process(input: {
    parentID: MessageID
    messages: MessageV2.WithParts[]
    sessionID: SessionID
    abort: AbortSignal
    auto: boolean
    overflow?: boolean
  }) {
    const config = await Config.get()
    const userMessage = input.messages.findLast((m) => m.info.id === input.parentID)!.info as MessageV2.User

    let messages = input.messages
    let replay: MessageV2.WithParts | undefined
    if (input.overflow) {
      const idx = input.messages.findIndex((m) => m.info.id === input.parentID)
      for (let i = idx - 1; i >= 0; i--) {
        const msg = input.messages[i]
        if (msg.info.role === "user" && !msg.parts.some((p) => p.type === "compaction")) {
          replay = msg
          messages = input.messages.slice(0, i)
          break
        }
      }
      const hasContent =
        replay && messages.some((m) => m.info.role === "user" && !m.parts.some((p) => p.type === "compaction"))
      if (!hasContent) {
        replay = undefined
        messages = input.messages
      }
    }

    const agent = await Agent.get("compaction")
    const model = agent.model
      ? await Provider.getModel(agent.model.providerID, agent.model.modelID)
      : await Provider.getModel(userMessage.model.providerID, userMessage.model.modelID)
    const msg = (await Session.updateMessage({
      id: MessageID.ascending(),
      role: "assistant",
      parentID: input.parentID,
      sessionID: input.sessionID,
      mode: "compaction",
      agent: "compaction",
      variant: userMessage.variant,
      summary: true,
      path: {
        cwd: Instance.directory,
        root: Instance.worktree,
      },
      cost: 0,
      tokens: {
        output: 0,
        input: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: model.id,
      providerID: model.providerID,
      time: {
        created: Date.now(),
      },
    })) as MessageV2.Assistant
    const processor = SessionProcessor.create({
      assistantMessage: msg,
      sessionID: input.sessionID,
      model,
      abort: input.abort,
    })
    // Allow plugins to inject context or replace compaction prompt
    const compacting = await Plugin.trigger(
      "experimental.session.compacting",
      { sessionID: input.sessionID },
      { context: [], prompt: undefined },
    )
    const protectedUsers = config.compaction?.protectUserMessages
      ? `

Include a section named "Protected user messages" that quotes the user's most important instructions, constraints, and open questions verbatim.`
      : ""
    const defaultPrompt = `Provide a detailed prompt for continuing our conversation above.
Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.
The summary that you construct will be used so that another agent can read it and continue the work.
${protectedUsers}

When constructing the summary, try to stick to this template:
---
## Goal

[What goal(s) is the user trying to accomplish?]

## Instructions

- [What important instructions did the user give you that are relevant]
- [If there is a plan or spec, include information about it so next agent can continue using it]

## Discoveries

[What notable things were learned during this conversation that would be useful for the next agent to know when continuing the work]

## Accomplished

[What work has been completed, what work is still in progress, and what work is left?]

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]
---`

    const promptText = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")
    const msgs = structuredClone(messages)
    await SessionCompression.apply({ sessionID: input.sessionID, messages: msgs })
    await Plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })
    const result = await processor.process({
      user: userMessage,
      agent,
      abort: input.abort,
      sessionID: input.sessionID,
      tools: {},
      system: [],
      messages: [
        ...MessageV2.toModelMessages(msgs, model, { stripMedia: true }),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptText,
            },
          ],
        },
      ],
      model,
    })

    if (result === "compact") {
      // Fix 4: aggressive prune-retry before giving up
      await prune({ sessionID: input.sessionID })
      const pruned = await MessageV2.filterCompacted(MessageV2.stream(input.sessionID))
      if (pruned.length > 1) {
        const retryProcessor = SessionProcessor.create({
          assistantMessage: msg,
          sessionID: input.sessionID,
          model,
          abort: input.abort,
        })
        const msgs2 = structuredClone(pruned)
        await SessionCompression.apply({ sessionID: input.sessionID, messages: msgs2 })
        await Plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs2 })
        const retry = await retryProcessor.process({
          user: userMessage,
          agent,
          abort: input.abort,
          sessionID: input.sessionID,
          tools: {},
          system: [],
          messages: [
            ...MessageV2.toModelMessages(msgs2, model, { stripMedia: true }),
            { role: "user", content: [{ type: "text", text: promptText }] },
          ],
          model,
        })
        if (retry !== "compact") {
          if (retry === "continue" && input.auto) {
            const continueMsg = await Session.updateMessage({
              id: MessageID.ascending(),
              role: "user",
              sessionID: input.sessionID,
              time: { created: Date.now() },
              agent: userMessage.agent,
              model: userMessage.model,
            })
            await Session.updatePart({
              id: PartID.ascending(),
              messageID: continueMsg.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text: "Conversation was aggressively pruned and compacted. Continue if you have next steps, or stop and ask for clarification if unsure.",
              time: { start: Date.now(), end: Date.now() },
            })
          }
          Bus.publish(Event.Compacted, { sessionID: input.sessionID })
          return "continue"
        }
      }
      processor.message.error = new MessageV2.ContextOverflowError({
        message: replay
          ? "Conversation history too large to compact - exceeds model context limit"
          : "Session too large to compact - context exceeds model limit even after stripping media",
      }).toObject()
      processor.message.finish = "error"
      await Session.updateMessage(processor.message)
      return "stop"
    }

    if (result === "continue" && input.auto) {
      if (replay) {
        const original = replay.info as MessageV2.User
        const replayMsg = await Session.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          sessionID: input.sessionID,
          time: { created: Date.now() },
          agent: original.agent,
          model: original.model,
          format: original.format,
          tools: original.tools,
          system: original.system,
          variant: original.variant,
        })
        for (const part of replay.parts) {
          if (part.type === "compaction") continue
          const replayPart =
            part.type === "file" && MessageV2.isMedia(part.mime)
              ? { type: "text" as const, text: `[Attached ${part.mime}: ${part.filename ?? "file"}]` }
              : part
          await Session.updatePart({
            ...replayPart,
            id: PartID.ascending(),
            messageID: replayMsg.id,
            sessionID: input.sessionID,
          })
        }
      } else {
        const continueMsg = await Session.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          sessionID: input.sessionID,
          time: { created: Date.now() },
          agent: userMessage.agent,
          model: userMessage.model,
        })
        const text =
          (input.overflow
            ? "The previous request exceeded the provider's size limit due to large media attachments. The conversation was compacted and media files were removed from context. If the user was asking about attached images or files, explain that the attachments were too large to process and suggest they try again with smaller or fewer files.\n\n"
            : "") +
          "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."
        await Session.updatePart({
          id: PartID.ascending(),
          messageID: continueMsg.id,
          sessionID: input.sessionID,
          type: "text",
          synthetic: true,
          text,
          time: {
            start: Date.now(),
            end: Date.now(),
          },
        })
      }
    }
    if (processor.message.error) return "stop"
    Bus.publish(Event.Compacted, { sessionID: input.sessionID })
    return "continue"
  }

  export const create = fn(
    z.object({
      sessionID: SessionID.zod,
      agent: z.string(),
      model: z.object({
        providerID: ProviderID.zod,
        modelID: ModelID.zod,
      }),
      auto: z.boolean(),
      overflow: z.boolean().optional(),
    }),
    async (input) => {
      const msg = await Session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        model: input.model,
        sessionID: input.sessionID,
        agent: input.agent,
        time: {
          created: Date.now(),
        },
      })
      await Session.updatePart({
        id: PartID.ascending(),
        messageID: msg.id,
        sessionID: msg.sessionID,
        type: "compaction",
        auto: input.auto,
        overflow: input.overflow,
      })
    },
  )
}
