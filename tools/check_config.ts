import { Config } from "../packages/opencode/src/config/config"
import { Instance } from "../packages/opencode/src/project/instance"

try {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const cfg = await Config.get()
      process.stdout.write(JSON.stringify(cfg))
      process.exit(0)
    },
  })
} catch (e: any) {
  process.stderr.write(e.message || "Unknown error")
  process.exit(1)
}
