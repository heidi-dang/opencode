import z from "zod"
import { Tool } from "./tool"
import { HeidiMemory } from "@/heidi/memory"
import { HeidiState } from "@/heidi/state"

const DESCRIPTION = `Provides a transparent view of Heidi's internal state, including current memory context, active transaction status, and recent decision history.`

export const TransparencyTool = Tool.define("transparency", {
  description: DESCRIPTION,
  parameters: z.object({
    scope: z.enum(["memory", "transaction", "all"]).default("all")
  }),
  async execute(params, ctx) {
    const [memory, state] = await Promise.all([
      HeidiMemory.query("", "both"),
      HeidiState.read(ctx.sessionID).catch(() => null)
    ])

    const fsmState = state?.fsm_state ?? "IDLE"
    const mode = state?.mode ?? "PLANNING"
    
    // Generate phase status based on actual FSM state
    const phaseMap: Record<string, { name: string; status: string }> = {
      IDLE: { name: "Runtime Initialization", status: "READY" },
      DISCOVERY: { name: "Codebase Discovery & Analysis", status: "ACTIVE" },
      PLAN_DRAFT: { name: "Implementation Planning", status: "ACTIVE" },
      PLAN_LOCKED: { name: "Plan Review & Lock", status: "PENDING" },
      EXECUTION: { name: "Code Implementation", status: "ACTIVE" },
      VERIFICATION: { name: "Quality Assurance", status: "ACTIVE" },
      COMPLETE: { name: "Task Completion", status: "DONE" },
      BLOCKED: { name: "Blocked - Awaiting Resolution", status: "BLOCKED" },
    }
    
    const currentPhase = phaseMap[fsmState] ?? { name: "Unknown", status: fsmState }
    
    return {
      title: "Heidi System Transparency Report",
      output: [
        `Current FSM State: ${fsmState}`,
        `Current Mode: ${mode}`,
        "",
        `Active Phase: ${currentPhase.name} [${currentPhase.status}]`,
        "",
        params.scope !== "transaction" ? `Long-term Memory: ${memory.length} items stored.` : "",
        state?.resume?.checkpoint_id ? `Active Checkpoint: ${state.resume.checkpoint_id}` : "No active checkpoint.",
        state?.block_reason ? `Block Reason: ${state.block_reason}` : "",
      ].filter(Boolean).join("\n"),
      metadata: {
        memory_count: memory.length,
        fsm_state: fsmState,
        mode: mode,
        scope: params.scope,
        has_checkpoint: !!state?.resume?.checkpoint_id,
        has_block: !!state?.block_reason,
        checkpoint_id: state?.resume?.checkpoint_id ?? null,
        block_reason: state?.block_reason ?? null,
      }
    }
  }
})
