import { Tool } from "./tool"
import { ToolRegistry } from "./registry"
import { Instance } from "../project/instance"
import { Log } from "@/util/log"
import { PermissionNext } from "../permission/next"
import { Config } from "../config/config"
import { Provider } from "../provider/provider"
import { ProviderID, ModelID } from "../provider/schema"
import { generateObject, generateText, type CoreMessage } from "ai"
import z from "zod"
import * as fs from "fs/promises"
import path from "path"

export namespace ToolForge {
  const log = Log.create({ service: "tool.forge" })

  // Type definitions for AI responses
  interface ToolAnalysis {
    needsTool: boolean
    suggestedTool?: {
      name: string
      description: string
      category: "utility" | "analysis" | "automation" | "integration" | "custom"
      parameters: Record<string, unknown>
      code: string
    }
    reasoning: string
  }

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
    const [pId, mId] = (config.model || "opencode/gpt-4o-mini").split("/")
    const modelInfo = await Provider.getModel(ProviderID.make(pId), ModelID.make(mId))
    const model = await Provider.getLanguage(modelInfo)

    const result = await generateObject({
      model,
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
        suggestedTool: z
          .object({
            name: z.string(),
            description: z.string(),
            category: z.enum(["utility", "analysis", "automation", "integration", "custom"]),
            parameters: z.record(z.string(), z.unknown()),
            code: z.string(),
          })
          .optional(),
        reasoning: z.string(),
      }),
    })

    const analysis: ToolAnalysis = result as unknown as ToolAnalysis
    if (!analysis.needsTool || !analysis.suggestedTool) return null
    return {
      ...analysis.suggestedTool,
      permissions: [],
    }
  }

  /**
   * Generate and validate a new tool
   */
  export async function forgeTool(template: ToolTemplate): Promise<ForgedTool> {
    const toolId = `custom-${template.name.toLowerCase().replace(/\s+/g, "-")}`

    // Generate complete tool implementation
    const implementation = await generateToolImplementation(template)

    // Validate the generated code
    const validation = await validateToolImplementation(implementation)
    if (!validation.isValid) {
      log.error("Tool-Forge validation failed", { toolId, errors: validation.errors })
      throw new Error(`Tool validation failed: ${validation.errors.join(", ")}`)
    }

    const forgedTool: ForgedTool = {
      id: toolId,
      template,
      created: Date.now(),
      usage: 0,
      lastUsed: 0,
      validated: true,
    }

    // Store the forged tool
    const state = await forgeStorage()
    state.tools[toolId] = forgedTool

    log.info("Forged new tool", { toolId, name: template.name, validated: true })

    return forgedTool
  }

  /**
   * Generate complete tool implementation from template
   */
  async function generateToolImplementation(template: ToolTemplate): Promise<string> {
    const config = await Config.get()
    const [pId, mId] = (config.model || "opencode/gpt-4o").split("/")
    const modelInfo = await Provider.getModel(ProviderID.make(pId), ModelID.make(mId))
    const model = await Provider.getLanguage(modelInfo)

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

    const result = await generateText({
      model,
      prompt,
      temperature: 0.3,
    })

    return result.text
  }

  /**
   * Validate generated tool implementation
   * Uses safe syntax analysis without code execution
   */
  async function validateToolImplementation(code: string): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Safe syntax validation using regex-based analysis
    // Check for common syntax issues without executing code
    const syntaxIssues = analyzeSyntax(code)
    if (syntaxIssues.length > 0) {
      errors.push(...syntaxIssues)
    }

    // Security validation - check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /eval\s*\(/gi, name: "eval()" },
      { pattern: /['"`]e['"`]\s*\+\s*['"`]val['"`]/gi, name: "eval string fragment" },
      { pattern: /\beval\s*\(/gi, name: "eval (with word boundary)" },
      { pattern: /Function\s*\(/gi, name: "Function constructor" },
      { pattern: /require\s*\(\s*['"]/gi, name: "require()" },
      { pattern: /import\s*\(\s*['"]/gi, name: "dynamic import()" },
      { pattern: /\bexec\s*\(/gi, name: "exec()" },
      { pattern: /child_process/gi, name: "child_process module" },
      { pattern: /\bspawn\s*\(/gi, name: "spawn()" },
      { pattern: /\bexecFile\s*\(/gi, name: "execFile()" },
      { pattern: /process\.exit/gi, name: "process.exit" },
      { pattern: /process\.env/gi, name: "process.env access" },
      { pattern: /__dirname/gi, name: "__dirname access" },
      { pattern: /__filename/gi, name: "__filename access" },
      { pattern: /global\./gi, name: "global scope access" },
      { pattern: /globalThis\./gi, name: "globalThis access" },
    ]

    for (const { pattern, name } of dangerousPatterns) {
      // Reset lastIndex to ensure global patterns work correctly
      pattern.lastIndex = 0
      if (pattern.test(code)) {
        errors.push(`Security: Dangerous pattern detected: ${name}`)
      }
    }

    // Check for obfuscation attempts
    const obfuscationPatterns = [
      { pattern: /\[(?:['"`]\w+['"`]\s*)+]\s*\[\s*['"`]/gi, name: "array bracket notation obfuscation" },
      { pattern: /String\.fromCharCode/gi, name: "String.fromCharCode obfuscation" },
      { pattern: /atob\s*\(/gi, name: "atob obfuscation" },
      { pattern: /\bthis\s*\[\s*['"/]/gi, name: "bracket notation property access" },
    ]

    for (const { pattern, name } of obfuscationPatterns) {
      pattern.lastIndex = 0
      if (pattern.test(code)) {
        errors.push(`Security: Obfuscation pattern detected: ${name}`)
      }
    }

    // OpenCode pattern validation
    const requiredPatterns = [
      { pattern: /Tool\.define/, name: "Tool.define" },
      { pattern: /export\s+const\s+\w+Tool/, name: "export const ...Tool" },
      { pattern: /parameters:\s*z\.object/, name: "parameters: z.object" },
      { pattern: /execute:\s*async/, name: "execute: async" },
    ]

    for (const { pattern, name } of requiredPatterns) {
      pattern.lastIndex = 0
      if (!pattern.test(code)) {
        errors.push(`Missing required OpenCode pattern: ${name}`)
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Safely analyze TypeScript/JavaScript syntax without execution
   */
  function analyzeSyntax(code: string): string[] {
    const errors: string[] = []

    // Track braces, brackets, and parentheses
    let braceCount = 0
    let bracketCount = 0
    let parenCount = 0
    let inString = false
    let stringChar = ""
    let prevChar = ""

    for (let i = 0; i < code.length; i++) {
      const char = code[i]
      const nextChar = code[i + 1]

      // Handle string detection
      if (!inString) {
        if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
          inString = true
          stringChar = char
        }
      } else if (char === stringChar && prevChar !== "\\") {
        inString = false
        stringChar = ""
      }

      if (inString) {
        prevChar = char
        continue
      }

      // Track bracket matching
      switch (char) {
        case "{":
          braceCount++
          break
        case "}":
          braceCount--
          break
        case "[":
          bracketCount++
          break
        case "]":
          bracketCount--
          break
        case "(":
          parenCount++
          break
        case ")":
          parenCount--
          break
      }

      // Check for obvious syntax errors
      if (braceCount < 0) {
        errors.push(`Syntax: Unexpected closing brace at position ${i}`)
        braceCount = 0
      }
      if (bracketCount < 0) {
        errors.push(`Syntax: Unexpected closing bracket at position ${i}`)
        bracketCount = 0
      }
      if (parenCount < 0) {
        errors.push(`Syntax: Unexpected closing parenthesis at position ${i}`)
        parenCount = 0
      }

      prevChar = char
    }

    // Check for unclosed brackets at end
    if (braceCount > 0) errors.push(`Syntax: ${braceCount} unclosed brace(s)`)
    if (bracketCount > 0) errors.push(`Syntax: ${bracketCount} unclosed bracket(s)`)
    if (parenCount > 0) errors.push(`Syntax: ${parenCount} unclosed parenthesis(s)`)

    // Check for common issues
    if (code.includes(";;;")) errors.push("Syntax: Multiple semicolons detected")
    if (code.includes(",,")) errors.push("Syntax: Multiple commas detected")
    if (/^\s*$/.test(code) || code.trim().length === 0) errors.push("Syntax: Empty code")

    return errors
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
        // Type for dynamically imported tool definition
        interface DynamicToolDef {
          id?: string
          parameters?: Record<string, unknown>
          execute?: (args: unknown, ctx: unknown) => Promise<unknown>
        }

        if (name.includes("Tool") && typeof toolDef === "object" && (toolDef as DynamicToolDef).id) {
          const typedToolDef = toolDef as DynamicToolDef
          const toolInfo: Tool.Info = {
            id: forgedTool.id,
            init: async (ctx) => ({
              parameters: z.object(typedToolDef.parameters || {}),
              description: forgedTool.template.description,
              execute: async (args, ctx) => {
                // Track usage
                await trackToolUsage(forgedTool.id)

                // Execute the tool
                try {
                  const result = typedToolDef.execute
                    ? await typedToolDef.execute(args, ctx)
                    : "Tool executed but no output returned"
                  return {
                    title: "",
                    output: typeof result === "string" ? result : JSON.stringify(result),
                    metadata: { forgedTool: true, toolName: forgedTool.template.name },
                  }
                } catch (error) {
                  log.error("Forged tool execution failed", { toolId: forgedTool.id, error })
                  throw error
                }
              },
              formatValidationError: (error) => `Validation error: ${error.message}`,
            }),
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
  export async function getToolAnalytics(): Promise<
    Record<string, { usage: number; lastUsed: number; efficiency: number }>
  > {
    const state = await forgeStorage()
    const analytics: Record<string, { usage: number; lastUsed: number; efficiency: number }> = {}

    for (const [toolId, usage] of Object.entries(state.usage)) {
      const tool = state.tools[toolId]
      const efficiency = tool ? calculateEfficiency(tool, usage) : 0

      analytics[toolId] = {
        usage,
        lastUsed: tool?.lastUsed || 0,
        efficiency,
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
    return Math.min(
      100,
      (tool.validated ? 50 : 0) + Math.min(30, usagePerDay * 10) + Math.min(20, daysSinceCreation < 7 ? 20 : 0),
    )
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
    cleanupUnusedTools,
  }
}
