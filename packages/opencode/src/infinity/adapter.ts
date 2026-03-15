import { generateObject, type ModelMessage } from "ai"
import { z } from "zod"
import { Provider } from "../provider/provider"
import type { Task, RunState, GateResult, Plan, WorkerAssignment } from "./runtime"
import { Config } from "../config/config"
import { Identifier } from "@/id/id"
import { Log } from "../util/log"

const log = Log.create({ service: "infinity-adapter" })

export interface TaskDiscovery {
  title: string
  source: "internal_audit" | "external_triage" | "tech_radar" | "cost_profile" | "post_mortem"
  priority: number
  category: "stability" | "performance" | "feature" | "cost" | "security"
  scope: string[]
  acceptance: string[]
  constraints?: string[]
  verify_command?: string
}

export interface InspectResult {
  defect_summary: string
  root_cause: string
  fix_plan: string
  allowed_files: string[]
  verification_commands: string[]
  confidence: number
}

export interface PatchResult {
  content: string
  rationale: string
}

export interface JudgeResult {
  pass: boolean
  retryable: boolean
  instructions?: string
  summary: string
}

export class InfinityAdapter {
  private root: string

  constructor(root: string) {
    this.root = root
  }

  private async getModel(modelStr: string) {
    const { providerID, modelID } = Provider.parseModel(modelStr)
    return await Provider.getModel(providerID, modelID)
  }

  async suggestTasks(repoOverview: string): Promise<TaskDiscovery[]> {
    const model = await this.getModel("xai/grok-4-1-fast")
    const language = await Provider.getLanguage(model)
    try {
      const { object } = await generateObject({
        model: language,
        system: "You are the Infinity Suggester. Analyze the repository state and suggest stability/performance tasks in JSON format.",
        prompt: `Repo Overview:\n${repoOverview}\n\nSuggest 3-5 high-impact tasks to improve project stability, performance, or security as a JSON object.`,
        schema: z.object({
          tasks: z.array(z.object({
            title: z.string(),
            source: z.enum(["internal_audit", "external_triage", "tech_radar", "cost_profile", "post_mortem"]),
            priority: z.number().min(1).max(10),
            category: z.enum(["stability", "performance", "feature", "cost", "security"]),
            scope: z.array(z.string()),
            acceptance: z.array(z.string()),
            constraints: z.array(z.string()).optional(),
            verify_command: z.string().optional(),
          }))
        })
      })
      return object.tasks.map(t => ({
        ...t,
        status: "queued" as const
      }))
    } catch (e) {
      throw e
    }
  }

  async createPlan(task: Task, repoContext: string): Promise<Plan> {
    const model = await this.getModel("xai/grok-4-1-fast")
    const language = await Provider.getLanguage(model)

    const { object } = await generateObject({
      model: language,
      system: "You are the Infinity Planner. Produce a detailed execution plan for the given task in JSON format.",
      prompt: `Task: ${task.title}\nAcceptance: ${task.acceptance.join(", ")}\nContext:\n${repoContext}\n\nReturn the plan as a JSON object.`,
      schema: z.object({
        plan: z.object({
          workers: z.array(z.object({
            worker_id: z.string(),
            scope: z.array(z.string()),
            start_line: z.number().optional(),
            end_line: z.number().optional(),
          }))
        })
      })
    })

    return {
      run_id: Identifier.descending("run"),
      task_id: task.id,
      task,
      workers: object.plan.workers,
      created_at: new Date().toISOString()
    }
  }

  async inspectTarget(task: Task, context: string, failure?: string): Promise<InspectResult> {
    const model = await this.getModel("github-copilot/gpt-5-mini")
    const { object } = await generateObject({
      model: await Provider.getLanguage(model),
      system: "You are the Infinity Inspector. Analyze the target and provide a root cause hypothesis and fix plan in JSON format.",
      prompt: `Task: ${task.title}\nContext:\n${context}\n${failure ? `\nPREVIOUS FAILURE CONTEXT:\n${failure}\n\nPlease analyze why the previous attempt failed and providing a revised fix plan.` : ""}\n\nReturn your analysis as a JSON object.`,
      schema: z.object({
        defect_summary: z.string(),
        root_cause: z.string(),
        fix_plan: z.string(),
        allowed_files: z.array(z.string()),
        verification_commands: z.array(z.string()),
        confidence: z.number().min(0).max(1)
      })
    })
    return object as InspectResult
  }

