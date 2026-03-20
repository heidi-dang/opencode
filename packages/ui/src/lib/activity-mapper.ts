/**
 * Activity mapper: translates raw tool events into human-friendly copy.
 *
 * Rules:
 * - Truthful: never say "fixed" unless an edit happened, never say "verified" unless verify passed
 * - Deterministic: same inputs always produce the same wording variant
 * - Phase-aware: adjusts tone based on tool context
 */

import {
  BASH_TYPECHECK,
  BASH_TEST,
  BASH_BUILD,
  BASH_LINT,
  BASH_GIT,
  BASH_GENERIC,
  EDIT_RUNNING,
  EDIT_DONE,
  WRITE_RUNNING,
  WRITE_DONE,
  VERIFY_PASS,
  VERIFY_FAIL,
  VERIFY_RUNNING,
  BOUNDARY_START,
  BOUNDARY_LOCK,
  BOUNDARY_EXECUTION,
  BOUNDARY_COMPLETE,
  BOUNDARY_VERIFY,
  BOUNDARY_GENERIC,
  SEARCH_RUNNING,
  READ_RUNNING,
  CONTEXT_GATHERING,
  CONTEXT_DONE,
  WEB_FETCH,
  WEB_SEARCH,
  SUBAGENT_RUNNING,
  PATCH_RUNNING,
  type Wording,
} from "./activity-wording"

export type ActivityInfo = {
  title: string
  subtitle: string
  tone: "neutral" | "success" | "warning" | "error"
  effect: "pulse" | "shimmer" | "pop" | "none"
}

/** Simple stable hash for deterministic variant selection */
function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function pick(variants: Wording[], seed: string): Wording {
  return variants[hash(seed) % variants.length]!
}

function pending(status?: string) {
  return status === "pending" || status === "running"
}

/** Detect bash command category from command string */
function category(cmd: string): string {
  const lower = (cmd || "").toLowerCase()
  if (lower.includes("typecheck") || lower.includes("tsc") || lower.includes("tsgo")) return "typecheck"
  if (lower.includes("test") || lower.includes("vitest") || lower.includes("jest") || lower.includes("bun test"))
    return "test"
  if (lower.includes("build") || lower.includes("compile")) return "build"
  if (lower.includes("lint") || lower.includes("eslint") || lower.includes("biome")) return "lint"
  if (lower.includes("git ")) return "git"
  return "generic"
}

export function humanize(tool: string, input: Record<string, unknown>, status?: string, idx = 0): ActivityInfo {
  const seed = `${tool}:${idx}`
  const running = pending(status)

  switch (tool) {
    case "bash":
    case "run_command": {
      const cmd = String(input.command || input.description || "")
      const cat = category(cmd)
      const map: Record<string, Wording[]> = {
        typecheck: BASH_TYPECHECK,
        test: BASH_TEST,
        build: BASH_BUILD,
        lint: BASH_LINT,
        git: BASH_GIT,
        generic: BASH_GENERIC,
      }
      const w = pick(map[cat] || BASH_GENERIC, seed)
      return {
        title: w.title,
        subtitle: w.subtitle || cmd,
        tone: status === "error" ? "error" : running ? "neutral" : "success",
        effect: running ? "shimmer" : status === "error" ? "none" : "pop",
      }
    }

    case "edit":
    case "multiedit":
    case "replace_file_content": {
      const w = pick(running ? EDIT_RUNNING : EDIT_DONE, seed)
      return {
        title: w.title,
        subtitle: String(input.filePath || ""),
        tone: status === "error" ? "error" : "neutral",
        effect: running ? "shimmer" : "none",
      }
    }

    case "write": {
      const w = pick(running ? WRITE_RUNNING : WRITE_DONE, seed)
      return {
        title: w.title,
        subtitle: String(input.filePath || ""),
        tone: status === "error" ? "error" : "neutral",
        effect: running ? "shimmer" : "none",
      }
    }

    case "verify": {
      if (running) {
        const w = pick(VERIFY_RUNNING, seed)
        return { title: w.title, subtitle: w.subtitle, tone: "neutral", effect: "pulse" }
      }
      const passed = String(input.status || "").includes("pass")
      const w = pick(passed ? VERIFY_PASS : VERIFY_FAIL, seed)
      return {
        title: w.title,
        subtitle: w.subtitle,
        tone: passed ? "success" : "warning",
        effect: passed ? "pop" : "none",
      }
    }

    case "task_boundary": {
      const action = String(input.action || "")
      const variants: Record<string, Wording[]> = {
        start: BOUNDARY_START,
        lock_plan: BOUNDARY_LOCK,
        begin_execution: BOUNDARY_EXECUTION,
        complete: BOUNDARY_COMPLETE,
        request_verification: BOUNDARY_VERIFY,
      }
      const w = pick(variants[action] || BOUNDARY_GENERIC, seed)
      return {
        title: w.title,
        subtitle: w.subtitle || String(input.objective || ""),
        tone: action === "complete" ? "success" : "neutral",
        effect: action === "complete" ? "pop" : running ? "shimmer" : "none",
      }
    }

    case "grep":
    case "glob": {
      const w = pick(SEARCH_RUNNING, seed)
      return {
        title: w.title,
        subtitle: String(input.pattern || input.path || ""),
        tone: "neutral",
        effect: running ? "shimmer" : "none",
      }
    }

    case "read": {
      const w = pick(READ_RUNNING, seed)
      return {
        title: w.title,
        subtitle: String(input.filePath || ""),
        tone: "neutral",
        effect: running ? "shimmer" : "none",
      }
    }

    case "webfetch": {
      const w = pick(WEB_FETCH, seed)
      return {
        title: w.title,
        subtitle: String(input.url || ""),
        tone: "neutral",
        effect: running ? "shimmer" : "none",
      }
    }

    case "websearch":
    case "codesearch": {
      const w = pick(WEB_SEARCH, seed)
      return {
        title: w.title,
        subtitle: String(input.query || ""),
        tone: "neutral",
        effect: running ? "shimmer" : "none",
      }
    }

    case "task": {
      const w = pick(SUBAGENT_RUNNING, seed)
      return {
        title: w.title,
        subtitle: String(input.description || ""),
        tone: "neutral",
        effect: running ? "pulse" : "none",
      }
    }

    case "apply_patch": {
      const w = pick(PATCH_RUNNING, seed)
      const files = Array.isArray(input.files) ? input.files : []
      return {
        title: w.title,
        subtitle: files.length ? `${files.length} file${files.length > 1 ? "s" : ""}` : "",
        tone: "neutral",
        effect: running ? "shimmer" : "none",
      }
    }

    default: {
      return {
        title: `Called ${tool}`,
        subtitle: "",
        tone: "neutral",
        effect: running ? "shimmer" : "none",
      }
    }
  }
}

/** Humanize context group titles */
export function humanizeContext(active: boolean, seed = ""): { active: string; done: string } {
  const aw = pick(CONTEXT_GATHERING, seed || "ctx")
  const dw = pick(CONTEXT_DONE, seed || "ctx")
  return { active: aw.title, done: dw.title }
}
