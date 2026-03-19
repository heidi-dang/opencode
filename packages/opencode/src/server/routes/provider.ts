import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import { HTTPException } from "hono/http-exception"
import z from "zod"
import { Config } from "../../config/config"
import { Provider } from "../../provider/provider"
import { ModelsDev } from "../../provider/models"
import { ProviderAuth } from "../../provider/auth"
import { ProviderID } from "../../provider/schema"
import { Instance } from "../../project/instance"
import { Session } from "../../session"
import { SessionID } from "../../session/schema"
import { SessionStats, aggregateSessionStats } from "../../session/stats"
import { mapValues } from "remeda"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from "ssh2"

const DeployInput = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  user: z.string().min(1),
  password: z.string().min(1),
  path: z.string().min(1),
  publicPort: z.number().int().min(1).max(65535).default(8080),
  sessionID: SessionID.zod.optional(),
})

const DeployResponse = z.object({
  host: z.string(),
  port: z.number(),
  path: z.string(),
  publicPort: z.number(),
  url: z.string(),
  shareURL: z.string().optional(),
  sessionID: SessionID.zod.optional(),
  logs: z.array(z.string()),
})

const ProviderSummary = z.object({
  providerID: ProviderID.zod,
  name: z.string(),
  connected: z.boolean(),
  defaultModel: z.string().optional(),
  project: z.object({
    id: z.string(),
    name: z.string().optional(),
    worktree: z.string(),
    directory: z.string(),
  }),
  latestSession: z
    .object({
      id: SessionID.zod,
      title: z.string(),
      updated: z.number(),
      shareURL: z.string().optional(),
    })
    .optional(),
  usage: z.object({
    totalSessions: SessionStats.shape.totalSessions,
    totalMessages: SessionStats.shape.totalMessages,
    totalCost: SessionStats.shape.totalCost,
    totalTokens: SessionStats.shape.totalTokens,
    days: SessionStats.shape.days,
    lastUpdated: z.number().optional(),
    topModels: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        messages: z.number(),
        cost: z.number(),
        tokens: z.object({
          input: z.number(),
          output: z.number(),
          cache: z.object({
            read: z.number(),
            write: z.number(),
          }),
        }),
      }),
    ),
  }),
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      context: z.number().nullable(),
      output: z.number().nullable(),
      status: z.string(),
      releaseDate: z.string(),
      default: z.boolean(),
    }),
  ),
})

const PublishBody = z.object({
  sessionID: SessionID.zod.optional(),
})

const PublishResponse = z.object({
  sessionID: SessionID.zod,
  shareURL: z.string(),
})

async function latest(input: { sessionID?: SessionID }) {
  if (input.sessionID) return Session.get(input.sessionID)
  for await (const item of Session.list({
    directory: Instance.directory,
    roots: true,
    limit: 1,
  })) {
    return item
  }
}

function shell(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function connect(input: z.infer<typeof DeployInput>) {
  return new Promise<Client>((resolve, reject) => {
    const conn = new Client()
    conn.on("ready", () => resolve(conn))
    conn.on("error", reject)
    const cfg: ConnectConfig = {
      host: input.host,
      port: input.port,
      username: input.user,
      password: input.password,
      readyTimeout: 20_000,
    }
    conn.connect(cfg)
  })
}

function exec(conn: Client, command: string, logs: string[]) {
  return new Promise<string>((resolve, reject) => {
    conn.exec(command, (err: Error | undefined, stream: ClientChannel) => {
      if (err) return reject(err)
      let out = ""
      stream.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString()
        out += text
        logs.push(...text.split("\n").filter(Boolean))
      })
      stream.stderr.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString()
        out += text
        logs.push(...text.split("\n").filter(Boolean))
      })
      stream.on("close", (code: number | undefined) => {
        if (code && code !== 0) return reject(new Error(`Remote command failed (${code}): ${command}`))
        resolve(out)
      })
    })
  })
}

function sftp(conn: Client) {
  return new Promise<SFTPWrapper>((resolve, reject) => {
    conn.sftp((err: Error | undefined, client: SFTPWrapper) => {
      if (err) return reject(err)
      resolve(client)
    })
  })
}

async function upload(client: SFTPWrapper, path: string, body: string) {
  await new Promise<void>((resolve, reject) => {
    const stream = client.createWriteStream(path, { encoding: "utf8", mode: 0o644 })
    stream.on("close", () => resolve())
    stream.on("error", reject)
    stream.end(body)
  })
}

