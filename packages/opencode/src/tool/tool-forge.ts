import { Tool } from "./tool"
import { ToolRegistry } from "./registry"
import { Instance } from "../project/instance"
import { Log } from "@/util/log"
import { PermissionNext } from "../permission/next"
import { Config } from "../config/config"
import z from "zod"
import * as fs from "fs/promises"
import path from "path"

export namespace ToolForge {
  const log = Log.create({ service: "tool.forge" })

  export interface ToolTemplate {
    name: string
    description: string
    category: "utility" | "analysis" | "automation" | "integration" | "custom"
    parameters: Record<string, any>
    code: string
    permissions: string[]
  }

  export interface ForgedTool {
    id: string
    template: ToolTemplate
    created: number
    usage: number
    lastUsed: number
    validated: boolean
  }

  const forgeStorage = Instance.state(() => ({
    tools: {} as Record<string, ForgedTool>,
    templates: {} as Record<string, ToolTemplate>,
    usage: {} as Record<string, number>,
  }))

  /**
   * Analyze a task requirement and suggest tool creation
   */
  export async function analyzeTaskRequirement(task: string): Promise<ToolTemplate | null> {
    const config = await Config.get()
    const analysis = await (config as any).client.generateObject({
      model: "opencode/gpt-4o-mini",
      prompt: `Analyze this task and determine if a custom tool is needed:

Task: "${task}"

Respond with JSON:
{
  "needsTool": boolean,
  "suggestedTool": {
    "name": "tool-name",
    "description": "What this tool does",
    "category": "utility|analysis|automation|integration|custom",
    "parameters": {"param1": "type", "param2": "type"},
    "code": "// Basic implementation sketch"
  } | null,
  "reasoning": "Why this tool is needed"
}`,
      schema: z.object({
        needsTool: z.boolean(),
        suggestedTool: z.object({
          name: z.string(),
          description: z.string(),
          category: z.enum(["utility", "analysis", "automation", "integration", "custom"]),
          parameters: z.record(z.string(), z.any()),
          code: z.string()
        }).optional(),
        reasoning: z.string()
      })
    })

    if (!analysis.needsTool) return null
    return (analysis as any).suggestedTool || null
  }

  /**
   * Generate and validate a new tool
   */
  export async function forgeTool(template: ToolTemplate): Promise<ForgedTool> {
    const toolId = `custom-${template.name.toLowerCase().replace(/\s+/g, '-')}`
    
    // Generate complete tool implementation
    const implementation = await generateToolImplementation(template)
    
    // Validate the generated code
    const validation = await validateToolImplementation(implementation)
    
    const forgedTool: ForgedTool = {
      id: toolId,
      template,
      created: Date.now(),
      usage: 0,
      lastUsed: 0,
      validated: validation.isValid
    }

    // Store the forged tool
    const state = await forgeStorage()
    state.tools[toolId] = forgedTool

    log.info("Forged new tool", { toolId, name: template.name, validated: validation.isValid })
    
    return forgedTool
  }

  /**
   * Generate complete tool implementation from template
   */
  async function generateToolImplementation(template: ToolTemplate): Promise<string> {
    const config = await Config.get()
    const prompt = `
Create a complete TypeScript tool implementation for OpenCode based on this template:

Tool Name: ${template.name}
Description: ${template.description}
Category: ${template.category}
Parameters: ${JSON.stringify(template.parameters, null, 2)}

Requirements:
1. Use OpenCode tool patterns (see existing tools in src/tool/)
2. Include proper TypeScript types
3. Handle errors gracefully
4. Include input validation
5. Use async/await appropriately
6. Follow the exact structure of existing tools
7. Include proper JSDoc comments
8. Handle edge cases and provide meaningful error messages

Generate the complete tool code that would work in the OpenCode ecosystem:

${template.code}

Complete the implementation with proper error handling, validation, and OpenCode patterns.`
    
    const result = await (config as any).client.generateText({
      model: "opencode/gpt-4o",
      prompt,
      temperature: 0.3
    })

    return result
  }

  /**
   * Validate generated tool implementation
   */
  async function validateToolImplementation(code: string): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Basic syntax validation
    try {
      new Function(code)
    } catch (err) {
      errors.push(`Syntax error: ${err}`)
    }

