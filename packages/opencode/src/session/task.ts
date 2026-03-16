import { z } from "zod";
import { generateObject, type ModelMessage } from "ai";
import { Log } from "@/util/log";
import { Provider } from "@/provider/provider";
import { ProviderID, ModelID } from "@/provider/schema";
import { SystemPrompt } from "./system";

export const TaskObjectSchema = z.object({
  goal: z.string().describe("The high-level objective of the task."),
  constraints: z.array(z.string()).describe("Rules and constraints the agent must follow."),
  success_criteria: z.array(z.string()).describe("Specific, measurable conditions that define completion."),
  required_evidence: z.array(z.string()).describe("Required proof artifacts (e.g. log outputs, screenshots, files)."),
  preferred_output: z.string().optional().describe("Description of how the final result should be presented."),
  blocker_policy: z.string().optional().describe("Guidance on when to stop and ask the user."),
});

export type TaskObject = z.infer<typeof TaskObjectSchema>;

const log = Log.create({ service: "task.compiler" });

export namespace TaskCompiler {
  export async function compile(request: string, customModel?: { providerID: ProviderID; modelID: ModelID }): Promise<TaskObject> {
    log.info("compiling task", { request: request.slice(0, 100) });
 
    const targetModel = customModel ?? await Provider.defaultModel();
    const model = await Provider.getModel(targetModel.providerID, targetModel.modelID);
    const language = await Provider.getLanguage(model);

    const system = [
      `You are a Task Compiler. Your job is to transform a raw user request into a structured Task Object.
      Be precise, outcome-driven, and identify specific success criteria.
      If the user is vague, normalize the request into its most likely intended execution form.
      Output MUST strictly conform to the provided schema. Do not try to call tools or perform actions.
      `
    ];

    const result = await generateObject({
      model: language,
      schema: TaskObjectSchema,
      messages: [
        ...system.map((s): ModelMessage => ({ role: "system", content: s })),
        { role: "user", content: request }
      ],
      temperature: 0.1,
    });

    return result.object;
  }
}
