import z from "zod"
import { Tool } from "./tool"
import path from "path"

const DESCRIPTION = `Scaffolds a new agent or tool based on project-standard blueprints. Use this to quickly expand Heidi's capabilities with consistent templates.`

export const BlueprintTool = Tool.define("blueprint", {
  description: DESCRIPTION,
  parameters: z.object({
    type: z.enum(["agent", "tool"]).describe("The type of asset to scaffold."),
    name: z.string().describe("The name of the new asset (snake_case)."),
    description: z.string().describe("Brief description of what the new asset does.")
  }),
  async execute(params, ctx) {
    const dir = params.type === "agent" ? "packages/opencode/src/agent" : "packages/opencode/src/tool"
    const ext = "ts"
    const file = path.join(process.cwd(), dir, `${params.name}.${ext}`)

    const content = params.type === "tool" 
      ? `import z from "zod"\nimport { Tool } from "./tool"\n\nconst DESCRIPTION = \`${params.description}\`\n\nexport const ${params.name.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}Tool = Tool.define("${params.name}", {\n  description: DESCRIPTION,\n  parameters: z.object({}),\n  async execute(params, ctx) {\n    return {\n      title: "${params.name.replace('_', ' ')}",\n      output: "Implementation pending.",\n      metadata: { status: "scaffolded" }\n    }\n  }\n})\n`
      : `// Agent ${params.name} scaffolded. Description: ${params.description}\n// Configuration should be added to packages/opencode/src/agent/agent.ts\n`

    await Bun.write(file, content)

    return {
      title: "Blueprint Scaffolding Done",
      output: `Successfully scaffolded ${params.type}: **${params.name}** at ${file}`,
      metadata: { path: file, type: params.type }
    }
  }
})
