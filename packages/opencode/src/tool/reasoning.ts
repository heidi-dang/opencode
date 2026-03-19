import z from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Generates a multi-step execution plan using Chain-of-Thought reasoning (Beast Mode pattern). Use this before executing complex tasks to ensure a robust and logical approach.`

export const ReasoningTool = Tool.define("reasoning", {
  description: DESCRIPTION,
  parameters: z.object({
    goal: z.string().describe("The high-level goal you want to achieve."),
    context: z.string().optional().describe("Additional context or constraints for the planning.")
  }),
  async execute(params, ctx) {
    return {
      title: "Reasoning & Strategic Planning",
      output: "Thinking... (Beast Mode active)",
      metadata: {
        goal: params.goal,
        mode: "beast",
        status: "planning_initiated"
      }
    }
  }
})
