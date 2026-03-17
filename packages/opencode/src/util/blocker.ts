import { z } from "zod"
import { NamedError } from "@opencode-ai/util/error"

export namespace Blocker {
  export const Type = z.enum([
    "required_input_missing",
    "material_ambiguity",
    "destructive_approval_required",
    "no_tool_fallback",
    "hard_execution_failure",
  ])
  export type Type = z.infer<typeof Type>

  export const ExecutionState = z.enum([
    "running",
    "partial_continue",
    "blocked",
    "complete",
  ])
  export type ExecutionState = z.infer<typeof ExecutionState>

  export interface Info {
    type: Type
    reason: string
    requiredInput?: string
    state: ExecutionState
  }

  /**
   * Classifies if the current agent state constitutes a true blocker.
   * Based on the Finish-mode contract: skip routine check-ins, only stop for these specific reasons.
   */
  export function classify(error: unknown): Info | null {
    if (!error) return null

    // Hard Execution Failures
    if (error instanceof Error) {
      // Duck-type check for NamedError names
      const name = (error as any).name || "";

      // True Blockers
      if (name === "PermissionRejectedError" && (error as any).data?.destructive) {
         return {
           type: "destructive_approval_required",
           reason: "Action requires explicit user approval due to destructive nature.",
           state: "blocked",
         }
      }

      if (name === "ToolNotFoundError" || name === "ToolExecutionError") {
        return {
          type: "no_tool_fallback",
          reason: `Tool execution failed with no automated fallback: ${error.message}`,
          state: "blocked",
        }
      }

      // If it's a generic Error or an unhandled NamedError, it's a hard failure
      // We skip "PermissionRejectedError" (non-destructive) and "QuestionRejectedError"
      // because those are routine "should I continue" path blockers that we want to suppress.
      if (name !== "PermissionRejectedError" && name !== "QuestionRejectedError") {
        return {
          type: "hard_execution_failure",
          reason: error.message,
          state: "blocked",
        }
      }
    }

    // Default: Not a blocker if it doesn't match the strict criteria
    // Routine "ask" permissions or "should I continue" prompts are NOT blockers here.
    return null
  }

  /**
   * Helper to determine if the agent's text response contains a permission-seeking question
   * that should be suppressed in favor of auto-continuation.
   */
  export function isRoutineQuestion(text: string): boolean {
    const routinePatterns = [
      /would you like me to continue/i,
      /should i keep reading/i,
      /want me to inspect more/i,
      /do you want me to proceed/i,
      /ready to continue/i,
      /should i read the next part/i,
    ]
    return routinePatterns.some(pattern => pattern.test(text))
  }
}
