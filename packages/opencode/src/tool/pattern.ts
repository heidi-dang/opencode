import z from "zod"
import { Tool } from "./tool"
import { MessageV2 } from "@/session/message-v2"

const DESCRIPTION = `Analyzes the current session history to identify recurring tool call patterns and suggest proactive optimizations or automated workflows.`

export const PatternTool = Tool.define("pattern", {
  description: DESCRIPTION,
  parameters: z.object({
    min_sequence_length: z.number().default(2).describe("Minimum number of tools in a sequence to consider it a pattern."),
    min_occurrences: z.number().default(2).describe("Minimum number of times a sequence must repeat to be flagged.")
  }),
  async execute(params, ctx) {
    if (!ctx.messages || ctx.messages.length === 0) {
      return {
        title: "No Patterns Found",
        output: "Insufficient history to analyze patterns.",
        metadata: { count: 0, tool_count: 0, total_tools: 0, patterns: {} }
      }
    }

    // 1. Extract the sequence of tool calls from history
    const sequence: string[] = []
    for (const msg of ctx.messages) {
      if (!msg.parts) continue
      for (const part of msg.parts) {
        if (part.type === "tool") {
          sequence.push(part.tool)
        }
      }
    }

    if (sequence.length < params.min_sequence_length * params.min_occurrences) {
        return {
            title: "Insufficient Tool Data",
            output: `Analyzed ${sequence.length} tool calls. No recurring patterns of length ${params.min_sequence_length} detected yet.`,
            metadata: { count: 0, tool_count: sequence.length, total_tools: sequence.length, patterns: {} }
        }
    }

    // 2. Simple N-gram analysis for patterns of length min_sequence_length
    const patterns: Record<string, number> = {}
    const n = params.min_sequence_length
    
    for (let i = 0; i <= sequence.length - n; i++) {
      const gram = sequence.slice(i, i + n).join(" -> ")
      patterns[gram] = (patterns[gram] || 0) + 1
    }

    const detected = Object.entries(patterns)
      .filter(([_, count]) => count >= params.min_occurrences)
      .sort((a, b) => b[1] - a[1])

    if (detected.length === 0) {
      return {
        title: "No Strong Patterns Detected",
        output: `Analyzed ${sequence.length} tool calls. No sequences repeated more than ${params.min_occurrences} times.`,
        metadata: { count: 0, tool_count: sequence.length, total_tools: sequence.length, patterns: {} }
      }
    }

    // 3. Generate proactive suggestions based on the strongest pattern
    const [topPattern, count] = detected[0]
    const suggestion = `I've detected a recurring workflow: **${topPattern}** (${count} occurrences).
You might want to consider creating a specialized script or 'Verification Gate' to automate this sequence and reduce manual steps.`

    return {
      title: "Proactive Pattern Analysis",
      output: suggestion,
      metadata: { 
        count: detected.length,
        patterns: Object.fromEntries(detected),
        tool_count: sequence.length,
        total_tools: sequence.length
      }
    }
  }
})
