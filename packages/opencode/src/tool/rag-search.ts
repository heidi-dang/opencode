import z from "zod"
import { Tool } from "./tool"
import { CodebaseRAG } from "../agent/intelligence/rag"
import { Instance } from "../project/instance"

export const RagSearchTool = Tool.define("rag_search", {
  description: "Search the codebase using a structural, symbol-aware RAG index. Returns code chunks like functions, classes, and methods. Use this for deep exploration when standard search is insufficient.",
  parameters: z.object({
    query: z.string().describe("The search query (e.g., a function name, class name, or concept)"),
    limit: z.number().optional().default(5).describe("Maximum number of results to return"),
  }),
  async execute(params, ctx) {
    const root = Instance.directory
    const results = await CodebaseRAG.search(root, params.query, params.limit)

    if (results.length === 0) {
      return {
        output: "No relevant code chunks found in the RAG index.",
        title: `RAG search: ${params.query}`,
        metadata: { count: 0 },
      }
    }

    const output = results.map(r => 
      `### ${r.name} (${r.type})\nFile: ${r.filePath}\nLines: ${r.startLine}-${r.endLine}\n\n\`\`\`typescript\n${r.content}\n\`\`\``
    ).join("\n\n---\n\n")

    return {
      output,
      title: `RAG search results for "${params.query}"`,
      metadata: { count: results.length },
    }
  },
})
