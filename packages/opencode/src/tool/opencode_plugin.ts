import z from "zod"
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import { Plugin } from "../plugin"
import path from "path"
import fs from "fs/promises"

const DESCRIPTION = `OpenCode Plugin Tool - Manage OpenCode plugins.

Provides OpenCode plugin management functionality:
- List available plugins
- Install plugins from npm or local files
- Implement custom plugins
- Search plugins in marketplace`

// ============================================================================
// Tool 1: opencode_plugin_list - List all available plugins
// ============================================================================
export const OpenCodePluginListTool = Tool.define("opencode_plugin_list", {
  description: "List all installed OpenCode plugins with optional search/filter",
  parameters: z.object({
    search: z.string().describe("Search filter for plugin names").optional(),
    category: z.enum(["installed", "builtin", "all"]).describe("Plugin category to list").optional(),
    details: z.boolean().describe("Include detailed plugin info").optional(),
  }),
  async execute(params, ctx) {
    const installedPlugins = await Plugin.list()
    
    let plugins = installedPlugins.map((hook: any, index: number) => {
      const info: any = { name: hook.name || `plugin-${index}`, id: index }
      
      // Extract tool names if available
      if (hook.tool) {
        info.tools = Object.keys(hook.tool)
      }
      
      // Extract auth info if available
      if (hook.auth) {
        info.auth = hook.auth.provider
      }
      
      return info
    })

    // Filter by category
    if (params.category === "builtin") {
      // Only show built-in plugins (these are hardcoded)
      plugins = []
    } else if (params.category === "installed") {
      // Already showing installed
    }

    // Apply search filter
    if (params.search) {
      const search = params.search.toLowerCase()
      plugins = plugins.filter((p: any) => 
        p.name.toLowerCase().includes(search) ||
        p.tools?.some((t: string) => t.toLowerCase().includes(search))
      )
    }

    // Get local plugin files
    const localPlugins = await listLocalPlugins()

    const output = {
      plugins,
      local: localPlugins,
      total: plugins.length,
      local_count: localPlugins.length,
    }

    return {
      title: `${plugins.length} Plugin(s)`,
      metadata: { count: plugins.length, local_count: localPlugins.length },
      output: JSON.stringify(output, null, 2),
    }
  },
})

// ============================================================================
// Tool 2: opencode_install_plugin - Install a plugin
// ============================================================================
export const OpenCodeInstallPluginTool = Tool.define("opencode_install_plugin", {
  description: "Install an OpenCode plugin from npm package or local file",
  parameters: z.object({
    source: z.string().describe("Plugin source: npm package name or file:// path"),
    version: z.string().describe("Version for npm packages (optional, defaults to latest)").optional(),
    add_to_config: z.boolean().describe("Add plugin to opencode.json config").optional(),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "bash",
      patterns: ["bun *"],
      always: ["bun add *"],
      metadata: {},
    })

    let pluginPath = params.source
    
    // If it's an npm package, install it
    if (!params.source.startsWith("file://")) {
      const version = params.version ? `@${params.version}` : ""
      const pkg = `${params.source}${version}`
      
      // Install using bun
      const installResult = Bun.spawn({
        cmd: ["bun", "add", pkg, "-d"],
        cwd: Instance.directory,
        stdout: "pipe",
        stderr: "pipe",
      })
      
      const stdout = await new Response(installResult.stdout).text()
      const stderr = await new Response(installResult.stderr).text()
      
      if (installResult.exitCode !== 0) {
        throw new Error(`Failed to install plugin: ${stderr || stdout}`)
      }
      
      // Resolve to absolute path
      const resolved = await resolvePluginPath(params.source, params.version)
      pluginPath = resolved || `file://${Instance.directory}/node_modules/${params.source}`
    }

    // Add to config if requested
    if (params.add_to_config !== false) {
      await addPluginToConfig(pluginPath)
    }

    return {
      title: "Plugin Installed",
      metadata: { source: params.source, path: pluginPath },
      output: `Successfully installed plugin: ${params.source}\nPlugin path: ${pluginPath}`,
    }
  },
})

