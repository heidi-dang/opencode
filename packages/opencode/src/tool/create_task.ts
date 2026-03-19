import z from "zod"
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import path from "path"

const DESCRIPTION = `Create and Run Task - Execute predefined VSCode tasks.

Creates and runs VSCode tasks defined in .vscode/tasks.json.
Use for recurring build/test/lint commands.`

export const CreateAndRunTaskTool = Tool.define("create_and_run_task", {
  description: DESCRIPTION,
  parameters: z.object({
    task_name: z.string().describe("Name of the task to create or run"),
    command: z.string().describe("Command to execute"),
    cwd: z.string().describe("Working directory for the task").optional(),
    env: z.record(z.string(), z.string()).describe("Environment variables").optional(),
    presentation: z.object({
      reveal: z.enum(["always", "never", "silent"]).optional(),
      focus: z.boolean().optional(),
      panel: z.enum(["shared", "dedicated", "new"]).optional(),
    }).optional(),
    is_background: z.boolean().describe("Run as background task").optional(),
    problem_matchers: z.array(z.string()).describe("Problem matchers to use").optional(),
  }),
  async execute(params, ctx) {
    const task = {
      label: params.task_name,
      type: "shell",
      command: params.command,
      cwd: params.cwd || "${workspaceFolder}",
      env: params.env,
      presentation: params.presentation || {
        reveal: "always",
        focus: false,
        panel: "shared",
      },
      isBackground: params.is_background || false,
      problemMatcher: params.problem_matchers || [],
    }

    // Ensure .vscode directory exists
    const vscodeDir = path.join(Instance.directory, ".vscode")
    await Bun.write(path.join(vscodeDir, "tasks.json"), JSON.stringify({ version: "2.0.0", tasks: [task] }, null, 2))

    // Run the task using VSCode CLI or direct execution
    await ctx.ask({
      permission: "bash",
      patterns: [params.command],
      always: [params.command],
      metadata: {},
    })

    const result = Bun.spawn({
      cmd: params.command.split(" "),
      cwd: params.cwd || Instance.directory,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...params.env },
    })

    const output = await new Response(result.stdout).text()
    const error = await new Response(result.stderr).text()
    const combined = output + (error ? "\n" + error : "")

    return {
      title: `Task: ${params.task_name}`,
      metadata: {
        command: params.command,
        cwd: params.cwd || Instance.directory,
        exitCode: result.exitCode,
        isBackground: params.is_background,
      },
      output: combined || `Task "${params.task_name}" completed with exit code ${result.exitCode}`,
    }
  },
})

// List available tasks
export const ListTasksTool = Tool.define("list_tasks", {
  description: "List available VSCode tasks from .vscode/tasks.json",
  parameters: z.object({}),
  async execute(_params, ctx) {
    const tasksPath = path.join(Instance.directory, ".vscode", "tasks.json")
    
    let tasks: any[] = []
    try {
      if (await Bun.file(tasksPath).exists()) {
        const content = await Bun.file(tasksPath).text()
        const parsed = JSON.parse(content)
        tasks = parsed.tasks || []
      }
    } catch {}

    return {
      title: `${tasks.length} Task(s)`,
      metadata: { tasks: tasks.map(t => ({ name: t.label, type: t.type })) },
      output: tasks.map(t => `[${t.type || "shell"}] ${t.label}`).join("\n") || "No tasks defined",
    }
  },
})