function html(input: {
  name: string
  project: string
  model?: string
  share?: string
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${input.name}</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: radial-gradient(circle at top left, #11314a, #081018 55%); color: #eaf2f8; }
      main { max-width: 760px; margin: 0 auto; padding: 64px 24px; }
      .card { background: rgba(7, 17, 28, 0.72); border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 28px; backdrop-filter: blur(10px); }
      .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: #8ab9dc; }
      h1 { font-size: 36px; line-height: 1.1; margin: 16px 0 12px; }
      p { color: #bbd0df; line-height: 1.65; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-top: 28px; }
      .tile { border-radius: 18px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 16px; }
      a { color: #fff; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <div class="eyebrow">GitHub Copilot VPS deployment</div>
        <h1>${input.name}</h1>
        <p>This remote deployment was generated by the Copilot Builder workflow for ${input.project}.</p>
        <div class="grid">
          <div class="tile"><strong>Project</strong><br />${input.project}</div>
          <div class="tile"><strong>Model</strong><br />${input.model ?? "Not selected"}</div>
          <div class="tile"><strong>Published session</strong><br />${input.share ? `<a href="${input.share}">${input.share}</a>` : "No published session yet"}</div>
        </div>
      </section>
    </main>
  </body>
</html>`
}

function compose(input: { port: number }) {
  return `services:
  web:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "${input.port}:80"
    volumes:
      - ./site:/usr/share/nginx/html:ro
`
}

async function providers() {
  const config = await Config.get()
  const disabled = new Set(config.disabled_providers ?? [])
  const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined

  const allProviders = await ModelsDev.get()
  const filteredProviders: Record<string, (typeof allProviders)[string]> = {}
  for (const [key, value] of Object.entries(allProviders)) {
    if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
      filteredProviders[key] = value
    }
  }

  const connected = await Provider.list()
  const all = Object.assign(
    mapValues(filteredProviders, (x) => Provider.fromModelsDevProvider(x)),
    connected,
  )
  return {
    all: Object.values(all),
    default: mapValues(all, (item) => Provider.sort(Object.values(item.models))[0].id),
    connected: Object.keys(connected),
  }
}

export const ProviderRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List providers",
        description: "Get a list of all available AI providers, including both available and connected ones.",
        operationId: "provider.list",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    all: ModelsDev.Provider.array(),
                    default: z.record(z.string(), z.string()),
                    connected: z.array(z.string()),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await providers())
      },
    )
    .get(
      "/:providerID/summary",
      describeRoute({
        summary: "Get provider summary",
        description: "Retrieve connection, model, project, and usage summary data for a specific provider.",
        operationId: "provider.summary",
        responses: {
          200: {
            description: "Provider summary",
            content: {
              "application/json": {
                schema: resolver(ProviderSummary),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const data = await providers()
        const item = data.all.find((provider) => provider.id === providerID)
        if (!item) {
          throw new HTTPException(404, { message: `Provider not found: ${providerID}` })
        }

        const stats = await aggregateSessionStats({
          projectID: Instance.project.id,
          providerID,
        })
        const session = await latest({})

        const models = Provider.sort(Object.values(item.models)).map((model) => ({
          id: model.id,
          name: model.name,
          context: model.limit.context ?? null,
          output: model.limit.output ?? null,
          status: model.status,
          releaseDate: model.release_date,
          default: data.default[item.id] === model.id,
        }))

        const topModels = Object.entries(stats.modelUsage)
          .sort(([, a], [, b]) => b.messages - a.messages)
          .slice(0, 5)
          .map(([key, value]) => {
            const id = key.startsWith(`${providerID}/`) ? key.slice(providerID.length + 1) : key
            return {
              id,
              name: item.models[id]?.name ?? id,
              messages: value.messages,
              cost: value.cost,
              tokens: value.tokens,
            }
          })

        return c.json({
          providerID,
          name: item.name,
          connected: data.connected.includes(providerID),
          defaultModel: data.default[item.id],
          project: {
            id: Instance.project.id,
            name: Instance.project.name,
            worktree: Instance.project.worktree,
            directory: Instance.directory,
          },
          latestSession: session
            ? {
                id: session.id,
                title: session.title,
                updated: session.time.updated,
                shareURL: session.share?.url,
              }
            : undefined,
          usage: {
            totalSessions: stats.totalSessions,
            totalMessages: stats.totalMessages,
            totalCost: stats.totalCost,
            totalTokens: stats.totalTokens,
            days: stats.days,
            lastUpdated: stats.totalSessions ? stats.dateRange.latest : undefined,
            topModels,
          },
          models,
        })
      },
    )
    .post(
      "/:providerID/publish",
      describeRoute({
        summary: "Publish builder session",
        description: "Share the latest or requested builder session and return its public URL.",
        operationId: "provider.publish",
        responses: {
          200: {
            description: "Published session",
            content: {
              "application/json": {
                schema: resolver(PublishResponse),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ providerID: ProviderID.zod })),
      validator("json", PublishBody.optional()),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        if (providerID !== ProviderID.githubCopilot) {
          throw new HTTPException(404, { message: `Unsupported provider workflow: ${providerID}` })
        }
        const body = c.req.valid("json") ?? {}
        const session = await latest({ sessionID: body.sessionID })
        if (!session) {
          throw new HTTPException(404, { message: "No root session found for this project" })
        }
        await Session.share(session.id)
        const next = await Session.get(session.id)
        return c.json({
          sessionID: next.id,
          shareURL: next.share!.url,
        })
      },
    )
    .delete(
      "/:providerID/publish",
      describeRoute({
        summary: "Unpublish builder session",
        description: "Remove the public share URL from the latest or requested builder session.",
        operationId: "provider.unpublish",
        responses: {
          200: {
            description: "Unpublished session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ providerID: ProviderID.zod })),
      validator("json", PublishBody.optional()),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        if (providerID !== ProviderID.githubCopilot) {
          throw new HTTPException(404, { message: `Unsupported provider workflow: ${providerID}` })
        }
        const body = c.req.valid("json") ?? {}
        const session = await latest({ sessionID: body.sessionID })
        if (!session) {
          throw new HTTPException(404, { message: "No root session found for this project" })
        }
        await Session.unshare(session.id)
        return c.json(true)
      },
    )
    .post(
      "/:providerID/deploy",
      describeRoute({
        summary: "Deploy builder landing page",
        description: "Connect to a VPS over SSH and deploy a Docker Compose landing page for the current Copilot builder project.",
        operationId: "provider.deploy",
        responses: {
          200: {
            description: "Deployment result",
            content: {
              "application/json": {
                schema: resolver(DeployResponse),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ providerID: ProviderID.zod })),
      validator("json", DeployInput),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        if (providerID !== ProviderID.githubCopilot) {
          throw new HTTPException(404, { message: `Unsupported provider workflow: ${providerID}` })
        }
        const body = c.req.valid("json")
        const base = await latest({ sessionID: body.sessionID })
        const session = !base ? undefined : base.share?.url ? base : await Session.share(base.id).then(() => Session.get(base.id))
        const shareURL = session?.share?.url
        const logs = [`Connecting to ${body.host}:${body.port} as ${body.user}`]
        const conn = await connect(body)

        try {
          const root = body.path.replace(/\/$/, "")
          await exec(conn, `mkdir -p ${shell(root)} ${shell(`${root}/site`)}`, logs)
          const ftp = await sftp(conn)
          await upload(
            ftp,
            `${root}/docker-compose.yml`,
            compose({ port: body.publicPort }),
          )
          await upload(
            ftp,
            `${root}/site/index.html`,
            html({
              name: `${Instance.project.name ?? "Copilot Builder"} deployment`,
              project: Instance.project.worktree,
              model: (await providers()).default[providerID],
              share: shareURL,
            }),
          )
          logs.push(`Uploaded deployment files to ${root}`)
          await exec(conn, `docker compose -f ${shell(`${root}/docker-compose.yml`)} up -d`, logs)
          await exec(conn, `docker compose -f ${shell(`${root}/docker-compose.yml`)} ps`, logs)

          return c.json({
            host: body.host,
            port: body.port,
            path: root,
            publicPort: body.publicPort,
            url: `http://${body.host}:${body.publicPort}`,
            shareURL,
            sessionID: session?.id,
            logs,
          })
        } finally {
          conn.end()
        }
      },
    )
    .get(
      "/auth",
      describeRoute({
        summary: "Get provider auth methods",
        description: "Retrieve available authentication methods for all AI providers.",
        operationId: "provider.auth",
        responses: {
          200: {
            description: "Provider auth methods",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), z.array(ProviderAuth.Method))),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await ProviderAuth.methods())
      },
    )
    .post(
      "/:providerID/oauth/authorize",
      describeRoute({
        summary: "OAuth authorize",
        description: "Initiate OAuth authorization for a specific AI provider to get an authorization URL.",
        operationId: "provider.oauth.authorize",
        responses: {
          200: {
            description: "Authorization URL and method",
            content: {
              "application/json": {
                schema: resolver(ProviderAuth.Authorization.optional()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          method: z.number().meta({ description: "Auth method index" }),
          inputs: z.record(z.string(), z.string()).optional().meta({ description: "Prompt inputs" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const { method, inputs } = c.req.valid("json")
        const result = await ProviderAuth.authorize({
          providerID,
          method,
          inputs,
        })
        return c.json(result)
      },
    )
    .post(
      "/:providerID/oauth/callback",
      describeRoute({
        summary: "OAuth callback",
        description: "Handle the OAuth callback from a provider after user authorization.",
        operationId: "provider.oauth.callback",
        responses: {
          200: {
            description: "OAuth callback processed successfully",
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
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          method: z.number().meta({ description: "Auth method index" }),
          code: z.string().optional().meta({ description: "OAuth authorization code" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const { method, code } = c.req.valid("json")
        await ProviderAuth.callback({
          providerID,
          method,
          code,
        })
        return c.json(true)
      },
    ),
)