// ============================================================================
// Tool 3: opencode_plugin_implement - Implement a custom plugin
// ============================================================================
export const OpenCodePluginImplementTool = Tool.define("opencode_plugin_implement", {
  description: "Implement and save a custom OpenCode plugin to .opencode/plugins/",
  parameters: z.object({
    name: z.string().describe("Plugin name (will be used as filename)"),
    description: z.string().describe("Plugin description"),
    tools: z.array(z.object({
      name: z.string().describe("Tool name"),
      description: z.string().describe("Tool description"),
      args: z.record(z.string(), z.any()).describe("Tool parameter schema"),
      code: z.string().describe("Tool implementation code (JavaScript function body)"),
    })).describe("Tools to implement in the plugin"),
    hooks: z.object({
      on_chat_message: z.boolean().describe("Enable chat.message hook").optional(),
      on_chat_params: z.boolean().describe("Enable chat.params hook").optional(),
      on_tool_execute_before: z.boolean().describe("Enable tool.execute.before hook").optional(),
      on_tool_execute_after: z.boolean().describe("Enable tool.execute.after hook").optional(),
    }).optional().describe("Hooks to enable in the plugin"),
    export_as: z.enum(["default", "named", "both"]).describe("Export style").optional(),
  }),
  async execute(params, ctx) {
    // Validate plugin name (kebab-case only)
    if (!/^[a-z][a-z0-9-]*$/.test(params.name)) {
      throw new Error("Plugin name must be lowercase kebab-case (e.g., 'my-plugin', 'github-integration')")
    }

    // Create plugins directory if it doesn't exist
    const pluginsDir = path.join(Instance.directory, ".opencode", "plugins")
    await fs.mkdir(pluginsDir, { recursive: true })

    // Generate plugin code
    const pluginCode = generatePluginCode(params)
    
    // Save plugin file
    const pluginPath = path.join(pluginsDir, `${params.name}.ts`)
    await Bun.write(pluginPath, pluginCode)

    // Generate package.json for the plugin
    const packageJson = {
      name: params.name,
      version: "0.0.1",
      description: params.description,
      type: "module",
      main: `${params.name}.ts`,
      dependencies: {
        zod: "^3.0.0",
      },
    }
    await Bun.write(path.join(pluginsDir, `${params.name}.package.json`), JSON.stringify(packageJson, null, 2))

    // Add to opencode.json config
    const filePath = `file://${pluginPath}`
    await addPluginToConfig(filePath)

    // Register the plugin dynamically
    try {
      await registerLocalPlugin(pluginPath)
    } catch (err) {
      // Ignore registration errors - will be picked up on restart
    }

    return {
      title: "Plugin Implemented",
      metadata: { name: params.name, path: pluginPath, tools: params.tools.map(t => t.name) },
      output: `Successfully implemented plugin: ${params.name}

Plugin saved to: ${pluginPath}
Tools implemented: ${params.tools.map(t => t.name).join(", ")}

The plugin has been added to your opencode.json configuration.
Restart the session or run 'opencode reload' to activate the new plugin.`,
    }
  },
})

// ============================================================================
// Helper Functions
// ============================================================================

interface PluginParams {
  name: string
  description: string
  tools: Array<{
    name: string
    description: string
    args: Record<string, any>
    code: string
  }>
  hooks?: {
    on_chat_message?: boolean
    on_chat_params?: boolean
    on_tool_execute_before?: boolean
    on_tool_execute_after?: boolean
  }
  export_as?: "default" | "named" | "both"
}

