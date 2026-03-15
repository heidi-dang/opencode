import { type Hooks, type PluginInput, tool } from "@opencode-ai/plugin"
import { InfinityRuntime, InfinityCommand } from "../infinity/runtime"
import { z } from "zod"

export const InfinityPlugin = async (input: PluginInput): Promise<Hooks> => {
  return {
    cli: () => InfinityCommand,
    tool: {
      infinity_loop: tool({
        description: "Run an autonomous health audit using the Infinity Loop system.",
        args: {
          max_cycles: z.number().default(1).describe("Number of audit cycles to perform."),
          watch: z.boolean().default(false).describe("Whether to watch for file changes."),
        },
        execute: async (args, context) => {
          const config = {
            max_cycles: args.max_cycles,
            watch: args.watch,
            daemon: false,
          }
          const runtime = new InfinityRuntime(context.worktree, config)
          await runtime.start()
          return "Infinity Loop audit completed successfully."
        },
      }),
    },
  }
}
