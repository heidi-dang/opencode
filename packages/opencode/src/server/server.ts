import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Log } from "../util/log"
import { describeRoute, generateSpecs, validator, resolver, openAPIRouteHandler } from "hono-openapi"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { proxy } from "hono/proxy"
import { basicAuth } from "hono/basic-auth"
import z from "zod"
import fs from "fs/promises"
import path from "path"
import mime from "mime-types"
import { Config } from "../config/config"
import { Provider } from "../provider/provider"
import { NamedError } from "@opencode-ai/util/error"
import { LSP } from "../lsp"
import { Format } from "../format"
import { TuiRoutes } from "./routes/tui"
import { Instance } from "../project/instance"
import { Vcs } from "../project/vcs"
import { Agent } from "../agent/agent"
import { Skill } from "../skill/skill"
import { Auth } from "../auth"
import { Flag } from "../flag/flag"
import { Command } from "../command"
import { Global } from "../global"
import { WorkspaceContext } from "../control-plane/workspace-context"
import { WorkspaceID } from "../control-plane/schema"
import { ProviderID } from "../provider/schema"
import { WorkspaceRouterMiddleware } from "../control-plane/workspace-router-middleware"
import { ProjectRoutes } from "./routes/project"
import { SessionRoutes } from "./routes/session"
import { PtyRoutes } from "./routes/pty"
import { McpRoutes } from "./routes/mcp"
import { FileRoutes } from "./routes/file"
import { ConfigRoutes } from "./routes/config"
import { ExperimentalRoutes } from "./routes/experimental"
import { ProviderRoutes } from "./routes/provider"
import { InstanceBootstrap } from "../project/bootstrap"
import { NotFoundError } from "../storage/db"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { websocket } from "hono/bun"
import { HTTPException } from "hono/http-exception"
import { errors } from "./error"
import { Filesystem } from "@/util/filesystem"
import { QuestionRoutes } from "./routes/question"
import { PermissionRoutes } from "./routes/permission"
import { GlobalRoutes } from "./routes/global"
import { MDNS } from "./mdns"
import { lazy } from "@/util/lazy"
import { type DashboardMetrics, recordRequestStart, streamOpened } from "../cli/dashboard"
import { UiSourceResolver, type UiSource } from "./ui-source-resolver"
import { serveStatic } from "hono/bun"

