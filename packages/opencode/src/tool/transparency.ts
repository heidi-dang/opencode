import z from "zod"
import { Tool } from "./tool"
import { HeidiMemory } from "@/heidi/memory"

const DESCRIPTION = `Provides a transparent view of Heidi's internal state, including current memory context, active transaction status, and recent decision history.`

export const TransparencyTool = Tool.define("transparency", {
  description: DESCRIPTION,
  parameters: z.object({
    scope: z.enum(["memory", "transaction", "all"]).default("all")
  }),
  async execute(params, ctx) {
    const memory = await HeidiMemory.query("", "both")
    
    return {
      title: "System Transparency Report",
      output: "Analyzing internal state...",
      metadata: {
        memory_count: memory.length,
        has_active_transaction: !!ctx.metadata, // simplified
        scope: params.scope
      }
    }
  }
})
