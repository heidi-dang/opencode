import z from "zod"
import { Tool } from "./tool"
import { HeidiBoundary } from "@/heidi/boundary"
import { HeidiState } from "@/heidi/state"

export const TaskBoundaryTool = Tool.define("task_boundary", {
  description:
    "Use this tool to update Heidi runtime task state. It is the only legal way to change mode/state, lock or reopen plan, request verification, block, or complete.",
  parameters: z.object({
    action: z.enum([
      "start",
      "set_mode",
      "mark_item",
      "lock_plan",
      "reopen_plan",
      "begin_execution",
      "request_verification",
      "block",
      "complete",
    ]),
    objective: z.string().trim().optional(),
    mode: z.enum(["PLANNING", "EXECUTION", "VERIFICATION"]).optional(),
    id: z.string().optional(),
    status: z.enum(["todo", "doing", "done", "blocked"]).optional(),
    reason: z.string().trim().optional(),
    payload: z.any().optional(), // backward compatibility if needed
    run_id: z.string().optional(),
    task_id: z.string().regex(/^ses.*/).optional(),
  }),
  async execute(params, ctx) {
    const objective = params.action === "start" ? params.objective ?? "" : ""
    const state = await HeidiState.ensure(ctx.sessionID, objective)
    const payload = params.payload ?? {
      objective: params.objective,
      mode: params.mode,
      id: params.id,
      status: params.status,
      reason: params.reason,
    }
    const result = await HeidiBoundary.apply({
      action: params.action as any,
      payload,
      run_id: params.run_id ?? state.run_id,
      task_id: ctx.sessionID,
    })
    return {
      title: `${result.fsm_state} ${result.mode}`,
      metadata: result,
      output: JSON.stringify(result, null, 2),
    }
  },
})
