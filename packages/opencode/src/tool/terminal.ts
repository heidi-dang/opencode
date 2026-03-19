import z from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Terminal Tool - Read terminal state and selection.

Provides access to terminal history and selection for debugging and analysis.`

// Track terminal state
let lastCommand: string | null = null
let terminalHistory: string[] = []

export const TerminalLastCommandTool = Tool.define("terminal_last_command", {
  description: "Get the last executed terminal command",
  parameters: z.object({}),
  async execute(_params, ctx) {
    return {
      title: "Last Terminal Command",
      metadata: {
        command: lastCommand,
        history_length: terminalHistory.length,
      },
      output: lastCommand ?? "No command executed yet",
    }
  },
})

export const TerminalSelectionTool = Tool.define("terminal_selection", {
  description: "Get selected terminal text or range",
  parameters: z.object({
    start_line: z.number().describe("Start line number").optional(),
    end_line: z.number().describe("End line number").optional(),
  }),
  async execute(params, ctx) {
    const lines = params.start_line !== undefined && params.end_line !== undefined
      ? terminalHistory.slice(params.start_line, params.end_line + 1)
      : terminalHistory.slice(-20)

    return {
      title: "Terminal Selection",
      metadata: {
        lines,
        total: terminalHistory.length,
        range: params.start_line !== undefined ? `${params.start_line}-${params.end_line}` : "last 20",
      },
      output: lines.join("\n") || "No terminal history",
    }
  },
})

// Helper to track commands (called from bash tool)
export function trackTerminalCommand(command: string) {
  lastCommand = command
  terminalHistory.push(command)
  if (terminalHistory.length > 100) {
    terminalHistory = terminalHistory.slice(-100)
  }
}
