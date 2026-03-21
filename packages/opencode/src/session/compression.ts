import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { Instance } from "@/project/instance"
import { Storage } from "@/storage/storage"
import { Log } from "@/util/log"
import { Token } from "@/util/token"
import z from "zod"
import { Session } from "."
import { LLM } from "./llm"
import { MessageV2 } from "./message-v2"
import { MessageID, PartID, SessionID } from "./schema"

export namespace SessionCompression {
  const log = Log.create({ service: "session.compression" })
  const OUTPUT_PLACEHOLDER = "[Old tool result content cleared]"
  const INPUT_PLACEHOLDER = "[Old tool input content cleared]"
  const ERROR_INPUT_PLACEHOLDER = "[Failed tool input removed after several turns]"
  const RANGE_NOTE = "Compressed context range hidden. Use the stored summary below instead of the hidden messages."
  const PROTECTED = new Set(["task", "skill", "todowrite", "todoread", "batch", "plan_enter", "plan_exit"])

  export const Item = z.object({
    id: z.number().int().positive(),
    start: MessageID.zod,
    end: MessageID.zod,
    summary: z.string(),
    topic: z.string().optional(),
    focus: z.string().optional(),
    active: z.boolean(),
    tokens: z.object({
      before: z.number().int().nonnegative(),
      after: z.number().int().nonnegative(),
      saved: z.number().int().nonnegative(),
    }),
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Item = z.infer<typeof Item>

  const State = z.object({
    next: z.number().int().positive().default(1),
    items: z.array(Item).default([]),
  })
  type State = z.infer<typeof State>

  export type Turn = {
    index: number
    start: number
    end: number
    first: MessageV2.WithParts
    last: MessageV2.WithParts
    preview: string
  }

  type Entry = {
    item: Item
    loc: {
      start: number
      end: number
    }
  }

  async function read(sessionID: SessionID) {
    try {
      return State.parse(await Storage.read(["session_compression", sessionID]))
    } catch {
      return State.parse({})
    }
  }

  async function write(sessionID: SessionID, state: State) {
    if (state.items.length === 0) {
      await Storage.remove(["session_compression", sessionID]).catch(() => undefined)
      return
    }
    await Storage.write(["session_compression", sessionID], state)
  }

  export async function clear(sessionID: SessionID) {
    await Storage.remove(["session_compression", sessionID]).catch(() => undefined)
  }

  function text(msg: MessageV2.WithParts) {
    const part = msg.parts.find(
      (part): part is MessageV2.TextPart => part.type === "text" && !part.ignored && part.text.trim().length > 0,
    )
    if (part) return part.text.trim().replace(/\s+/g, " ")
    const tool = msg.parts.find((part): part is MessageV2.ToolPart => part.type === "tool")
    if (tool) return `${tool.tool} tool output`
    return msg.info.role === "user" ? "User turn" : "Assistant turn"
  }

  export function turns(msgs: MessageV2.WithParts[]) {
    const out: Turn[] = []
    let start = -1
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].info.role !== "user") continue
      if (msgs[i].parts.some((part) => part.type === "compaction")) continue
      if (start !== -1) {
        const first = msgs[start]
        const last = msgs[i - 1] ?? first
        out.push({
          index: out.length + 1,
          start,
          end: i - 1,
          first,
          last,
          preview: text(first).slice(0, 80),
        })
      }
      start = i
    }
    if (start !== -1) {
      const first = msgs[start]
      const last = msgs[msgs.length - 1] ?? first
      out.push({
        index: out.length + 1,
        start,
        end: msgs.length - 1,
        first,
        last,
        preview: text(first).slice(0, 80),
      })
    }
    return out
  }

  function locate(msgs: MessageV2.WithParts[], item: Item) {
    const byID = new Map(msgs.map((msg, idx) => [msg.info.id, idx]))
    const start = byID.get(item.start)
    const end = byID.get(item.end)
    if (start === undefined || end === undefined || start > end) return
    return { start, end }
  }

  function overlap(a: { start: number; end: number }, b: { start: number; end: number }) {
    return !(a.end < b.start || a.start > b.end)
  }

  function entries(msgs: MessageV2.WithParts[], items: Item[]) {
    return items
      .filter((item) => item.active)
      .map((item) => ({ item, loc: locate(msgs, item) }))
      .filter((item): item is Entry => Boolean(item.loc))
  }

  function contains(a: Entry, b: Entry) {
    return a.loc.start <= b.loc.start && a.loc.end >= b.loc.end
  }

  function hierarchy(msgs: MessageV2.WithParts[], items: Item[]) {
    const list = entries(msgs, items)
    const parent = new Map<number, number | undefined>()

    for (const child of list) {
      const candidates = list
        .filter((item) => item.item.id !== child.item.id && contains(item, child))
        .sort((a, b) => {
          const spanA = a.loc.end - a.loc.start
          const spanB = b.loc.end - b.loc.start
          if (spanA !== spanB) return spanA - spanB
          return a.item.id - b.item.id
        })
      parent.set(child.item.id, candidates[0]?.item.id)
    }

    const depth = (entry: Entry) => {
      let count = 0
      let id = parent.get(entry.item.id)
      while (id) {
        count++
        id = parent.get(id)
      }
      return count
    }

    return list.sort((a, b) => {
      if (a.loc.start !== b.loc.start) return a.loc.start - b.loc.start
      if (a.loc.end !== b.loc.end) return b.loc.end - a.loc.end
      return a.item.id - b.item.id
    }).map((entry) => ({
      ...entry,
      parent: parent.get(entry.item.id),
      depth: depth(entry),
    }))
  }

  export function expand(
    msgs: MessageV2.WithParts[],
    items: Item[],
    range: { start: number; end: number },
  ) {
    const result = { ...range }
    while (true) {
      let changed = false
      for (const entry of entries(msgs, items)) {
        if (!overlap(result, entry.loc)) continue
        const start = Math.min(result.start, entry.loc.start)
        const end = Math.max(result.end, entry.loc.end)
        if (start === result.start && end === result.end) continue
        result.start = start
        result.end = end
        changed = true
      }
      if (!changed) return result
    }
  }

  export function project(input: {
    sessionID: SessionID
    messages: MessageV2.WithParts[]
    items: Item[]
    range?: { start: number; end: number }
  }) {
    const result = input.range
      ? input.messages.slice(input.range.start, input.range.end + 1)
      : structuredClone(input.messages)
    const list = entries(input.messages, input.items)
      .filter((entry) => {
        if (!input.range) return true
        return overlap(input.range, entry.loc)
      })
      .sort((a, b) => b.loc.start - a.loc.start)
    for (const entry of list) {
      const start = input.range ? entry.loc.start - input.range.start : entry.loc.start
      const end = input.range ? entry.loc.end - input.range.start : entry.loc.end
      if (start < 0 || end < start || end >= result.length) continue
      const slice = result.slice(start, end + 1)
      result.splice(start, end - start + 1, ...summaryPair(input.sessionID, entry.item, slice))
    }
    return result
  }

  function span(turns: Turn[], item: Item) {
    const start = turns.find((turn) => turn.first.info.id === item.start)?.index
    const end = turns.find((turn) => turn.last.info.id === item.end)?.index
    if (start && end) return start === end ? `${start}` : `${start}..${end}`
    return `${item.start}..${item.end}`
  }

  function summaryPair(sessionID: SessionID, item: Item, msgs: MessageV2.WithParts[]) {
    const first = msgs[0]
    const user = first?.info.role === "user" ? first.info : undefined
    if (!user) return [] as MessageV2.WithParts[]
    const assistant = [...msgs]
      .reverse()
      .find((msg): msg is MessageV2.WithParts & { info: MessageV2.Assistant } => msg.info.role === "assistant")
    const parentID = `compression:${item.id}:user` as MessageID
    const assistantID = `compression:${item.id}:assistant` as MessageID
    const userInfo: MessageV2.User = {
      id: parentID,
      role: "user",
      sessionID,
      time: { created: item.time.created },
      agent: user.agent,
      model: user.model,
    }
    const userPart: MessageV2.TextPart = {
      id: `compression:${item.id}:user:part` as PartID,
      sessionID,
      messageID: parentID,
      type: "text",
      text: `Compression #${item.id} replaced a stored conversation range. ${RANGE_NOTE}`,
      synthetic: true,
      metadata: { compression: item.id },
    }
    const assistantInfo: MessageV2.Assistant = {
      id: assistantID,
      role: "assistant",
      sessionID,
      parentID,
      mode: "compact",
      agent: "compact",
      path: {
        cwd: Instance.directory,
        root: Instance.worktree,
      },
      time: {
        created: item.time.created,
        completed: item.time.updated,
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      providerID: assistant?.info.providerID ?? user.model.providerID,
      modelID: assistant?.info.modelID ?? user.model.modelID,
      finish: "stop",
    }
    const assistantPart: MessageV2.TextPart = {
      id: `compression:${item.id}:assistant:part` as PartID,
      sessionID,
      messageID: assistantID,
      type: "text",
      text: [`Compression #${item.id}${item.topic ? `: ${item.topic}` : ""}`, item.summary].join("\n\n"),
      synthetic: true,
      metadata: { compression: item.id },
    }
    return [
      {
        info: userInfo,
        parts: [userPart],
      },
      {
        info: assistantInfo,
        parts: [assistantPart],
      },
    ] as MessageV2.WithParts[]
  }

  export async function apply(input: { sessionID: SessionID; messages: MessageV2.WithParts[] }) {
    const state = await read(input.sessionID)
    input.messages.splice(0, input.messages.length, ...project({
      sessionID: input.sessionID,
      messages: input.messages,
      items: state.items,
    }))
  }

  function estimate(msgs: MessageV2.WithParts[]) {
    const stats = { user: 0, assistant: 0, tools: 0, summary: 0, total: 0 }
    for (const msg of msgs) {
      for (const part of msg.parts) {
        if (part.type === "text") {
          if (part.ignored) continue
          const size = Token.estimate(part.text)
          if (part.synthetic && part.metadata?.compression) stats.summary += size
          else if (msg.info.role === "user") stats.user += size
          else stats.assistant += size
          continue
        }
        if (part.type !== "tool") continue
        if (part.state.status === "completed") {
          stats.tools += Token.estimate(JSON.stringify(part.state.input))
          stats.tools += Token.estimate(part.state.time.compacted ? OUTPUT_PLACEHOLDER : part.state.output)
          continue
        }
        if (part.state.status === "error") {
          stats.tools += Token.estimate(JSON.stringify(part.state.input))
          stats.tools += Token.estimate(part.state.error)
        }
      }
    }
    stats.total = stats.user + stats.assistant + stats.tools + stats.summary
    return stats
  }

  function outputSavings(msgs: MessageV2.WithParts[]) {
    let total = 0
    for (const msg of msgs) {
      for (const part of msg.parts) {
        if (part.type !== "tool") continue
        if (part.state.status !== "completed") continue
        if (!part.state.time.compacted) continue
        total += Math.max(0, Token.estimate(part.state.output) - Token.estimate(OUTPUT_PLACEHOLDER))
      }
    }
    return total
  }

  function clean(text: string) {
    return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim()
  }

  function topic(text: string, focus?: string) {
    if (focus) return focus.trim().slice(0, 80)
    const line = clean(text)
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)
    return line?.replace(/^#+\s*/, "").slice(0, 80)
  }

  function parse(args: string, total: number) {
    const text = args.trim()
    if (!text) return { start: total, end: total }

    const range = text.match(/^(\d+)\.\.(\d+)(?:\s+(.+))?$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      return { start, end, focus: range[3]?.trim() }
    }

    const count = text.match(/^(\d+)(?:\s+(.+))?$/)
    if (count) {
      const size = Number(count[1])
      return {
        start: Math.max(1, total - size + 1),
        end: total,
        focus: count[2]?.trim(),
      }
    }

    return { start: total, end: total, focus: text }
  }

  async function summarize(input: {
    sessionID: SessionID
    focus?: string
    messages: MessageV2.WithParts[]
    user: MessageV2.User
  }) {
    const agent = await Agent.get("compaction")
    const model = agent.model
      ? await Provider.getModel(agent.model.providerID, agent.model.modelID)
      : await Provider.getModel(input.user.model.providerID, input.user.model.modelID)
    const prompt = [
      "Summarize the selected conversation range so a future coding agent can continue without the hidden messages.",
      input.focus ? `Focus on: ${input.focus}` : "Focus on finished work, open questions, files touched, and concrete next steps.",
      "Preserve critical user instructions, constraints, and file paths.",
      "Be technical and concise.",
    ].join("\n")
    const result = await LLM.stream({
      agent,
      user: input.user,
      system: [],
      tools: {},
      model,
      abort: new AbortController().signal,
      sessionID: input.sessionID,
      messages: [
        ...MessageV2.toModelMessages(structuredClone(input.messages), model, { stripMedia: true }),
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
    })
    return clean(await result.text)
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

  export async function context(sessionID: SessionID) {
    const msgs = await Session.messages({ sessionID })
    const state = await read(sessionID)
    const view = structuredClone(msgs)
    await apply({ sessionID, messages: view })
    const stats = estimate(view)
    const saved = outputSavings(msgs) + state.items.filter((item) => item.active).reduce((sum, item) => sum + item.tokens.saved, 0)
    const list = turns(msgs)
    const active = hierarchy(msgs, state.items)
    const lines = [
      "Context stats",
      `- Visible tokens: ${stats.total}`,
      `- User: ${stats.user}`,
      `- Assistant: ${stats.assistant}`,
      `- Tools: ${stats.tools}`,
      `- Summaries: ${stats.summary}`,
      `- Saved by pruning/compression: ${saved}`,
      `- Active compressions: ${active.length}`,
    ]
    if (active.length) {
      lines.push("", "Active compressions")
      lines.push(
        ...active.map((entry) => {
          const prefix = `${"  ".repeat(entry.depth)}-`
          const label = entry.parent ? `[nested under #${entry.parent}]` : "[top-level]"
          return `${prefix} #${entry.item.id} turns ${span(list, entry.item)} saved ${entry.item.tokens.saved} tokens${entry.item.topic ? ` | ${entry.item.topic}` : ""} ${label}`
        }),
      )
    }
    if (list.length) {
      lines.push("", "Available turns")
      lines.push(...list.map((turn) => `- ${turn.index}: ${turn.preview}`))
    }
    return lines.join("\n")
  }

  export async function sweep(input: { sessionID: SessionID; count?: number }) {
    const cfg = await Config.get()
    const protect = new Set([...(cfg.compaction?.protectedTools ?? []), ...PROTECTED])
    const msgs = await Session.messages({ sessionID: input.sessionID })
    const idx = msgs.findLastIndex((msg) => msg.info.role === "user")
    if (idx === -1 || idx === msgs.length - 1) return "No assistant tool output is available to sweep."
    let count = 0
    let saved = 0
    const limit = input.count && input.count > 0 ? input.count : Infinity
    for (let i = msgs.length - 1; i > idx; i--) {
      for (let j = msgs[i].parts.length - 1; j >= 0; j--) {
        const part = msgs[i].parts[j]
        if (part.type !== "tool") continue
        if (protect.has(part.tool)) continue
        if (count >= limit) break
        if (part.state.status === "completed") {
          if (!part.state.time.compacted) {
            saved += Math.max(0, Token.estimate(part.state.output) - Token.estimate(OUTPUT_PLACEHOLDER))
            part.state.time.compacted = Date.now()
          }
          if (!part.state.time.inputCompacted) {
            part.state.input = compactInput(part.state.input, INPUT_PLACEHOLDER) as Record<string, any>
            part.state.time.inputCompacted = Date.now()
          }
          await Session.updatePart(part)
          count++
          continue
        }
        if (part.state.status === "error" && !part.state.time.inputCompacted) {
          part.state.input = compactInput(part.state.input, ERROR_INPUT_PLACEHOLDER) as Record<string, any>
          part.state.time.inputCompacted = Date.now()
          await Session.updatePart(part)
          count++
        }
      }
      if (count >= limit) break
    }
    if (count === 0) return "No sweepable tools were found after the latest user turn."
    return `Swept ${count} tool call${count === 1 ? "" : "s"} and saved about ${saved} tokens of tool output.`
  }

  export async function compact(input: { sessionID: SessionID; arguments: string }) {
    const msgs = await Session.messages({ sessionID: input.sessionID })
    const list = turns(msgs)
    if (list.length === 0) return "No turns are available to compress yet."
    const picked = parse(input.arguments, list.length)
    const start = Math.max(1, Math.min(picked.start, list.length))
    const end = Math.max(1, Math.min(picked.end, list.length))
    if (start > end) return `Invalid range ${start}..${end}.`
    const first = list[start - 1]
    const last = list[end - 1]
    const user = first.first.info.role === "user" ? first.first.info : undefined
    if (!user) return "The selected range does not start with a user turn."

    const state = await read(input.sessionID)
    const raw = { start: first.start, end: last.end }
    const bounds = expand(msgs, state.items, raw)
    const exists = state.items.find(
      (item) => item.active && locate(msgs, item)?.start === bounds.start && locate(msgs, item)?.end === bounds.end,
    )
    if (exists) return `The selected range already matches active compression #${exists.id}.`

    const slice = project({
      sessionID: input.sessionID,
      messages: msgs,
      items: state.items,
      range: bounds,
    })
    const summary = await summarize({
      sessionID: input.sessionID,
      focus: picked.focus,
      messages: slice,
      user,
    })
    const after = Token.estimate(RANGE_NOTE) + Token.estimate(summary)
    const before = estimate(slice).total
    const item = Item.parse({
      id: state.next,
      start: msgs[bounds.start].info.id,
      end: msgs[bounds.end].info.id,
      summary,
      topic: topic(summary, picked.focus),
      focus: picked.focus,
      active: true,
      tokens: {
        before,
        after,
        saved: Math.max(0, before - after),
      },
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    })
    state.next += 1
    state.items.push(item)
    await write(input.sessionID, state)
    const nested = bounds.start !== raw.start || bounds.end !== raw.end
    log.info("compressed", {
      sessionID: input.sessionID,
      id: item.id,
      start,
      end,
      nested,
      saved: item.tokens.saved,
    })
    return `Created compression #${item.id} for turns ${start}${start === end ? "" : `..${end}`}${nested ? ` (expanded to include overlapping compressed context)` : ""}, saving about ${item.tokens.saved} tokens. Use /decompress ${item.id} to restore the hidden range.`
  }

  function describe(items: Item[], label: string, turns: Turn[]) {
    if (items.length === 0) return `No ${label} compressions.`
    return [
      `${label[0].toUpperCase()}${label.slice(1)} compressions`,
      ...items.map((item) => `- #${item.id} turns ${span(turns, item)} saved ${item.tokens.saved} tokens${item.topic ? ` | ${item.topic}` : ""}`),
    ].join("\n")
  }

  export async function decompress(input: { sessionID: SessionID; arguments: string }) {
    const state = await read(input.sessionID)
    const list = turns(await Session.messages({ sessionID: input.sessionID }))
    const text = input.arguments.trim()
    if (!text) return describe(state.items.filter((item) => item.active), "active", list)
    const id = Number(text)
    if (!id) return "Provide a compression id, for example /decompress 2."
    const item = state.items.find((item) => item.id === id)
    if (!item) return `Compression #${id} was not found.`
    if (!item.active) return `Compression #${id} is already decompressed.`
    item.active = false
    item.time.updated = Date.now()
    await write(input.sessionID, state)
    return `Decompressed range #${id}. Use /recompress ${id} to hide it again.`
  }

  export async function recompress(input: { sessionID: SessionID; arguments: string }) {
    const state = await read(input.sessionID)
    const msgs = await Session.messages({ sessionID: input.sessionID })
    const list = turns(msgs)
    const text = input.arguments.trim()
    if (!text) return describe(state.items.filter((item) => !item.active), "inactive", list)
    const id = Number(text)
    if (!id) return "Provide a compression id, for example /recompress 2."
    const item = state.items.find((item) => item.id === id)
    if (!item) return `Compression #${id} was not found.`
    if (item.active) return `Compression #${id} is already active.`
    const target = locate(msgs, item)
    if (!target) return `Compression #${id} no longer matches the session history.`
    item.active = true
    item.time.updated = Date.now()
    await write(input.sessionID, state)
    return `Recompressed range #${id}.`
  }

  export async function command(input: { sessionID: SessionID; command: string; arguments: string }) {
    if (input.command === "context") return context(input.sessionID)
    if (input.command === "sweep") {
      const head = input.arguments.trim().split(/\s+/)[0]
      const count = Number(head)
      return sweep({ sessionID: input.sessionID, count: Number.isFinite(count) ? count : undefined })
    }
    if (input.command === "compact") return compact(input)
    if (input.command === "decompress") return decompress(input)
    if (input.command === "recompress") return recompress(input)
    return `Unknown native context command: ${input.command}`
  }
}