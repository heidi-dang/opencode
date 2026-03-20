import z from "zod"
import { Tool } from "./tool"
import { Filesystem } from "@/util/filesystem"
import { HeidiContext } from "@/heidi/context"
import { HeidiTelemetry } from "@/heidi/telemetry"

export const KnowledgeSubagentTool = Tool.define("knowledge_subagent", {
  description:
    "Background task knowledge distiller. Appends approved, project-scoped knowledge items for retrieval support.",
  parameters: z.object({
    task_id: z.string(),
    item: z.object({
      kind: z.string(),
      summary: z.string(),
      source: z.string(),
    }),
  }),
  async execute(params) {
    const row = {
      timestamp: new Date().toISOString(),
      ...params.item,
    }
    const target = HeidiContext.knowledgePath(params.task_id as any)
    const old = await Filesystem.readText(target).catch((err) => {
      HeidiTelemetry.warn(params.task_id as any, "knowledge_subagent.read", err)
      return ""
    })
    await Filesystem.write(target, old + JSON.stringify(row) + "\n")
    return {
      title: "knowledge updated",
      metadata: row,
      output: JSON.stringify(row, null, 2),
    }
  },
})
