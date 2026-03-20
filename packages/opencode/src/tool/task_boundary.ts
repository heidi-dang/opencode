import z from "zod"
import { Tool } from "./tool"
import { HeidiBoundary } from "@/heidi/boundary"
import { HeidiState } from "@/heidi/state"

export const TaskBoundaryTool = Tool.define("task_boundary", {
  description:
    "Use this tool to update Heidi runtime task state. It is the only legal way to change mode/state, lock or reopen plan, request verification, block, or complete.",
  parameters: HeidiBoundary.Input.omit({ run_id: true, task_id: true }).extend({
    run_id: z.string().optional(),
    task_id: z
      .string()
      .regex(/^ses.*/)
      .optional(),
  }),
  async execute(params, ctx) {
    const state = await HeidiState.ensure(ctx.sessionID, String(params.payload?.objective ?? ""))
    const result = await HeidiBoundary.apply({
      ...params,
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
