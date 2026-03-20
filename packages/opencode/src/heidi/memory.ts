import fs from "fs/promises"
import { Filesystem } from "@/util/filesystem"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import path from "path"
import { SessionID } from "@/session/schema"
import { HeidiTelemetry } from "./telemetry"

type Trust = "safe" | "unsafe" | "unknown"

type Rule = {
  name: string
  patterns: RegExp[]
}

export const HeidiMemoryRules = {
  unsafe: [
    {
      name: "credentials",
      patterns: [
        /\b(password|passphrase|secret)\b\s*(?:=|:)\s*\S+/i,
        /\b(password|passphrase|secret)\b.{0,24}\b(is|are)\b.{0,24}\S+/i,
        /\b(api[_ -]?key|aws[_ -]?access[_ -]?key|private[_ -]?key)\b\s*(?:=|:)\s*\S+/i,
        /\btoken\b\s*(?:=|:)\s*\S+/i,
      ],
    },
    {
      name: "keys",
      patterns: [/-----BEGIN [A-Z ]*PRIVATE KEY-----/i],
    },
    {
      name: "auth",
      patterns: [/\bbearer\s+[A-Za-z0-9._-]{20,}\b/i, /\bsk[_-]?[A-Za-z0-9_-]{20,}\b/i],
    },
    {
      name: "blob",
      patterns: [/[A-Za-z0-9+/]{40,}[A-Za-z0-9+/=\s]{10,}[A-Za-z0-9+/]{40,}/],
    },
  ],
  unknown: [
    {
      name: "entropy",
      patterns: [/\b[A-Za-z0-9]{32,}\b/],
    },
  ],
} satisfies Record<Exclude<Trust, "safe">, Rule[]>

function match(content: string, rules: Rule[]) {
  return rules.filter((group) => group.patterns.some((pattern) => pattern.test(content))).map((group) => group.name)
}

export namespace HeidiMemory {
  export type Item = {
    timestamp: string
    session_id: SessionID
    type: string
    key: string
    content: string
    scope?: "project" | "global"
    trust?: "safe" | "unsafe" | "unknown"
  }

  export function inspect(content: string): { trust: Trust; groups: string[] } {
    const unsafe = match(content, HeidiMemoryRules.unsafe)
    if (unsafe.length) return { trust: "unsafe", groups: unsafe }

    const unknown = match(content, HeidiMemoryRules.unknown)
    if (unknown.length) return { trust: "unknown", groups: unknown }

    return { trust: "safe", groups: [] }
  }

  function projectFile() {
    return path.join(Instance.directory, ".opencode", "heidi", "memory.jsonl")
  }

  function globalFile() {
    return path.join(Global.Path.state, "heidi", "memory.jsonl")
  }

  export async function add(
    sessionID: SessionID,
    item: Omit<Item, "timestamp" | "session_id" | "trust">,
    scope: "project" | "global" = "project",
  ) {
    const trust = inspect(item.content).trust
    if (trust === "unsafe") {
      throw new Error("Unsafe memory content detected; not stored.")
    }
    const row: Item = {
      timestamp: new Date().toISOString(),
      session_id: sessionID,
      ...item,
      trust,
    }
    const target = scope === "project" ? projectFile() : globalFile()
    const dir = path.dirname(target)
    await fs.mkdir(dir, { recursive: true })
    const line = JSON.stringify(row) + "\n"
    await fs.appendFile(target, line)
  }

  export async function query(text: string, scope: "project" | "global" | "both" = "both"): Promise<Item[]> {
    const targets = [] as { file: string; scope: "project" | "global" }[]
    if (scope === "project" || scope === "both") targets.push({ file: projectFile(), scope: "project" })
    if (scope === "global" || scope === "both") targets.push({ file: globalFile(), scope: "global" })

    const items = [] as Item[]
    for (const target of targets) {
      const content = await Filesystem.readText(target.file).catch((err) => {
        HeidiTelemetry.debug("memory", "memory.query")
        return ""
      })
      if (!content) continue
      const lines = content.trim().split("\n")
      for (const line of lines) {
        try {
          const item = JSON.parse(line) as Item
          if (item.trust === "unsafe") continue
          if (
            item.key.toLowerCase().includes(text.toLowerCase()) ||
            item.content.toLowerCase().includes(text.toLowerCase()) ||
            item.type.toLowerCase().includes(text.toLowerCase())
          ) {
            items.push({ ...item, scope: target.scope })
          }
        } catch {}
      }
    }
    return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  export async function system(): Promise<string> {
    const memories = await query("", "both")
    if (memories.length === 0) return ""

    const recent = memories.slice(0, 10)
    return [
      "Here are some relevant long-term memories and patterns from previous sessions:",
      "<memory>",
      ...recent.map((m) => `  - [${m.scope}] [${m.type}] [${m.trust ?? "unknown"}] ${m.key}: ${m.content}`),
      "</memory>",
    ].join("\n")
  }
}
