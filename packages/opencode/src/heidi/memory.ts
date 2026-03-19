import fs from "fs/promises"
import { Filesystem } from "@/util/filesystem"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import path from "path"
import { SessionID } from "@/session/schema"

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

  function detectUnsafe(content: string): "safe" | "unsafe" | "unknown" {
    const unsafePatterns = [
      /secret/i,
      /password/i,
      /token/i,
      /api[_-]?key/i,
      /PRIVATE[_-]?KEY/i,
      /-----BEGIN/i,
      /[A-Za-z0-9]{32,}/,
    ]
    for (const pat of unsafePatterns) {
      if (pat.test(content)) return "unsafe"
    }
    return "safe"
  }
  function projectFile() {
    return path.join(Instance.directory, ".opencode", "heidi", "memory.jsonl")
  }

  function globalFile() {
    return path.join(Global.Path.state, "heidi", "memory.jsonl")
  }

  export async function add(sessionID: SessionID, item: Omit<Item, "timestamp" | "session_id" | "trust">, scope: "project" | "global" = "project") {
    const trust = detectUnsafe(item.content)
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
    const targets = [] as { file: string, scope: "project" | "global" }[]
    if (scope === "project" || scope === "both") targets.push({ file: projectFile(), scope: "project" })
    if (scope === "global" || scope === "both") targets.push({ file: globalFile(), scope: "global" })

    const items = [] as Item[]
    for (const target of targets) {
      const content = await Filesystem.readText(target.file).catch(() => "")
      if (!content) continue
      const lines = content.trim().split("\n")
      for (const line of lines) {
        try {
          const item = JSON.parse(line) as Item
          if (item.trust === "unsafe") continue
          if (item.key.toLowerCase().includes(text.toLowerCase()) || 
              item.content.toLowerCase().includes(text.toLowerCase()) || 
              item.type.toLowerCase().includes(text.toLowerCase())) {
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
      ...recent.map(m => `  - [${m.scope}] [${m.type}] [${m.trust ?? "unknown"}] ${m.key}: ${m.content}`),
      "</memory>",
    ].join("\n")
  }
}
