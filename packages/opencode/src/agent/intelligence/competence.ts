import { Log } from "../../util/log"

export interface ToolEffectiveness {
  tool: string
  cost: number // 1-10, lower is cheaper/faster
  reliability: number // 1-10
  description: string
}

const TOOL_METRICS: Record<string, ToolEffectiveness> = {
  "list_dir": { tool: "list_dir", cost: 1, reliability: 10, description: "Fastest way to get structure" },
  "view_file": { tool: "view_file", cost: 2, reliability: 10, description: "Fast way to inspect content" },
  "grep_search": { tool: "grep_search", cost: 3, reliability: 9, description: "Precise search" },
  "run_command": { tool: "run_command", cost: 5, reliability: 8, description: "Highly capable but slower and side-effect prone" },
  "browser_subagent": { tool: "browser_subagent", cost: 8, reliability: 7, description: "Expensive, high-latency UI tool" },
  "generate_image": { tool: "generate_image", cost: 10, reliability: 9, description: "Purely asset generation" }
}

/**
 * ToolCompetence: P4 — Enforce "cheapest check first" and bounded retry logic.
 * Helps the agent decide which tool to use and how to handle failures.
 */
export class ToolCompetence {
  private static log = Log.create({ service: "tool-competence" })

  static getPolicy(): string {
    return [
      `<tool_competence_policy>`,
      `  Cheapest Check First: Always use low-cost discovery tools (list_dir, grep) before expensive ones (run_command, browser).`,
      `  Bounded Retries: Never retry the exact same tool call more than 3 times without changing parameters or approach.`,
      `  Failure Pivot: If a tool fails twice, pivot to a discovery tool to investigate 'why' instead of blind retries.`,
      `</tool_competence_policy>`
    ].join("\n")
  }

  static getEfficiencyHint(toolName: string): string {
    const metric = TOOL_METRICS[toolName]
    if (!metric) return ""
    return `Note: ${metric.tool} has a cost score of ${metric.cost}/10. ${metric.description}.`
  }
}
