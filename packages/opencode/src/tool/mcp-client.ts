import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Tool } from "./tool"
import { Log } from "../util/log"
import { z } from "zod"

interface MCPConfig {
  mcpServers: Record<string, {
    command: string
    args: string[]
    env?: Record<string, string>
  }>
}

export namespace MCPClient {
  const log = Log.create({ service: "mcp" })

  function jsonSchemaToZod(schema: any): z.ZodType {
    // Basic mapping of JSON Schema to Zod for MCP tool parameters
    if (schema.type === "object" && schema.properties) {
      const shape: Record<string, z.ZodType> = {}
      for (const [key, prop] of Object.entries<any>(schema.properties)) {
        shape[key] = jsonSchemaToZod(prop)
        if (!schema.required?.includes(key)) {
          shape[key] = shape[key].optional()
        }
      }
      return z.object(shape)
    }
    if (schema.type === "string") return z.string()
    if (schema.type === "number" || schema.type === "integer") return z.number()
    if (schema.type === "boolean") return z.boolean()
    if (schema.type === "array" && schema.items) return z.array(jsonSchemaToZod(schema.items))
    return z.any()
  }

  export async function connect(config: MCPConfig): Promise<Tool.Info[]> {
    const tools: Tool.Info[] = []
    
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        log.info(`Connecting to MCP server: ${serverName}`)
        
        const transport = new StdioClientTransport({
          command: serverConfig.command,
          args: serverConfig.args,
          env: {
            ...process.env,
            ...serverConfig.env,
          } as any
        })

        const client = new Client(
          { name: "opencode-heidi", version: "1.0.0" },
          { capabilities: {} }
        )

        await client.connect(transport)
        log.info(`Connected to MCP server: ${serverName}`)

        const toolsResult = await client.listTools()
        
        for (const mcpTool of toolsResult.tools) {
          const toolId = `${serverName}_${mcpTool.name}`
          const parameters = mcpTool.inputSchema ? jsonSchemaToZod(mcpTool.inputSchema) : z.object({})

          const opencodeTool = Tool.define(toolId, {
            description: mcpTool.description || "",
            parameters,
            execute: async (args, ctx) => {
              log.debug(`Executing MCP Tool ${toolId}`, args as any)
              const result = await client.callTool({
                name: mcpTool.name,
                arguments: args as Record<string, any>
              })

              let output = ""
              const contentList = (result.content as any[]) || []
              if (contentList.length === 0) {
                output = JSON.stringify(result)
              } else {
                for (const content of contentList) {
                  if (content.type === "text") {
                    output += content.text + "\n"
                  } else if (content.type === "image") {
                    output += "[Image Content Returned by MCP]\n"
                  }
                }
              }

              return {
                title: toolId,
                output,
                metadata: {}
              }
            }
          })
          
          tools.push(opencodeTool)
          log.info(`Mapped MCP Tool: ${toolId}`)
        }
      } catch (err) {
        log.error(`Failed to connect to MCP server ${serverName}`, err as any)
      }
    }
    
    return tools
  }
}
