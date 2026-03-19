import z from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `A tool for testing scaffolding.`

export const VerifyDemoToolTool = Tool.define("verify_demo_tool", {
  description: DESCRIPTION,
  parameters: z.object({}),
  async execute(params, ctx) {
    return {
      title: "verify demo_tool",
      output: "Implementation pending.",
      metadata: { status: "scaffolded" }
    }
  }
})