  async patchTarget(inspectResult: InspectResult, fileContent: string): Promise<PatchResult> {
    const model = await this.getModel("github-copilot/gpt-5-mini")
    const { object } = await generateObject({
      model: await Provider.getLanguage(model),
      system: "You are the Infinity Patcher. Apply the fix plan to the provided file content. RETURN THE ENTIRE FILE CONTENT WITH THE FIX APPLIED AS A JSON OBJECT.",
      prompt: `Inspect Result: ${JSON.stringify(inspectResult)}\nFile Content:\n${fileContent}\n\nOutput the result in JSON.`,
      schema: z.object({
        content: z.string().describe("The entire file content with the fix applied."),
        rationale: z.string()
      })
    })
    return object as PatchResult
  }

  async judgeResult(diff: string, logs: string): Promise<JudgeResult> {
    const model = await this.getModel("github-copilot/gpt-5-mini")
    const { object } = await generateObject({
      model: await Provider.getLanguage(model),
      system: "You are the Infinity Judge. Evaluate the success of the patch based on diff and logs. Return result in JSON format.",
      prompt: `Diff:\n${diff}\nLogs:\n${logs}\n\nProvide your judgment as a JSON object.`,
      schema: z.object({
        pass: z.boolean(),
        retryable: z.boolean(),
        instructions: z.string().optional(),
        summary: z.string()
      })
    })
    return object as JudgeResult
  }

  async reportResults(task: Task, diff: string, logs: string): Promise<GateResult> {
    const model = await this.getModel("github-copilot/gpt-5-mini")
    const language = await Provider.getLanguage(model)

    const { object } = await generateObject({
      model: language,
      system: "You are the Infinity Reporter. Judge the success of a task based on code changes and verification logs in JSON format.",
      prompt: `Task: ${task.title}\nDiff:\n${diff}\nLogs:\n${logs}\n\nReturn the report as a JSON object.`,
      schema: z.object({
        result: z.enum(["pass", "fail", "blocked", "retry_with_actions"]),
        gates: z.array(z.object({
          name: z.enum(["cloud_ci", "security", "visual", "benchmark"]),
          status: z.enum(["pass", "fail", "skipped"]),
          details: z.string()
        })),
        retry_actions: z.array(z.string()).optional()
      })
    })

    return {
      task_id: task.id,
      run_id: Identifier.descending("infinity"),
      result: object.result,
      gates: object.gates,
      retry_actions: object.retry_actions
    }
  }

  async extractLessons(run: RunState, events: string): Promise<string[]> {
    const model = await this.getModel("github-copilot/gpt-5-mini")
    const language = await Provider.getLanguage(model)

    const { object } = await generateObject({
      model: language,
      system: "You are the Infinity Librarian. Extract reusable lessons from this autonomous run in JSON format.",
      prompt: `Run Status: ${run.status}\nEvents:\n${events}\n\nOutput lessons as a JSON object.`,
      schema: z.object({
        lessons: z.array(z.string())
      })
    })

    return object.lessons
  }

  async deriveOpportunities(repoState: string): Promise<any[]> {
    const model = await this.getModel("github-copilot/gpt-5-mini")
    const language = await Provider.getLanguage(model)

    const { object } = await generateObject({
      model: language,
      system: "You are the Infinity Innovator. Derive follow-up ideas or architectural expansion opportunities in JSON format.",
      prompt: `Repository State:\n${repoState}\n\nOutput opportunities as a JSON object.`,
      schema: z.object({
        opportunities: z.array(z.object({
          title: z.string(),
          description: z.string(),
          impact: z.enum(["low", "medium", "high"])
        }))
      })
    })

    return object.opportunities
  }
}
