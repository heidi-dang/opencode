import { cmd } from "./cmd"
import { Sanitize } from "../../config/sanitize"

export const ConfigSanitizeCommand = cmd({
  command: "sanitize",
  describe: "reset and optimize configuration by promoting local settings to global",
  async handler() {
    await Sanitize.run()
  }
})

export const ConfigCommand = cmd({
  command: "config",
  describe: "manage configuration",
  builder: (yargs) => yargs.command(ConfigSanitizeCommand).demandCommand(),
  async handler() {},
})
