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
   * Verify that all executed quality gates have returned a successful verdict.
   */
  export function checkGates(agent: string, messages: MessageV2.WithParts[]): { pass: boolean; reason?: string } {
    if (agent !== "heidi") return { pass: true }

    const subtasks: { agent: string; found: boolean; index: number }[] = []
    const allParts: { part: MessageV2.Part; messageIndex: number }[] = []

    messages.forEach((m, mIdx) => {
      m.parts.forEach((p) => {
        allParts.push({ part: p, messageIndex: mIdx })
        if (p.type === "subtask") {
          subtasks.push({ agent: p.agent, found: false, index: allParts.length - 1 })
        }
      })
    })

    if (subtasks.length === 0) return { pass: true }

    for (const task of subtasks) {
      const following = allParts.slice(task.index + 1)
      let verdict: "pass" | "fail" | null = null

      for (const entry of following) {
        const p = entry.part

        // SCOPING: If we hit another subtask, stop searching for this specific gate's verdict.
        // This prevents cross-talk where a later gate's "Verdict: PASS" satisfies an earlier gate.
        if (p.type === "subtask") break

        const text = p.type === "text" ? p.text : p.type === "tool" && p.state.status === "completed" ? p.state.output : ""
        const content = text.toLowerCase()

        // Use robust regex for verdict detection
        const passRegex = /\bverdict:\s*pass\b|\ball\s*checks\s*passed\b|\bverdict:\s*success\b/i
        const failRegex = /\bverdict:\s*fail\b|\bsecurity\s*issues\s*found\b|\bregression\s*detected\b/i

        if (passRegex.test(content)) {
          verdict = "pass"
          break
        }
        if (failRegex.test(content)) {
          verdict = "fail"
          break
        }
      }

      if (verdict === "fail") {
        return { pass: false, reason: `Quality gate '${task.agent}' failed. Please fix the reported issues.` }
      }
      if (!verdict) {
        return { pass: false, reason: `Quality gate '${task.agent}' has not completed with a verdict yet.` }
      }
    }

    return { pass: true }
  }

  /**
   * Detect risky operations that require human approval checkpoints.
   */
  export function requiresApproval(parts: MessageV2.Part[]): CheckpointRule | null {
    for (const part of parts) {
      if (part.type === "tool") {
        const tool = part.tool
        const input = JSON.stringify(part.state.input)

        // 1. Database migrations/schema changes
        const isDbTool = ["sql", "db", "drizzle"].some(t => tool.includes(t))
        const hasDbKeywords = /\b(alter|drop|truncate|create\s+table|rename)\b/i.test(input)
        const isSchemaFile = /\b(migration|schema|table)\b/i.test(input)
        
        if ((isDbTool || isSchemaFile) && hasDbKeywords) {
          if (tool === "write_to_file" || tool === "edit" || tool === "patch" || isDbTool) {
            return {
              name: "database_change",
              reason: "Database schema modification or migration detected",
              type: "irreversible"
            }
          }
        }

        // 2. Auth/Authz logic in sensitive files
        const isAuthContext = /\b(auth|login|session|password|jwt|permission|role)\b/i.test(input)
        const isSensitiveFile = /\b(auth|permission|guard|middleware|passport)\b/i.test(input)
        if (isAuthContext && isSensitiveFile && (tool === "write_to_file" || tool === "edit" || tool === "patch")) {
          return {
            name: "auth_change",
            reason: "Modification to authentication or authorization logic in sensitive files",
            type: "security"
          }
        }

        // 3. Deleting files (more robust bash check)
        if (tool === "bash") {
          const bashCmd = part.state.input.command || ""
          if (/\b(rm|unlink|delete)\s+-?[rf]*\s+([^\s;&|]+)/.test(bashCmd)) {
             // Only if it's not a temp file or build artifact
             if (!bashCmd.includes("/tmp/") && !bashCmd.includes("node_modules/")) {
               return {
                 name: "file_deletion",
                 reason: "Potential system file deletion detected via bash",
                 type: "safety"
               }
             }
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
