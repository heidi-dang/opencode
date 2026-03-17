import { Filesystem } from "../../util/filesystem"
import * as path from "path"
import { Log } from "../../util/log"

export interface WorkingSetEntry {
  key: string
  summary: string
  content: string
  addedAt: number
}

export interface WorkingSetState {
  activeTask: string
  entries: WorkingSetEntry[]
  notes: string[]
  updatedAt: number
}

const MAX_ENTRIES = 30

/**
 * WorkingSet: P2 Context Engine — rolling session-scoped context buffer.
 * Stores the most relevant files and notes for the current task.
 * Persists to disk for resume-safe operation after interruption.
 */
export class WorkingSet {
  private static log = Log.create({ service: "working-set" })

  private static statePath(root: string, sessionID: string) {
    return path.join(root, ".opencode", "working-set", `${sessionID}.json`)
  }

  static async load(root: string, sessionID: string): Promise<WorkingSetState> {
    const p = this.statePath(root, sessionID)
    return Filesystem.readJson(p).catch(() => ({
      activeTask: "",
      entries: [],
      notes: [],
      updatedAt: Date.now(),
    })) as Promise<WorkingSetState>
  }

  static async save(root: string, sessionID: string, state: WorkingSetState) {
    const p = this.statePath(root, sessionID)
    await Filesystem.writeJson(p, { ...state, updatedAt: Date.now() })
  }

  static async add(
    root: string,
    sessionID: string,
    key: string,
    summary: string,
    content: string,
  ) {
    const state = await this.load(root, sessionID)
    const existing = state.entries.findIndex(e => e.key === key)
    const entry: WorkingSetEntry = { key, summary, content, addedAt: Date.now() }

    if (existing >= 0) {
      state.entries[existing] = entry
    } else {
      state.entries.push(entry)
      // Evict oldest entries beyond limit
      if (state.entries.length > MAX_ENTRIES) {
        state.entries.sort((a, b) => a.addedAt - b.addedAt)
        state.entries.splice(0, state.entries.length - MAX_ENTRIES)
      }
    }

    await this.save(root, sessionID, state)
    this.log.info("working set updated", { key, total: state.entries.length })
  }

  static async addNote(root: string, sessionID: string, note: string) {
    const state = await this.load(root, sessionID)
    state.notes.push(note)
    await this.save(root, sessionID, state)
  }

  static async format(root: string, sessionID: string): Promise<string> {
    const state = await this.load(root, sessionID)
    if (state.entries.length === 0 && state.notes.length === 0) return ""

    const lines: string[] = ["<working_set>"]
    if (state.activeTask) lines.push(`  <task>${state.activeTask}</task>`)
    if (state.notes.length) {
      lines.push("  <notes>")
      for (const n of state.notes) lines.push(`    - ${n}`)
      lines.push("  </notes>")
    }
    for (const e of state.entries) {
      lines.push(`  <file key="${e.key}" summary="${e.summary}">`)
      lines.push(e.content)
      lines.push("  </file>")
    }
    lines.push("</working_set>")
    return lines.join("\n")
  }

  static async clear(root: string, sessionID: string) {
    const p = this.statePath(root, sessionID)
    await Filesystem.writeJson(p, {
      activeTask: "",
      entries: [],
      notes: [],
      updatedAt: Date.now(),
    })
  }
}
