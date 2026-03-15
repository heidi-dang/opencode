import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { InfinityCommand } from "../infinity/runtime"

export const InfinityPlugin = async (input: PluginInput): Promise<Hooks> => {
  return {
    cli: () => InfinityCommand,
  }
}
