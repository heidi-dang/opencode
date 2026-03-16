import { z } from "zod";
import { Log } from "@/util/log";
import { ProviderID, ModelID } from "@/provider/schema";

export const TaskObjectSchema = z.object({
  goal: z.string().describe("The primary objective of the task"),
  constraints: z.string().array().describe("Non-negotiable limits or requirements"),
  success_criteria: z.string().array().describe("Measurable outcomes that define success"),
  required_evidence: z.string().array().describe("The specific proof needed to confirm the task is complete"),
  allowed_tools: z.string().array().describe("The specific set of tools allowed for this task"),
  blocker_rules: z.string().array().describe("Specific conditions that should trigger a hard stop or user clarification"),
  preferred_output_format: z.string().describe("The desired structure or format for the final result"),
});

export type TaskObject = z.infer<typeof TaskObjectSchema>;

const log = Log.create({ service: "task.compiler" });

function fallback(request: string): TaskObject {
  const goal = request.trim() || "Complete the user request"
  return {
    goal,
    constraints: ["Do not make destructive changes without explicit user confirmation"],
    success_criteria: ["Return a concrete result that directly addresses the request"],
    required_evidence: ["Include commands, file references, or outputs that verify the result"],
    allowed_tools: ["Use available workspace tools as needed"],
    blocker_rules: ["If required info is missing, ask one clear clarifying question"],
    preferred_output_format: "concise actionable summary",
  }
}

export namespace TaskCompiler {
  export async function compile(request: string, customModel?: { providerID: ProviderID; modelID: ModelID }): Promise<TaskObject> {
    const model = customModel ? `${customModel.providerID}/${customModel.modelID}` : "default"
    log.info("compile task", { model, request: request.slice(0, 100) })
    return fallback(request)
  }
}
