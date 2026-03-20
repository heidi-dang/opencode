import z from "zod"
import { Tool } from "./tool"
import { HeidiMemory } from "@/heidi/memory"
import { HeidiState } from "@/heidi/state"
import { HeidiContext } from "@/heidi/context"
import { ServerStats } from "@/server/stats"

const DESCRIPTION = `Provides a transparent view of Heidi's internal state, including current memory context, active transaction status, and recent decision history.`

export const TransparencyTool = Tool.define("transparency", {
  description: DESCRIPTION,
  parameters: z.object({
    scope: z.enum(["memory", "transaction", "context", "all"]).default("all"),
  }),
  async execute(params, ctx) {
    const [memory, state, session] = await Promise.all([
      HeidiMemory.query("", "both"),
      HeidiState.read(ctx.sessionID).catch(() => null),
      HeidiContext.current(ctx.sessionID).catch(() => null),
    ])
    const stats = ServerStats.snapshot()
    const fsm = state?.fsm_state ?? "IDLE"
    const mode = state?.mode ?? "PLANNING"
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
    const phase = phaseMap[fsm] ?? { name: "Unknown", status: fsm }
    const mem = params.scope === "context" ? [] : memory
    const ctxLines =
      params.scope === "memory"
        ? []
        : [
            session ? `Session Context: ${session.fsm_state} (${session.mode})` : "",
            session?.summary.body ? `Context Summary: ${session.summary.body}` : "",
            session?.resume.next_step ? `Context Next Step: ${session.resume.next_step}` : "",
            session?.memory.retrieval.length
              ? `Retrieved Knowledge: ${session.memory.retrieval.map((item) => item.summary).join(" | ")}`
              : "",
            `Server SSE: ${stats.sse.total} active (local=${stats.sse.event}, global=${stats.sse.global}, workspace=${stats.sse.workspace})`,
            `PTY: ${stats.pty.sessions} sessions, ${stats.pty.subscribers} subscribers, ${stats.pty.bytes} buffered bytes`,
          ]
    return {
      title: "Heidi System Transparency Report",
      output: [
        `Current FSM State: ${fsm}`,
        `Current Mode: ${mode}`,
        "",
        `Active Phase: ${phase.name} [${phase.status}]`,
        "",
        params.scope !== "transaction" && params.scope !== "context"
          ? `Long-term Memory: ${mem.length} items stored.`
          : "",
        params.scope !== "transaction" && params.scope !== "context" && mem.length > 0 ? "Memory Items:" : "",
        params.scope !== "transaction" && params.scope !== "context" && mem.length > 0
          ? mem
              .slice(0, 5)
              .map(
                (item) =>
                  `  - [${item.scope}] [${item.type}] [${item.trust ?? "unknown"}] ${item.key}: ${item.content}`,
              )
              .join("\n")
          : "",
        ...ctxLines,
        state?.resume?.checkpoint_id ? `Active Checkpoint: ${state.resume.checkpoint_id}` : "No active checkpoint.",
        state?.block_reason ? `Block Reason: ${state.block_reason}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        memory_count: mem.length,
        fsm_state: fsm,
        mode,
        scope: params.scope,
        has_checkpoint: !!state?.resume?.checkpoint_id,
        has_block: !!state?.block_reason,
        checkpoint_id: state?.resume?.checkpoint_id ?? null,
        block_reason: state?.block_reason ?? null,
        session_context: session,
        server_stats: stats,
      },
    }
  },
})
