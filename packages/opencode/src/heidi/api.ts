import path from "path"
import { Filesystem } from "@/util/filesystem"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import { SessionID } from "@/session/schema"
import { TaskState } from "./schema"
import { HeidiContext } from "./context"

export namespace HeidiAPI {
  // Version for API tracking
  export const VERSION = "1.0.0"

  // Public path resolution API
  export function root(sessionID: SessionID): string {
    try {
      if (Instance.project.vcs) return path.join(Instance.worktree, ".opencode", "heidi", sessionID)
    } catch {}
    return path.join(Global.Path.state, "heidi", sessionID)
  }

  export function paths(sessionID: SessionID) {
    const base = root(sessionID)
    return {
      task: path.join(base, "task.json"),
      md: path.join(base, "task.md"),
      plan: path.join(base, "implementation_plan.md"),
      verify: path.join(base, "verification.json"),
      resume: path.join(base, "resume.json"),
      context: path.join(base, "context.json"),
      knowledge: path.join(base, "knowledge.jsonl"),
    }
  }

  // Public task state API
  export async function readTask(sessionID: SessionID): Promise<TaskState> {
    const p = paths(sessionID).task
    return TaskState.parse(await Filesystem.readJson(p))
  }

  export async function writeTask(sessionID: SessionID, state: TaskState): Promise<void> {
    const p = paths(sessionID)
    await Filesystem.writeJson(p.task, state)
    await Filesystem.write(p.md, renderTask(state))
    await HeidiContext.sync(sessionID)
  }

  // Public plan validation API
  export function validatePlan(text: string): { valid: boolean; issues: string[] } {
    const issues = planIssues(text)
    return {
      valid: issues.length === 0,
      issues,
    }
  }

  // Helpers
  function renderTask(state: TaskState): string {
    const out = [] as string[]
    out.push(`# Heidi Task: ${state.task_id}`)
    out.push("")
    out.push(`> **Run ID**: \`${state.run_id}\``)
    out.push(`> **Status**: \`${state.fsm_state}\` (${state.mode})`)
    out.push(`> **Goal**: ${state.objective.text}`)
    return out.join("\n") + "\n"
  }

  function planIssues(text: string): string[] {
    const sections = ["Background and discovered repo facts", "Scope", "Files to modify", "Change strategy by component", "Verification plan"]
    return sections.filter((s) => {
      const re = new RegExp(`## ${s}\\s*\\n([\\s\\S]*?)(?=##|$)`, "i")
      const match = text.match(re)
      if (!match) return true
      const body = match[1]?.trim() ?? ""
      return !body || body === "- TBD" || body === "TBD" || /^\s*-?\s*TBD/im.test(body)
    })
  }

  // Export version info
  export function version(): { version: string; api: string } {
    return {
      version: VERSION,
      api: "HeidiStateAPI",
    }
  }
}