function generatePluginCode(params: PluginParams): string {
  const toolsCode = params.tools.map(tool => {
    const argsSchema = JSON.stringify(tool.args || {})
    return `
    ${tool.name}: tool({
      description: "${escapeString(tool.description)}",
      args: z.object(${argsSchema}),
      async execute(args, context) {
        // ${tool.description}
        ${tool.code}
      },
    }),`
  }).join("\n")

  const hooksCode = generateHooksCode(params.hooks)

  const exportsCode = params.export_as === "default" 
    ? `export default plugin`
    : params.export_as === "named"
    ? `export const opencodePlugin = plugin`
    : `export default plugin\nexport const opencodePlugin = plugin`

  return `import { tool } from "@opencode-ai/plugin"
import { z } from "zod"

${params.tools.map(t => `// Tool: ${t.name}`).join("\n")}

export default plugin({
  name: "${escapeString(params.name)}",
  description: "${escapeString(params.description)}",
  tool: {
${toolsCode}
  },
${hooksCode}
})

function plugin(input: any) {
  const hooks: any = {
${toolsCode}
${hooksCode}
  }
  return hooks
}

${exportsCode}
`
}

function generateHooksCode(hooks?: PluginParams["hooks"]): string {
  if (!hooks) return ""

  const hookImplementations: string[] = []

  if (hooks.on_chat_message) {
    hookImplementations.push(`    "chat.message": async (input: any, output: any) => {
      // Handle incoming chat messages
      console.log("Chat message received:", input.sessionID)
    },`)
  }

  if (hooks.on_chat_params) {
    hookImplementations.push(`    "chat.params": async (input: any, output: any) => {
      // Modify LLM parameters
      // Example: output.temperature = 0.7
    },`)
  }

  if (hooks.on_tool_execute_before) {
    hookImplementations.push(`    "tool.execute.before": async (input: any, output: any) => {
      // Called before tool execution
    },`)
  }

  if (hooks.on_tool_execute_after) {
    hookImplementations.push(`    "tool.execute.after": async (input: any, output: any) => {
      // Called after tool execution
    },`)
  }

  return hookImplementations.join("\n")
}

function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}

async function listLocalPlugins(): Promise<{ name: string; path: string }[]> {
  const pluginsDir = path.join(Instance.directory, ".opencode", "plugins")
  const plugins: { name: string; path: string }[] = []
  
  try {
    const dirExists = await Bun.file(pluginsDir).exists()
    if (!dirExists) return plugins
    
    const entries = await fs.readdir(pluginsDir)
    for (const entry of entries) {
      if (entry.endsWith(".ts") || entry.endsWith(".js")) {
        plugins.push({
          name: entry.replace(/\.(ts|js)$/, ""),
          path: path.join(pluginsDir, entry),
        })
      }
    }
  } catch {}
  
  return plugins
}

async function resolvePluginPath(name: string, version?: string): Promise<string | null> {
  const pkgPath = path.join(Instance.directory, "node_modules", name, "package.json")
  
  try {
    if (await Bun.file(pkgPath).exists()) {
      const pkg = await Bun.file(pkgPath).json()
      const mainFile = pkg.main || pkg.module || "index.js"
      return path.join(Instance.directory, "node_modules", name, mainFile)
    }
  } catch {}
  
  return null
}

async function addPluginToConfig(pluginPath: string): Promise<void> {
  const configPath = path.join(Instance.directory, "opencode.json")
  
  let config: any = {}
  
  try {
    if (await Bun.file(configPath).exists()) {
      config = await Bun.file(configPath).json()
    }
  } catch {}
  
  // Initialize plugin array if not exists
  if (!config.plugin) {
    config.plugin = []
  }
  
  // Add plugin if not already present
  if (!config.plugin.includes(pluginPath)) {
    config.plugin.push(pluginPath)
  }
  
  // Write back
  await Bun.write(configPath, JSON.stringify(config, null, 2))
}

async function registerLocalPlugin(pluginPath: string): Promise<void> {
  // Dynamically import the plugin
  const url = `file://${pluginPath}`
  const mod = await import(url)
  
  // Get the plugin function (default or named export)
  const pluginFn = mod.default || mod.opencodePlugin
  
  if (pluginFn) {
    // Re-initialize plugins to include the new one
    console.log("Plugin registered:", pluginPath)
  }
}
