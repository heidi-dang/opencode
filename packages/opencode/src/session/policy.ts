import { MessageV2 } from "./message-v2"
import { Log } from "../util/log"
import { Flag } from "../flag/flag"

const log = Log.create({ service: "session.policy" })

export interface CheckpointRule {
  name: string
  reason: string
  type: "security" | "safety" | "irreversible"
}

export interface GateDefinition {
  agent: string
  description: string
  prompt: string
}

export namespace Policy {
  /**
   * Determine the next quality gate subtask that should be executed.
   * Gates are executed in sequence: Sentry -> Vortex -> Reviewer.
   */
  export function nextGate(agent: string, messages: MessageV2.WithParts[]): GateDefinition | null {
    if (agent !== "heidi") return null

    const allParts = messages.flatMap((m) => m.parts)
    const subtasks = allParts.filter((p) => p.type === "subtask") as any[]
    const toolCalls = allParts.filter((p) => p.type === "tool") as any[]
    
    // Identify code edits
    const hasEdits = toolCalls.some((t) => ["edit", "write_to_file", "patch"].includes(t.tool))
    if (!hasEdits) return null

    // 1. Sentry Gate (Security)
    const hasSentry = subtasks.some((s) => s.agent === "sentry")
    if (!hasSentry && Flag.HEIDI_ENABLE_SENTRY_GATE) {
      return {
        agent: "sentry",
        description: "Perform mandatory security audit before finalization.",
        prompt: "Please run a security audit on the current changes. Scan for secrets, injection patterns, and insecure code. provide a pass/fail verdict."
      }
    }

    // 2. Vortex Gate (Visual - for UI changes)
    const hasVortex = subtasks.some((s) => s.agent === "vortex")
    const hasVisualChanges = toolCalls.some((t) => {
      const input = JSON.stringify(t.state.input)
      return input.includes(".css") || input.includes(".tsx") || input.includes(".jsx") || input.includes(".html")
    })
    if (!hasVortex && hasVisualChanges && Flag.HEIDI_ENABLE_VORTEX_GATE) {
      return {
        agent: "vortex",
        description: "Perform visual regression testing on UI changes.",
        prompt: "Capture screenshots of the modified UI components and check for regressions or layout issues."
      }
    }

    // 3. Reviewer Gate (Final logical/architectural review)
    const hasReviewer = subtasks.some((s) => s.agent === "reviewer")
    if (!hasReviewer && Flag.HEIDI_ENABLE_REVIEWER_GATE) {
      return {
        agent: "reviewer",
        description: "Final PR-style review of logic and conventions.",
        prompt: "Review the code changes for architectural consistency, performance issues, and adherence to style guides."
      }
    }

    return null
  }

  /**
   * Detect risky operations that require human approval checkpoints.
   */
  export function requiresApproval(parts: MessageV2.Part[]): CheckpointRule | null {
    for (const part of parts) {
      if (part.type === "tool") {
        const input = JSON.stringify(part.state.input)

        // 1. Database migrations/schema changes
        if (input.includes("migration") || input.includes("schema") || input.includes("sql")) {
          return {
            name: "database_change",
            reason: "Database migration or schema change detected",
            type: "irreversible"
          }
        }

        // 2. Auth/Authz logic
        if (input.includes("auth") || input.includes("login") || input.includes("permission")) {
          return {
            name: "auth_change",
            reason: "Modification to authentication or authorization logic",
            type: "security"
          }
        }

        // 3. Deleting files
        if (part.tool === "bash" && (input.includes("rm ") || input.includes("unlink "))) {
          // Simplistic check for now, could be improved with regex
          return {
            name: "file_deletion",
            reason: "Potential file deletion detected via bash",
            type: "safety"
          }
        }
      }
    }
    return null
  }

  /**
   * Check if the session context should be pruned/summarized based on step count.
   */
  export function shouldPrune(step: number, threshold: number = 15): boolean {
    return step >= threshold && step % threshold === 0
  }
}
