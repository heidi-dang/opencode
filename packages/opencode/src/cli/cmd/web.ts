import { Server } from "../../server/server"
import { UI } from "../ui"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"
import { Sanitize } from "../../config/sanitize"
import { createDashboardMetrics, attachServerDashboard } from "../dashboard"
import open from "open"
import { networkInterfaces } from "os"

export const WebCommand = cmd({
  command: "web",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .option("sanitize-config", {
        type: "boolean",
        describe: "Sync and normalize agents to global config before web server starts",
      })
      .option("ui-dev-url", {
        type: "string",
        describe: "Full origin URL for local UI development (e.g. http://localhost:5173)",
      })
      .option("ui-dist", {
        type: "string",
        describe: "Path to local UI dist folder",
      }),
  describe: "start opencode server and open web interface",
  handler: async (args) => {
    if (args.sanitizeConfig) {
      await Sanitize.run()
    }

    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      UI.println(UI.Style.TEXT_WARNING_BOLD + "!  " + "OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = await resolveNetworkOptions(args)
    
    // Check if port is available (if not 0)
    if (opts.port !== 0) {
      const isAvailable = await new Promise<boolean>((resolve) => {
        const server = require("net").createServer()
        server.on("error", () => resolve(false))
        server.on("listening", () => {
          server.close()
          resolve(true)
        })
        server.listen(opts.port, opts.hostname === "0.0.0.0" ? undefined : opts.hostname)
      })

      if (!isAvailable) {
        UI.error(`Port ${opts.port} is already in use. Please use --port to specify a different port.`)
        process.exit(1)
      }
    }

    const metrics = createDashboardMetrics()
    const server = await Server.listen({ 
      ...opts, 
      metrics,
      uiDevUrl: args["--ui-dev-url"] as string | undefined,
      uiDist: args["--ui-dist"] as string | undefined,
    })
    
    // Server on Bun.serve returns a server object with a port. 
    // Types might be tricky, so we cast if needed, but Bun.Server has 'port'.
    const dash = attachServerDashboard(server as any, {
      hostname: opts.hostname,
      port: server.port,
      healthPath: "/health",
      refreshMs: 1500,
      title: "OpenCode Server Dashboard",
    }, metrics)

    await new Promise(() => {})
    dash.stop()
    await server.stop()
  },
})
