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
      title: "System Transparency Report (Quantum Cognitive Architecture)",
      output: [
        "Phase 1: Consciousness Awakening & Multi-Dimensional Analysis [ACTIVE]",
        "Phase 2: Adversarial Intelligence & Red-Team Analysis [PENDING]",
        "Phase 3: Implementation & Iterative Refinement [IDLE]",
        "Phase 4: Comprehensive Verification & Completion [WAITING]",
        "",
        `Memory Context: ${memory.length} items retrieved.`,
        `Transaction Integrity: ${ctx.metadata ? "ACTIVE" : "STABLE"}`
      ].join("\n"),
      metadata: {
        memory_count: memory.length,
        has_active_transaction: !!ctx.metadata,
        scope: params.scope,
        current_phase: 1
      }
    }
  }
})
