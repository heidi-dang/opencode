import z from "zod"
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import path from "path"

const DESCRIPTION = `Problems Tool - Read compiler/linter diagnostics and errors from the workspace.`

export const ProblemsTool = Tool.define("problems", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().describe("File path to check for problems").optional(),
    severity: z.enum(["error", "warning", "info"]).describe("Filter by severity").optional(),
    source: z.string().describe("Problem source (typescript, eslint)").optional(),
    max_results: z.number().describe("Maximum number of problems").optional(),
  }),
  async execute(params, ctx) {
    const problems: { file: string; line: number; severity: string; message: string }[] = []

    if (!params.source || params.source === "typescript") {
      const tscPath = await findTsc()
      if (tscPath) {
        const args = ["--noEmit", "--pretty", "false"]
        if (params.path) args.push(path.resolve(Instance.directory, params.path))
        const result = Bun.spawn({ cmd: [tscPath, ...args], cwd: Instance.directory, stdout: "pipe", stderr: "pipe" })
        const output = await new Response(result.stdout).text()
        const regex = /^(.+?)\((\d+)(?:,(\d+))?\:\s+(error|warning|info)\s+(?:TS\d+:)?\s*(.+)$/gm
        let match
        while ((match = regex.exec(output)) !== null) {
          problems.push({ file: match[1], line: parseInt(match[2]), severity: match[4], message: match[6] })
        }
      }
    }

    if (!params.source || params.source === "eslint") {
      const eslintBin = await findEslint()
      if (eslintBin) {
        const args = ["--format", "json"]
        if (params.path) args.push(path.resolve(Instance.directory, params.path))
        const result = Bun.spawn({ cmd: [eslintBin, ...args], cwd: Instance.directory, stdout: "pipe", stderr: "pipe" })
        const output = await new Response(result.stdout).text()
        try {
          const eslintOutput = JSON.parse(output)
          for (const file of eslintOutput) {
            for (const msg of file.messages) {
              problems.push({ file: file.filePath, line: msg.line, severity: msg.severity === 2 ? "error" : "warning", message: msg.message })
            }
          }
        } catch {}
      }
    }

    let filtered = params.severity ? problems.filter(p => p.severity === params.severity) : problems
    if (params.max_results) filtered = filtered.slice(0, params.max_results)

    const output = filtered.length > 0
      ? filtered.map(p => `[${p.severity.toUpperCase()}] ${p.file}:${p.line} - ${p.message}`).join("\n")
      : "No problems found"

    return {
      title: `${filtered.length} problem(s)`,
      metadata: { count: filtered.length },
      output,
    }
  },
})

async function findTsc(): Promise<string | null> {
  const locations = ["./node_modules/.bin/tsc", Instance.directory + "/node_modules/.bin/tsc", Bun.which("tsc")]
  for (const loc of locations) {
    if (loc && await Bun.file(loc).exists()) return loc
  }
  return null
}

async function findEslint(): Promise<string | null> {
  const locations = ["./node_modules/.bin/eslint", Instance.directory + "/node_modules/.bin/eslint", Bun.which("eslint")]
  for (const loc of locations) {
    if (loc && await Bun.file(loc).exists()) return loc
  }
  return null
}
