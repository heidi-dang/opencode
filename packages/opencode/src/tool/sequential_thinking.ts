import z from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Allows the agent to perform sequential thinking and reasoning before taking action. Use this to think through complex problems step-by-step (Beast Mode).`

export const SequentialThinkingTool = Tool.define("sequential_thinking", {
  description: DESCRIPTION,
  parameters: z.object({
    thought: z.string().describe("Current thought or reasoning step."),
    next_thought_needed: z.boolean().describe("Whether another thinking step is required before acting."),
    thought_number: z.number().describe("The current step number in the reasoning sequence."),
    total_thoughts: z.number().describe("Estimated total number of steps."),
    is_revision: z.boolean().optional().describe("Whether this thought is a revision of a previous one.")
  }),
  async execute(params, ctx) {
    return {
      title: `Thought #${params.thought_number}/${params.total_thoughts}${params.is_revision ? " (Revision)" : ""}`,
      output: params.thought,
      metadata: {
        step: params.thought_number,
        done: !params.next_thought_needed,
        type: "thinking"
      }
    }
  }
})
