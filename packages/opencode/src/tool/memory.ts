import z from "zod"
import { Tool } from "./tool"
import { HeidiMemory } from "../heidi/memory"

const DESCRIPTION = `Allows the agent to store and retrieve long-term cognitive memory (facts, patterns, decisions) across sessions and projects.`

export const MemoryTool = Tool.define("memory", {
  description: DESCRIPTION,
  parameters: z.object({
    action: z.enum(["add", "search"]),
    scope: z.enum(["project", "global"]).default("project"),
    type: z.string().describe("The category of memory (e.g. 'decision', 'pattern', 'fact')").optional(),
    key: z.string().describe("A short identifier for the memory").optional(),
    content: z.string().describe("The detailed knowledge to remember or search for").optional(),
  }),
  async execute(params, ctx) {
    if (params.action === "add") {
      if (!params.type || !params.key || !params.content) {
        throw new Error("type, key, and content are required to add a memory")
      }
      await HeidiMemory.add(ctx.sessionID, {
        type: params.type,
        key: params.key,
        content: params.content
      }, params.scope)
      
      return {
        title: "Memory Recorded",
        output: `Successfully saved to ${params.scope} memory: [${params.type}] ${params.key}`,
        metadata: { 
          scope: params.scope, 
          key: params.key,
          action: "add",
          count: 1
        }
      }
    }

    if (params.action === "search") {
      const queryText = params.content || params.key || ""
      const results = await HeidiMemory.query(queryText, params.scope as any)
      
      return {
        title: `Memory Search Results (${results.length})`,
        output: results.length > 0 
          ? results.map(r => `[${r.timestamp}] [${r.scope}] [${r.type}] [${r.trust ?? "unknown"}] ${r.key}: ${r.content}`).join("\n---\n")
          : "No matching memories found.",
        metadata: { 
          count: results.length,
          action: "search",
          scope: params.scope,
          key: queryText
        }
      }
    }
    
    throw new Error("Invalid action")
  }
})
