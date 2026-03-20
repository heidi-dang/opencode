import z from "zod"
import { Tool } from "./tool"
import { HeidiBoundary } from "@/heidi/boundary"
import { HeidiState } from "@/heidi/state"

export const TaskBoundaryTool = Tool.define("task_boundary", {
  description:
    "Use this tool to update Heidi runtime task state. It is the only legal way to change mode/state, lock or reopen plan, request verification, block, or complete.",
  parameters: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("start"),
      payload: z.object({ objective: z.string().trim().min(1) }),
      run_id: z.string().optional(),
      task_id: z
        .string()
        .regex(/^ses.*/)
        .optional(),
    }),
    z.object({
      action: z.literal("set_mode"),
      payload: z.object({ mode: z.enum(["PLANNING", "EXECUTION", "VERIFICATION"]) }),
      run_id: z.string().optional(),
      task_id: z
        .string()
        .regex(/^ses.*/)
        .optional(),
    }),
    z.object({
      action: z.literal("mark_item"),
      payload: z.object({ id: z.string().min(1), status: z.enum(["todo", "doing", "done", "blocked"]) }),
      run_id: z.string().optional(),
      task_id: z
        .string()
        .regex(/^ses.*/)
        .optional(),
    }),
    z.object({
      action: z.literal("lock_plan"),
      payload: z.object({}).default({}),
      run_id: z.string().optional(),
      task_id: z
        .string()
        .regex(/^ses.*/)
        .optional(),
    }),
    z.object({
      action: z.literal("reopen_plan"),
      payload: z.object({ reason: z.string().trim().min(1) }),
      run_id: z.string().optional(),
      task_id: z
        .string()
        .regex(/^ses.*/)
        .optional(),
    }),
    z.object({
      action: z.literal("begin_execution"),
      payload: z.object({}).default({}),
      run_id: z.string().optional(),
      task_id: z
        .string()
        .regex(/^ses.*/)
        .optional(),
    }),
    z.object({
      action: z.literal("request_verification"),
      payload: z.object({}).default({}),
      run_id: z.string().optional(),
      task_id: z
        .string()
        .regex(/^ses.*/)
        .optional(),
    }),
    z.object({
      action: z.literal("block"),
      payload: z.object({ reason: z.string().trim().min(1) }),
      run_id: z.string().optional(),
      task_id: z
        .string()
        .regex(/^ses.*/)
        .optional(),
    }),
    z.object({
      action: z.literal("complete"),
      payload: z.object({}).default({}),
      run_id: z.string().optional(),
      task_id: z
        .string()
        .regex(/^ses.*/)
        .optional(),
    }),
  ]),
  async execute(params, ctx) {
    const objective = params.action === "start" ? params.payload.objective : ""
    const state = await HeidiState.ensure(ctx.sessionID, objective)
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
