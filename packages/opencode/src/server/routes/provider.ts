import fs from "fs/promises"
import { createReadStream } from "node:fs"
import { pipeline } from "node:stream/promises"
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
import { BuilderState } from "../../builder/state"
import { mapValues } from "remeda"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from "ssh2"
import path from "path"
import { ulid } from "ulid"
import { Log } from "../../util/log"

const log = Log.create({ service: "server" })

const DeployInput = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  user: z.string().min(1),
  password: z.string().min(1),
  path: z.string().min(1),
  publicPort: z.number().int().min(1).max(65535).default(8080),
  environmentID: z.string().optional(),
  release: z.object({
    id: z.string(),
    releaseID: z.string().optional(),
    sessionID: SessionID.zod.optional(),
    title: z.string().optional(),
    shareURL: z.string().optional(),
    branch: z.string().optional(),
    commit: z.string().optional(),
  }),
  archive: z.object({
    file: z.string().min(1),
    name: z.string().min(1),
    count: z.number().int().nonnegative(),
    root: z.string().min(1),
    size: z.number().int().nonnegative(),
  }),
  runtime: z.object({
    pm: z.string(),
    install: z.string(),
    build: z.string().optional(),
    start: z.string().min(1),
    detected: z.string().optional(),
    supervisor: z.object({
      kind: z.literal("pm2"),
      name: z.string(),
      file: z.string(),
      start: z.string(),
      stop: z.string(),
      save: z.string(),
      status: z.string(),
    }),
  }),
  vars: z.record(z.string(), z.string()).default({}),
})

const DeployResponse = z.object({
  remote: BuilderState.RemoteRelease,
  promotion: BuilderState.Promotion,
  shareURL: z.string().optional(),
  logs: z.array(z.string()),
  supervisor: BuilderState.Supervisor.optional(),
})

const RollbackInput = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  user: z.string().min(1),
  password: z.string().min(1),
  current: z.object({
    deployID: z.string().optional(),
    releaseID: z.string().optional(),
    promotion: BuilderState.Promotion,
    supervisor: BuilderState.Supervisor.optional(),
  }),
  target: z.object({
    deployID: z.string().optional(),
    releaseID: z.string().optional(),
    revisionID: z.string().optional(),
    remote: BuilderState.RemoteRelease,
    supervisor: BuilderState.Supervisor.optional(),
  }),
  reason: z.string().optional(),
})