// @ts-ignore This global is needed to prevent ai-sdk from logging warnings to stdout https://github.com/vercel/ai/blob/2dc67e0ef538307f21368db32d5a12345d98831b/packages/ai/src/logger/log-warnings.ts#L85
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace Server {
  const log = Log.create({ service: "server" })

  export const Default = lazy(() => createApp({}))
  
  export let metrics: DashboardMetrics | undefined
  export let uiSource: UiSource | undefined

  export const createApp = (opts: { 
    cors?: string[]
    metrics?: DashboardMetrics 
    uiSource?: UiSource
  }): Hono => {
    const app = new Hono()
    if (opts.metrics) {
      metrics = opts.metrics
    }
    if (opts.uiSource) {
      uiSource = opts.uiSource
    }

    app.get("/health", (c) => c.text("OK"))

    app.use(async (c, next) => {
      if (!metrics) return next()
      const path = c.req.path
      if (path === "/event" || path === "/log") return next()

      // If UI is proxied or served static, we might still want metrics for API routes
      // but we should ignore UI asset requests to avoid noise
      if (path === "/" || path.startsWith("/static/") || path.includes(".")) {
        if (uiSource?.type !== "hosted") return next()
      }

      const stat = recordRequestStart(metrics)
      try {
        await next()
        stat.finish(c.res.status)
      } catch (err) {
        stat.fail()
        throw err
      }
    })

    app.onError((err, c) => {
      log.error("failed", {
        error: err,
      })
      if (err instanceof NamedError) {
        let status: ContentfulStatusCode
        if (err instanceof NotFoundError) status = 404
        else if (err instanceof Provider.ModelNotFoundError) status = 400
        else if (err.name.startsWith("Worktree")) status = 400
        else status = 500
        return c.json(err.toObject(), { status })
      }
      if (err instanceof HTTPException) return err.getResponse()
      const message = err instanceof Error && err.stack ? err.stack : err.toString()
      return c.json(new NamedError.Unknown({ message }).toObject(), {
        status: 500,
      })
    })

    app.use((c, next) => {
      if (c.req.method === "OPTIONS") return next()
      const password = Flag.OPENCODE_SERVER_PASSWORD
      if (!password) return next()
      const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
      return basicAuth({ username, password })(c, next)
    })

    app.use(async (c, next) => {
      const skipLogging = c.req.path === "/log"
      if (!skipLogging) {
        log.info("request", {
          method: c.req.method,
          path: c.req.path,
        })
      }
      const timer = log.time("request", {
        method: c.req.method,
        path: c.req.path,
      })
      await next()
      if (!skipLogging) {
        timer.stop()
      }
    })

    app.use(
      cors({
        origin(input) {
          if (!input) return
          if (input.startsWith("http://localhost:")) return input
          if (input.startsWith("http://127.0.0.1:")) return input
          if (
            input === "tauri://localhost" ||
            input === "http://tauri.localhost" ||
            input === "https://tauri.localhost"
          )
            return input
          if (/^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/.test(input)) {
            return input
          }
          if (opts?.cors?.includes(input)) {
            return input
          }
          return
        },
      }),
    )

    app.route("/global", GlobalRoutes())
    
    app.put(
      "/auth/:providerID",
      describeRoute({
        summary: "Set auth credentials",
        description: "Set authentication credentials",
        operationId: "auth.set",
        responses: {
          200: {
            description: "Successfully set authentication credentials",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod,
        }),
      ),
      validator("json", Auth.Info),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const info = c.req.valid("json")
        await Auth.set(providerID, info)
        return c.json(true)
      },
    )

    app.delete(
      "/auth/:providerID",
      describeRoute({
        summary: "Remove auth credentials",
        description: "Remove authentication credentials",
        operationId: "auth.remove",
        responses: {
          200: {
            description: "Successfully removed authentication credentials",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod,
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        await Auth.remove(providerID)
        return c.json(true)
      },
    )

    app.use(async (c, next) => {
      if (c.req.path === "/log") return next()
      const rawWorkspaceID = c.req.query("workspace") || c.req.header("x-opencode-workspace")
      const raw = c.req.query("directory") || c.req.header("x-opencode-directory") || process.cwd()
      const directory = Filesystem.resolve(
        (() => {
          try {
            return decodeURIComponent(raw)
          } catch {
            return raw
          }
        })(),
      )

      return WorkspaceContext.provide({
        workspaceID: rawWorkspaceID ? WorkspaceID.make(rawWorkspaceID) : undefined,
        async fn() {
          return Instance.provide({
            directory,
            init: InstanceBootstrap,
            async fn() {
              return next()
            },
          })
        },
      })
    })

    app.use(WorkspaceRouterMiddleware)

    app.get(
      "/doc",
      openAPIRouteHandler(app, {
        documentation: {
          info: {
            title: "opencode",
            version: "0.0.3",
            description: "opencode api",
          },
          openapi: "3.1.1",
        },
      }),
    )

    app.use(
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          workspace: z.string().optional(),
        }),
      ),
    )

    app.route("/project", ProjectRoutes())
    app.route("/pty", PtyRoutes())
    app.route("/config", ConfigRoutes())
    app.route("/experimental", ExperimentalRoutes())
    app.route("/session", SessionRoutes())
    app.route("/permission", PermissionRoutes())
    app.route("/question", QuestionRoutes())
    app.route("/provider", ProviderRoutes())
    app.route("/", FileRoutes())
    app.route("/mcp", McpRoutes())
    app.route("/tui", TuiRoutes())

    app.post(
      "/instance/dispose",
      describeRoute({
        summary: "Dispose instance",
        description: "Clean up and dispose the current OpenCode instance, releasing all resources.",
        operationId: "instance.dispose",
        responses: {
          200: {
            description: "Instance disposed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Instance.dispose()
        return c.json(true)
      },
    )

    app.get(
      "/path",
      describeRoute({
        summary: "Get paths",
        description: "Retrieve the current working directory and related path information for the OpenCode instance.",
        operationId: "path.get",
        responses: {
          200: {
            description: "Path",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    home: z.string(),
                    state: z.string(),
                    config: z.string(),
                    worktree: z.string(),
                    directory: z.string(),
                  }).meta({ ref: "Path" }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json({
          home: Global.Path.home,
          state: Global.Path.state,
          config: Global.Path.config,
          worktree: Instance.worktree,
          directory: Instance.directory,
        })
      },
    )

    app.get(
      "/vcs",
      describeRoute({
        summary: "Get VCS info",
        description: "Retrieve version control system (VCS) information for the current project, such as git branch.",
        operationId: "vcs.get",
        responses: {
          200: {
            description: "VCS info",
            content: {
              "application/json": {
                schema: resolver(Vcs.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        const branch = await Vcs.branch()
        return c.json({ branch })
      },
    )

    app.get(
      "/command",
      describeRoute({
        summary: "List commands",
        description: "Get a list of all available commands in the OpenCode system.",
        operationId: "command.list",
        responses: {
          200: {
            description: "List of commands",
            content: {
              "application/json": {
                schema: resolver(Command.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const commands = await Command.list()
        return c.json(commands)
      },
    )

    app.post(
      "/log",
      describeRoute({
        summary: "Write log",
        description: "Write a log entry to the server logs with specified level and metadata.",
        operationId: "app.log",
        responses: {
          200: {
            description: "Log entry written successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          service: z.string().meta({ description: "Service name for the log entry" }),
          level: z.enum(["debug", "info", "error", "warn"]).meta({ description: "Log level" }),
          message: z.string().meta({ description: "Log message" }),
          extra: z.record(z.string(), z.any()).optional().meta({ description: "Additional metadata for the log entry" }),
        }),
      ),
      async (c) => {
        const { service, level, message, extra } = c.req.valid("json")
        const logger = Log.create({ service })
        switch (level) {
          case "debug": logger.debug(message, extra); break
          case "info": logger.info(message, extra); break
          case "error": logger.error(message, extra); break
          case "warn": logger.warn(message, extra); break
        }
        return c.json(true)
      },
    )

    app.get(
      "/agent",
      describeRoute({
        summary: "List agents",
        description: "Get a list of all available AI agents in the OpenCode system.",
        operationId: "app.agents",
        responses: {
          200: {
            description: "List of agents",
            content: {
              "application/json": {
                schema: resolver(Agent.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const modes = await Agent.list()
        return c.json(modes)
      },
    )

    app.get(
      "/skill",
      describeRoute({
        summary: "List skills",
        description: "Get a list of all available skills in the OpenCode system.",
        operationId: "app.skills",
        responses: {
          200: {
            description: "List of skills",
            content: {
              "application/json": {
                schema: resolver(Skill.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const skills = await Skill.all()
        return c.json(skills)
      },
    )

    app.get(
      "/lsp",
      describeRoute({
        summary: "Get LSP status",
        description: "Get LSP server status",
        operationId: "lsp.status",
        responses: {
          200: {
            description: "LSP server status",
            content: {
              "application/json": {
                schema: resolver(LSP.Status.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await LSP.status())
      },
    )

    app.get(
      "/formatter",
      describeRoute({
        summary: "Get formatter status",
        description: "Get formatter status",
        operationId: "formatter.status",
        responses: {
          200: {
            description: "Formatter status",
            content: {
              "application/json": {
                schema: resolver(Format.Status.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Format.status())
      },
    )

    app.get(
      "/event",
      describeRoute({
        summary: "Subscribe to events",
        description: "Get events",
        operationId: "event.subscribe",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(BusEvent.payloads()),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("event connected")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")
        return streamSSE(c, async (stream) => {
          const close = metrics ? streamOpened(metrics) : () => {}
          stream.writeSSE({
            data: JSON.stringify({ type: "server.connected", properties: {} }),
          })
          const unsub = Bus.subscribeAll(async (event) => {
            await stream.writeSSE({ data: JSON.stringify(event) })
            if (event.type === Bus.InstanceDisposed.type) {
              stream.close()
            }
          })
          const heartbeat = setInterval(() => {
            stream.writeSSE({ data: JSON.stringify({ type: "server.heartbeat", properties: {} }) })
          }, 10_000)
          await new Promise<void>((resolve) => {
            stream.onAbort(() => {
              clearInterval(heartbeat)
              unsub()
              close()
              resolve()
              log.info("event disconnected")
            })
          })
        })
      },
    )

    return app
  }

  export async function openapi() {
    const result = await generateSpecs(Default(), {
      documentation: {
        info: { title: "opencode", version: "1.0.0", description: "opencode api" },
        openapi: "3.1.1",
      },
    })
    return result
  }

  /** @deprecated do not use this dumb shit */
  export let url: URL

  export async function listen(opts: {
    port: number
    hostname: string
    mdns?: boolean
    mdnsDomain?: string
    cors?: string[]
    metrics?: DashboardMetrics
    uiDevUrl?: string
    uiDist?: string
  }) {
    const config = await Config.getGlobal()
    const { source, reason } = await UiSourceResolver.resolve({ 
      uiDevUrl: opts.uiDevUrl, 
      uiDist: opts.uiDist,
      config 
    })
    
    uiSource = source
    url = new URL(`http://${opts.hostname}:${opts.port}`)
    const app = createApp({ ...opts, uiSource: source })

    // UI Handling middleware
    if (source.type === "dev-url") {
      log.info(`UI source: dev-url`)
      log.info(`UI target: ${source.origin}`)
      log.info(`Reason: ${reason}`)
      app.all("*", (c) => {
          const url = new URL(c.req.path, source.origin)
          return proxy(url.href, {
              ...c.req,
              headers: {
                  ...c.req.raw.headers,
                  host: url.host,
                  connection: "keep-alive",
              }
          })
      })
    } else if (source.type === "dist" || source.type === "repo-dist") {
      log.info(`UI source: ${source.type}`)
      log.info(`UI target: ${source.path}`)
      log.info(`Reason: ${reason}`)
      app.use("*", serveStatic({ root: source.path }))
      // Explicit SPA fallback for unknown UI routes
      app.get("*", serveStatic({ path: path.join(source.path, "index.html") }))
    } else {
      log.info(`UI source: hosted`)
      log.info(`UI target: ${source.origin}`)
      log.info(`Reason: ${reason}`)
      app.all("*", async (c) => {
        const reqPath = c.req.path
        const csp = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; font-src 'self' data: https:; media-src 'self' data: https: blob:; connect-src 'self' data: https: wss: ws:;"
        const response = await proxy(`https://app.opencode.ai${reqPath}`, {
          ...c.req,
          headers: { ...c.req.raw.headers, host: "app.opencode.ai" },
        })
        response.headers.set("Content-Security-Policy", csp)
        return response
      })
    }

    const args = {
      hostname: opts.hostname,
      fetch: app.fetch,
      websocket: {
        async open(ws: any) {
          if (source.type !== "dev-url") return
          
          const wsUrl = source.origin.replace(/^http/, "ws")
          log.debug(`Forwarding WebSocket to ${wsUrl}`)
          
          const remote = new WebSocket(wsUrl)
          ws.data = { remote }
          
          remote.onmessage = (event) => ws.send(event.data)
          remote.onclose = () => {
              log.debug("Remote WebSocket closed")
              ws.close()
          }
          remote.onerror = (err) => {
            log.error("UI HMR Proxy WebSocket error", { error: err })
            ws.close()
          }
        },
        async message(ws: any, message: any) {
          if (ws.data?.remote?.readyState === WebSocket.OPEN) {
            ws.data.remote.send(message)
          }
        },
        async close(ws: any) {
          ws.data?.remote?.close()
        },
      },
    } as const

    const tryServe = (port: number) => {
      try {
        return Bun.serve({ ...args, port })
      } catch (err) {
        log.debug(`Failed to bind to port ${port}`, { error: err })
        return undefined
      }
    }

    const server = opts.port === 0 ? (tryServe(4096) ?? tryServe(0)) : tryServe(opts.port)
    if (!server) throw new Error(`Failed to start server on port ${opts.port}`)

    const shouldPublishMDNS =
      opts.mdns &&
      server.port &&
      opts.hostname !== "127.0.0.1" &&
      opts.hostname !== "localhost" &&
      opts.hostname !== "::1"
    if (shouldPublishMDNS) {
      MDNS.publish(server.port!, opts.mdnsDomain)
    } else if (opts.mdns) {
      log.warn("mDNS enabled but hostname is loopback; skipping mDNS publish")
    }

    const originalStop = server.stop.bind(server)
    server.stop = async (closeActiveConnections?: boolean) => {
      if (shouldPublishMDNS) MDNS.unpublish()
      return originalStop(closeActiveConnections)
    }
    return server
  }
}
