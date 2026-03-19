import z from "zod"
import { Tool } from "./tool"
import { HeidiBoundary } from "@/heidi/boundary"

export const TaskBoundaryTool = Tool.define("task_boundary", {
  description:
    "Use this tool to update Heidi runtime task state. It is the only legal way to change mode/state, lock or reopen plan, request verification, block, or complete.",
  parameters: HeidiBoundary.Input,
  async execute(params) {
    const result = await HeidiBoundary.apply(params)
    return {
      title: `${result.fsm_state} ${result.mode}`,
      metadata: result,
      output: JSON.stringify(result, null, 2),
    }
  },
})
