import { Log } from "../../util/log"

export type FailureType = 
  | "tool_timeout"
  | "permission_denied"
  | "incorrect_output"
  | "dependency_missing"
  | "lint_error"
  | "test_failure"
  | "unknown"

/**
 * RecoveryEngine: P6 — Failure classification and intelligent recovery.
 * Instead of retrying blindly, the agent uses these heuristics to pivot.
 */
export class RecoveryEngine {
  private static log = Log.create({ service: "recovery-engine" })

  static getPolicy(): string {
    return [
      `<recovery_policy>`,
      `  Structured Recovery: Do not panic on failure. Classify the error and apply the corresponding strategy.`,
      `  Strategies:`,
      `    - lint_error -> Fix immediately in the current file.`,
      `    - test_failure -> Analyze stack trace, don't just guess.`,
      `    - tool_timeout -> Simplify the request or check system state.`,
      `    - dependency_missing -> Install or pivot to a shim.`,
      `  Rollback Rule: If a complex edit causes multiple cascading errors, revert to the last known good state before trying a different approach.`,
      `</recovery_policy>`
    ].join("\n")
  }

  static getStrategy(type: FailureType): string {
    switch (type) {
      case "lint_error": return "Fix the specific line mentioned. Avoid changing surrounding logic unless necessary."
      case "test_failure": return "Read the error message carefully. Run the test with verbose output if possible."
      case "tool_timeout": return "Break the task into smaller chunks. Verify the tool is still responding."
      case "permission_denied": return "Check if you are in the correct directory or if the file is locked."
      default: return "Pivot to a discovery tool (list_dir, grep) to re-evaluate the environment."
    }
  }
}
