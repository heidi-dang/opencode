import z from "zod"
import { Tool } from "./tool"
import { HeidiIndexer } from "@/heidi/indexer"

const DESCRIPTION = `Search the repository index for files and symbols. Use this tool FIRST before using grep or read to find where features are implemented. It queries a fast SQLite index of the repository.

Always prioritize this over full scans.`

export const IndexSearchTool = Tool.define("index_search", {
  description: DESCRIPTION,
  parameters: z.object({
    query: z.string().describe("The filename or symbol name to search for"),
    limit: z.number().optional().default(20).describe("Maximum number of results to return"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "read",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        query: params.query,
      }
    })

    // Ensure the index is initialized
    await HeidiIndexer.indexRepository()

    const results = await HeidiIndexer.searchFiles(params.query, params.limit)

    if (results.length === 0) {
      return {
        title: `Index search: ${params.query}`,
        output: "No results found in the index. You may need to use grep_search as a fallback.",
        metadata: {}
      }
    }

    return {
      title: `Index search: ${params.query}`,
      output: `Found ${results.length} files matching "${params.query}":\n\n${results.join("\n")}`,
      metadata: { results }
    }
  }
})