    // Security validation
    const dangerousPatterns = [
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /require\s*\(/gi,
      /import\s*.*fs/gi,
      /exec\s*\(/gi,
      /child_process/gi
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(`Potentially dangerous code pattern detected`)
      }
    }

    // OpenCode pattern validation
    const requiredPatterns = [
      /Tool\.define/,
      /export\s+const\s+\w+Tool/,
      /parameters:\s*z\.object/,
      /execute:\s*async/
    ]

    for (const pattern of requiredPatterns) {
      if (!pattern.test(code)) {
        errors.push(`Missing required OpenCode tool pattern`)
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Register a forged tool in the tool registry
   */
  export async function registerForgedTool(forgedTool: ForgedTool): Promise<void> {
    try {
      // Create temporary file for the tool
      const tempDir = path.join(Instance.directory, ".opencode", "tool-temp")
      await fs.mkdir(tempDir, { recursive: true })
      await fs.writeFile(path.join(tempDir, `${forgedTool.id}.ts`), forgedTool.template.code)

      // Import and register the tool
      const toolModule = await import(path.join(tempDir, `${forgedTool.id}.ts`))
      
      // Find the tool export
      for (const [name, toolDef] of Object.entries(toolModule)) {
        if (name.includes("Tool") && typeof toolDef === "object" && (toolDef as any).id) {
          const toolInfo: Tool.Info = {
            id: forgedTool.id,
            init: async (ctx) => ({
              parameters: z.object((toolDef as any).parameters || {}),
              description: forgedTool.template.description,
              execute: async (args, ctx) => {
                // Track usage
                await trackToolUsage(forgedTool.id)
                
                // Execute the tool
                try {
                  const result = await (toolDef as any).execute(args, ctx)
                  return {
                    title: "",
                    output: typeof result === "string" ? result : JSON.stringify(result),
                    metadata: { forgedTool: true, toolName: forgedTool.template.name }
                  }
                } catch (error) {
                  log.error("Forged tool execution failed", { toolId: forgedTool.id, error })
                  throw error
                }
              },
              formatValidationError: (error) => `Validation error: ${error.message}`
            })
          }
          
          await ToolRegistry.register(toolInfo)
          log.info("Registered forged tool", { toolId: forgedTool.id })
          break
        }
      }
    } catch (error) {
      log.error("Failed to register forged tool", { toolId: forgedTool.id, error })
      throw error
    }
  }

  /**
   * Track tool usage for analytics and improvement
   */
  async function trackToolUsage(toolId: string): Promise<void> {
    const state = await forgeStorage()
    state.usage[toolId] = (state.usage[toolId] || 0) + 1
    
    // Update last used timestamp
    if (state.tools[toolId]) {
      state.tools[toolId].lastUsed = Date.now()
      state.tools[toolId].usage++
    }
  }

  /**
   * Get all forged tools
   */
  export async function getForgedTools(): Promise<ForgedTool[]> {
    const state = await forgeStorage()
    return Object.values(state.tools)
  }

  /**
   * Get tool usage analytics
   */
  export async function getToolAnalytics(): Promise<Record<string, { usage: number; lastUsed: number; efficiency: number }>> {
    const state = await forgeStorage()
    const analytics: Record<string, { usage: number; lastUsed: number; efficiency: number }> = {}
    
    for (const [toolId, usage] of Object.entries(state.usage)) {
      const tool = state.tools[toolId]
      const efficiency = tool ? calculateEfficiency(tool, usage) : 0
      
      analytics[toolId] = {
        usage,
        lastUsed: tool?.lastUsed || 0,
        efficiency
      }
    }
    
    return analytics
  }

  /**
   * Calculate tool efficiency score
   */
  function calculateEfficiency(tool: ForgedTool, usage: number): number {
    if (!tool.validated) return 0
    if (usage === 0) return 0
    
    const daysSinceCreation = (Date.now() - tool.created) / (1000 * 60 * 60 * 24)
    const usagePerDay = usage / Math.max(daysSinceCreation, 1)
    
    // Efficiency score: 0-100 based on validation, usage frequency, and recency
    return Math.min(100, (tool.validated ? 50 : 0) + Math.min(30, usagePerDay * 10) + Math.min(20, daysSinceCreation < 7 ? 20 : 0))
  }

  /**
   * Cleanup old/unused forged tools
   */
  export async function cleanupUnusedTools(maxAge: number = 30): Promise<void> {
    const state = await forgeStorage()
    const now = Date.now()
    const toolsToRemove: string[] = []
    
    for (const [toolId, tool] of Object.entries(state.tools)) {
      const ageInDays = (now - tool.created) / (1000 * 60 * 60 * 24)
      const daysSinceLastUse = (now - tool.lastUsed) / (1000 * 60 * 60 * 24)
      
      // Remove tools older than maxAge days with no usage in the last 7 days
      if (ageInDays > maxAge && daysSinceLastUse > 7 && tool.usage < 3) {
        toolsToRemove.push(toolId)
      }
    }
    
    for (const toolId of toolsToRemove) {
      delete state.tools[toolId]
      delete state.usage[toolId]
      log.info("Cleaned up unused forged tool", { toolId })
    }
  }

  /**
   * Heidi's self-evolving tooling interface
   */
  export const HeidiToolForge = {
    analyzeTaskRequirement,
    forgeTool,
    registerForgedTool,
    getForgedTools,
    getToolAnalytics,
    cleanupUnusedTools
  }
}