const RollbackResponse = z.object({
  remote: BuilderState.RemoteRelease,
  promotion: BuilderState.Promotion,
  logs: z.array(z.string()),
  supervisor: BuilderState.Supervisor.optional(),
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

function join(...value: string[]) {
  return path.posix.join(...value)
}

function parse(value: string) {
  const text = value.trim()
  if (!text) return
  try {
    const item = JSON.parse(text)
    const promotion = BuilderState.Promotion.safeParse(item)
    if (promotion.success) return promotion.data
    const current = BuilderState.RemoteRelease.safeParse(item)
    if (current.success) {
      return BuilderState.Promotion.parse({
        layout: {
          root: path.posix.dirname(path.posix.dirname(current.data.path)),
          releases: path.posix.dirname(current.data.path),
          current: join(path.posix.dirname(path.posix.dirname(current.data.path)), "current"),
          shared: join(path.posix.dirname(path.posix.dirname(current.data.path)), "shared"),
        },
        current: current.data,
      })
    }
  } catch {}
}

function previous(input: { current?: z.infer<typeof BuilderState.Promotion>; link?: string }) {
  if (input.current?.current) return input.current.current
  if (!input.link) return
  return BuilderState.RemoteRelease.parse({
    id: path.posix.basename(input.link),
    path: input.link,
    compose: join(input.link, "docker-compose.yml"),
    site: join(input.link, "site"),
    createdAt: Date.now(),
  })
}

function connect(input: { host: string; port: number; user: string; password: string }) {
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

async function upload(client: SFTPWrapper, path: string, body: string, mode = 0o644) {
  await new Promise<void>((resolve, reject) => {
    const stream = client.createWriteStream(path, { encoding: "utf8", mode })
    stream.on("close", () => resolve())
    stream.on("error", reject)
    stream.end(body)
  })
}

async function uploadFile(client: SFTPWrapper, path: string, file: string) {
  await pipeline(createReadStream(file), client.createWriteStream(path, { mode: 0o644 }))
}

function proc(value: string) {
  const text = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return text || "builder-app"
}

function pm2(input: { name: string; root: string; shell: string; port: number; vars: Record<string, string> }) {
  return `module.exports = ${JSON.stringify(
    {
      apps: [
        {
          name: input.name,
          cwd: input.root,
          script: "bash",
          args: ["-lc", input.shell],
          interpreter: "none",
          autorestart: true,
          watch: false,
          time: true,
          env: {
            ...input.vars,
            PORT: String(input.port),
            HOST: "0.0.0.0",
            NODE_ENV: "production",
            BUN_ENV: "production",
          },
        },
      ],
    },
    null,
    2,
  )}
`
}

async function step(conn: Client, root: string, command: string, logs: string[]) {
  logs.push(`$ cd ${root} && ${command}`)
  return exec(conn, `cd ${shell(root)} && ${command}`, logs)
}

function fail(err: unknown, input: { logs: string[]; promotion?: z.infer<typeof BuilderState.Promotion> }) {
  const msg = err instanceof Error ? err.message : String(err)
  return Object.assign(new Error(msg), input)
}

function app(input: { current?: z.infer<typeof BuilderState.Supervisor>; target?: z.infer<typeof BuilderState.Supervisor> }) {
  return input.target?.name ?? input.current?.name ?? "builder-app"
}

function cmd(name: string) {
  return {
    start: `npx --yes pm2@latest start .opencode/pm2.config.cjs --only ${name} --update-env`,
    stop: `npx --yes pm2@latest delete ${name}`,
    save: "npx --yes pm2@latest save --force",
    status: `npx --yes pm2@latest describe ${name}`,
  }
}

export namespace ProviderRemote {
  export async function deploy(input: z.input<typeof DeployInput>) {
    const body = DeployInput.parse(input)
    const logs = [`Connecting to ${body.host}:${body.port} as ${body.user}`]
    const conn = await connect(body)
    const url = `http://${body.host}:${body.publicPort}`
    let promotion: z.infer<typeof BuilderState.Promotion> | undefined

    try {
      const root = body.path.replace(/\/+$/, "") || "/"
      const layout = BuilderState.Layout.parse({
        root,
        releases: join(root, "releases"),
        current: join(root, "current"),
        shared: join(root, "shared"),
      })
      const dir = join(layout.releases, body.release.id)
      const info = BuilderState.RemoteRelease.parse({
        id: body.release.id,
        releaseID: body.release.releaseID,
        sessionID: body.release.sessionID,
        title: body.release.title,
        shareURL: body.release.shareURL,
        path: dir,
        archive: join(dir, body.archive.name),
        host: body.host,
        url,
        publicPort: body.publicPort,
        branch: body.release.branch,
        commit: body.release.commit,
        createdAt: Date.now(),
      })
      logs.push(`Created ${body.archive.name} from ${body.archive.count} files in ${body.archive.root}`)
      logs.push(`Archive size: ${body.archive.size} bytes`)
      logs.push(`Detected runtime package manager: ${body.runtime.pm}`)
      logs.push(`Detected install command: ${body.runtime.install}`)
      logs.push(`Detected runtime source: ${body.runtime.detected ?? "unknown"}`)
      if (body.runtime.build) logs.push(`Detected build command: ${body.runtime.build}`)
      logs.push(`Detected start command: ${body.runtime.start}`)
      logs.push(`Supervisor contract: pm2 app=${body.runtime.supervisor.name} file=${body.runtime.supervisor.file}`)
      if (Object.keys(body.vars).length) {
        logs.push(`Resolved ${Object.keys(body.vars).length} deploy vars${body.environmentID ? ` from environment ${body.environmentID}` : ""}`)
      }
      const item = parse(
        await exec(
          conn,
          `if [ -f ${shell(join(layout.shared, "promotion.json"))} ]; then cat ${shell(join(layout.shared, "promotion.json"))}; elif [ -f ${shell(join(layout.current, "release.json"))} ]; then cat ${shell(join(layout.current, "release.json"))}; fi`,
          logs,
        ),
      )
      const link = (await exec(conn, `if [ -L ${shell(layout.current)} ]; then readlink ${shell(layout.current)}; fi`, logs)).trim() || undefined
      const prev = previous({
        current: item,
        link,
      })
      promotion = BuilderState.Promotion.parse({
        layout,
        previous: prev,
        current: info,
      })
      if (prev) logs.push(`Found active release ${prev.id}`)
      await exec(conn, `mkdir -p ${shell(root)} ${shell(layout.releases)} ${shell(layout.shared)} ${shell(dir)} ${shell(join(dir, ".opencode"))}`, logs)
      const ftp = await sftp(conn)
      await uploadFile(ftp, info.archive!, body.archive.file)
      await upload(
        ftp,
        join(dir, body.runtime.supervisor.file),
        pm2({
          name: body.runtime.supervisor.name,
          root: dir,
          shell: body.runtime.start,
          port: body.publicPort,
          vars: body.vars,
        }),
        0o600,
      )
      await upload(ftp, join(dir, "release.json"), JSON.stringify(info, null, 2))
      logs.push(`Uploaded release ${body.release.id} to ${dir}`)
      await exec(conn, `tar -xzf ${shell(info.archive!)} -C ${shell(dir)}`, logs)
      await exec(conn, `rm -f ${shell(info.archive!)}`, logs)
      logs.push(`Unpacked project archive into ${dir}`)
      await step(conn, dir, "test -f package.json", logs)
      await step(conn, dir, body.runtime.install, logs)
      if (body.runtime.build) await step(conn, dir, body.runtime.build, logs)
      await step(conn, dir, `${body.runtime.supervisor.stop} >/dev/null 2>&1 || true`, logs)
      await exec(
        conn,
        `ln -sfn ${shell(dir)} ${shell(join(root, ".next"))} && mv -Tf ${shell(join(root, ".next"))} ${shell(layout.current)}`,
        logs,
        )
      logs.push(prev ? `Promoted ${body.release.id} over ${prev.id}` : `Promoted initial release ${body.release.id}`)
      if (prev?.compose) {
        await exec(conn, `docker compose -f ${shell(prev.compose)} down --remove-orphans >/dev/null 2>&1 || true`, logs)
      }
      await step(conn, layout.current, body.runtime.supervisor.start, logs)
      await step(conn, layout.current, body.runtime.supervisor.save, logs)
      const meta = await step(conn, layout.current, `npx --yes pm2@latest jlist`, logs)
      const sup = (() => {
        try {
          const rows = JSON.parse(meta) as Array<{ name?: string; pid?: number; pm2_env?: { status?: string } }>
          const item = rows.find((entry) => entry.name === body.runtime.supervisor.name)
          return BuilderState.Supervisor.parse({
            name: body.runtime.supervisor.name,
            pid: item?.pid,
            status:
              item?.pm2_env?.status === "online"
                ? "running"
                : item?.pm2_env?.status === "stopped"
                  ? "stopped"
                  : "starting",
          })
        } catch {
          return BuilderState.Supervisor.parse({
            name: body.runtime.supervisor.name,
            status: "starting",
          })
        }
      })()
      await step(conn, layout.current, body.runtime.supervisor.status, logs)
      const current = BuilderState.RemoteRelease.parse({
        ...info,
        promotedAt: Date.now(),
      })
      const next = BuilderState.Promotion.parse({
        ...promotion,
        current,
      })
      promotion = next
      await upload(ftp, join(dir, "release.json"), JSON.stringify(current, null, 2))
      await upload(ftp, join(layout.shared, "promotion.json"), JSON.stringify(next, null, 2))
      return DeployResponse.parse({
        remote: current,
        promotion: next,
        shareURL: body.release.shareURL,
        logs,
        supervisor: sup,
      })
    } catch (err) {
      throw fail(err, { logs, promotion })
    } finally {
      conn.end()
    }
  }

  export async function rollback(input: z.input<typeof RollbackInput>) {
    const body = RollbackInput.parse(input)
    const logs = [`Connecting to ${body.host}:${body.port} as ${body.user}`]
    const conn = await connect(body)
    const name = app({ current: body.current.supervisor, target: body.target.supervisor })
    const pm = cmd(name)
    let promotion = body.current.promotion

    try {
      const root = body.current.promotion.layout.root
      const dir = body.target.remote.path
      const prev = body.current.promotion.current
      logs.push(`Rolling back ${prev.id} to ${body.target.remote.id}`)
      if (body.reason) logs.push(`Reason: ${body.reason}`)
      await exec(conn, `test -d ${shell(dir)}`, logs)
      await exec(conn, `mkdir -p ${shell(root)} ${shell(body.current.promotion.layout.shared)}`, logs)
      await exec(conn, `if [ -L ${shell(body.current.promotion.layout.current)} ] || [ -d ${shell(body.current.promotion.layout.current)} ]; then cd ${shell(body.current.promotion.layout.current)} && ${pm.stop} >/dev/null 2>&1 || true; fi`, logs)
      await exec(
        conn,
        `ln -sfn ${shell(dir)} ${shell(join(root, ".next"))} && mv -Tf ${shell(join(root, ".next"))} ${shell(body.current.promotion.layout.current)}`,
        logs,
      )
      if (prev.compose) {
        await exec(conn, `docker compose -f ${shell(prev.compose)} down --remove-orphans >/dev/null 2>&1 || true`, logs)
      }
      await step(conn, body.current.promotion.layout.current, pm.start, logs)
      await step(conn, body.current.promotion.layout.current, pm.save, logs)
      const meta = await step(conn, body.current.promotion.layout.current, `npx --yes pm2@latest jlist`, logs)
      const sup = (() => {
        try {
          const rows = JSON.parse(meta) as Array<{ name?: string; pid?: number; pm2_env?: { status?: string } }>
          const item = rows.find((entry) => entry.name === name)
          return BuilderState.Supervisor.parse({
            name,
            pid: item?.pid,
            status:
              item?.pm2_env?.status === "online"
                ? "running"
                : item?.pm2_env?.status === "stopped"
                  ? "stopped"
                  : "starting",
          })
        } catch {
          return BuilderState.Supervisor.parse({
            name,
            status: "starting",
          })
        }
      })()
      await step(conn, body.current.promotion.layout.current, pm.status, logs)
      const current = BuilderState.RemoteRelease.parse({
        ...body.target.remote,
        promotedAt: Date.now(),
      })
      promotion = BuilderState.Promotion.parse({
        layout: body.current.promotion.layout,
        previous: prev,
        current,
      })
      const ftp = await sftp(conn)
      await upload(ftp, join(current.path, "release.json"), JSON.stringify(current, null, 2))
      await upload(ftp, join(body.current.promotion.layout.shared, "promotion.json"), JSON.stringify(promotion, null, 2))
      return RollbackResponse.parse({
        remote: current,
        promotion,
        logs,
        supervisor: sup,
      })
    } catch (err) {
      throw fail(err, { logs, promotion })
    } finally {
      conn.end()
    }
  }
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
        summary: "Execute remote builder deploy",
        description: "Run the SSH deploy steps for a builder release whose environment, archive, and runtime were already resolved server-side.",
        operationId: "provider.deploy",
        responses: {
          200: {
            description: "Remote deployment result",
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
        return c.json(await ProviderRemote.deploy(c.req.valid("json")))
      },
    )
    .post(
      "/:providerID/rollback",
      describeRoute({
        summary: "Execute remote builder rollback",
        description: "Run the SSH rollback steps for a builder deploy using previously recorded promotion metadata.",
        operationId: "provider.rollback",
        responses: {
          200: {
            description: "Remote rollback result",
            content: {
              "application/json": {
                schema: resolver(RollbackResponse),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ providerID: ProviderID.zod })),
      validator("json", RollbackInput),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        if (providerID !== ProviderID.githubCopilot) {
          throw new HTTPException(404, { message: `Unsupported provider workflow: ${providerID}` })
        }
        return c.json(await ProviderRemote.rollback(c.req.valid("json")))
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
