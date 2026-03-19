import fs from "fs/promises"
import path from "path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { ulid } from "ulid"
import { build } from "@/builder/archive"
import { BuilderSecret } from "@/builder/secret"
import { BuilderState } from "@/builder/state"
import { deploy as runtimeDeploy, preview, release as runtimeRelease } from "@/builder/runtime"
import { Session } from "@/session"
import { SessionPrompt } from "@/session/prompt"
import { Instance } from "@/project/instance"
import { Pty } from "@/pty"
import { Shell } from "@/shell/shell"
import { ModelID, ProviderID } from "@/provider/schema"
import { SessionID } from "@/session/schema"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { ProviderRemote } from "./provider"

const EnsureSessionInput = z.object({
  providerID: ProviderID.zod.optional(),
  modelID: ModelID.zod.optional(),
  agent: z.string().optional(),
})

const BuildInput = z.object({
  prompt: z.string().min(1),
  providerID: ProviderID.zod,
  modelID: ModelID.zod,
  agent: z.string().default("build"),
  variant: z.string().optional(),
  temperature: z.number().optional(),
  topK: z.number().optional(),
  topP: z.number().optional(),
})

const PreviewStartInput = z.object({
  command: z.string().optional(),
  url: z.string().url().optional(),
})

const ReleaseInput = z.object({
  sessionID: SessionID.zod,
  title: z.string().min(1),
  shareURL: z.string().url().optional(),
})

const DeployInput = z.object({
  environmentID: z.string().optional(),
  releaseID: z.string().optional(),
  sessionID: SessionID.zod.optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).default(22),
  user: z.string().min(1),
  password: z.string().min(1),
  path: z.string().min(1).optional(),
  publicPort: z.number().int().min(1).max(65535).optional(),
})

const DeployResponse = z.object({
  deployID: z.string(),
  revisionID: z.string().optional(),
  releaseID: z.string().optional(),
  host: z.string(),
  port: z.number(),
  path: z.string(),
  publicPort: z.number(),
  url: z.string(),
  shareURL: z.string().optional(),
  sessionID: SessionID.zod.optional(),
  logs: z.array(z.string()),
})

const RollbackInput = z.object({
  environmentID: z.string().optional(),
  releaseID: z.string().optional(),
  deployID: z.string().optional(),
  revisionID: z.string().optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).default(22),
  user: z.string().min(1),
  password: z.string().min(1),
  path: z.string().min(1).optional(),
  publicPort: z.number().int().min(1).max(65535).optional(),
  reason: z.string().min(1).optional(),
})

const RollbackResponse = z.object({
  rollbackID: z.string(),
  deployID: z.string(),
  revisionID: z.string().optional(),
  releaseID: z.string().optional(),
  fromDeployID: z.string().optional(),
  toDeployID: z.string().optional(),
  host: z.string(),
  port: z.number(),
  path: z.string(),
  publicPort: z.number(),
  url: z.string(),
  logs: z.array(z.string()),
})

const AnnotationInput = z.object({
  file: z.string().min(1),
  note: z.string().min(1),
  start: z.number().int().positive().optional(),
  end: z.number().int().positive().optional(),
})

const IDParam = z.object({
  id: z.string().min(1),
})

const EnvironmentInput = z.object({
  name: z.string().min(1),
  branch: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  url: z.string().url().optional(),
  vars: BuilderSecret.References.default({}),
})

const EnvironmentUpdateInput = z.object({
  name: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  url: z.string().url().optional(),
  vars: BuilderSecret.References.optional(),
})

const EnvironmentSelectInput = z.object({
  id: z.string().min(1).optional(),
})

const EnvironmentList = z.object({
  selectedID: z.string().optional(),
  items: z.array(BuilderState.Environment),
})

const SecretInput = z.object({
  value: z.string(),
  label: z.string().min(1).optional(),
})

const BuilderView = BuilderState.State.extend({
  preview: BuilderState.Preview.extend({
    info: Pty.Info.optional(),
  }),
})

async function environments() {
  const state = await BuilderState.get()
  return EnvironmentList.parse({
    selectedID: state.environmentID,
    items: state.environments,
  })
}

async function ensure(input?: z.infer<typeof EnsureSessionInput>) {
  const state = await BuilderState.get()
  if (state.sessionID) {
    await BuilderState.session({
      sessionID: state.sessionID,
      providerID: input?.providerID ?? state.providerID,
      modelID: input?.modelID ?? state.modelID,
      agent: input?.agent ?? state.agent,
    })
    return state.sessionID
  }

  const item = await Session.create({
    title: `${Instance.project.name ?? path.basename(Instance.directory) ?? "Builder"} Builder`,
  })
  await BuilderState.session({
    sessionID: item.id,
    providerID: input?.providerID,
    modelID: input?.modelID,
    agent: input?.agent,
  })
  return item.id
}

async function view() {
  const state = await BuilderState.get()
  const info = state.preview.ptyID ? Pty.get(state.preview.ptyID) : undefined
  return BuilderView.parse({
    ...state,
    preview: {
      ...state.preview,
      info,
    },
  })
}

async function latest(input?: { sessionID?: SessionID }) {
  if (input?.sessionID) return Session.get(input.sessionID)
  for await (const item of Session.list({
    directory: Instance.directory,
    roots: true,
    limit: 1,
  })) {
    return item
  }
}

function env(state: z.infer<typeof BuilderState.State>, id?: string) {
  if (!id) return state.environments.find((item) => item.id === state.environmentID) ?? state.environments[0]
  return state.environments.find((item) => item.id === id)
}

async function vars(item?: z.infer<typeof BuilderState.Environment>) {
  if (!item) return {} as Record<string, string>
  const rows = await Promise.all(
    Object.entries(item.vars).map(async ([key, ref]) => [key, ref, await BuilderSecret.resolve(ref)] as const),
  )
  return Object.fromEntries(
    rows.map(([key, ref, value]) => {
      if (!value) throw new Error(`Builder secret ${key} could not be resolved from ${ref.redacted}`)
      if (value.mode === "external") {
        throw new Error(`Builder secret ${key} uses ${ref.redacted} and must be materialized before VPS deploy`)
      }
      return [key, value.value]
    }),
  )
}

function root(item?: z.infer<typeof BuilderState.RemoteRelease>) {
  if (!item?.path) return
  return path.posix.dirname(path.posix.dirname(item.path))
}

function current(state: z.infer<typeof BuilderState.State>, envID?: string) {
  return state.deploys.find(
    (item) => item.status === "ready" && (!envID || item.environmentID === envID) && item.promotion,
  )
}

function release(state: z.infer<typeof BuilderState.State>, input: { releaseID?: string; sessionID?: SessionID }) {
  if (input.releaseID) return state.releases.find((item) => item.id === input.releaseID)
  if (input.sessionID) return state.releases.find((item) => item.sessionID === input.sessionID)
  return state.releases[0]
}

function target(state: z.infer<typeof BuilderState.State>, input: z.infer<typeof RollbackInput>, envID?: string) {
  if (input.deployID) return state.deploys.find((item) => item.id === input.deployID && item.status === "ready")
  if (input.revisionID) {
    return state.deploys.find(
      (item) => item.status === "ready" && item.revision?.id === input.revisionID && (!envID || item.environmentID === envID),
    )
  }
  if (input.releaseID) {
    return state.deploys.find(
      (item) => item.status === "ready" && item.releaseID === input.releaseID && (!envID || item.environmentID === envID),
    )
  }
}

function seq(state: z.infer<typeof BuilderState.State>, envID?: string) {
  const item = state.deploys.find((entry) => entry.status === "ready" && (!envID || entry.environmentID === envID) && entry.revision?.seq)
  return (item?.revision?.seq ?? 0) + 1
}

function rev(
  state: z.infer<typeof BuilderState.State>,
  envID: string | undefined,
  source: "release" | "rollback",
  parent?: z.infer<typeof BuilderState.Deploy>,
) {
  return BuilderState.Revision.parse({
    id: `rev_${ulid()}`,
    parentID: parent?.revision?.id,
    seq: seq(state, envID),
    source,
  })
}

function fail(input: unknown) {
  return input instanceof Error && "logs" in input
    ? (input as Error & { logs?: string[]; promotion?: z.infer<typeof BuilderState.Promotion> })
    : undefined
}

export const BuilderRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get builder state",
        description: "Get the current builder project, session, preview, release, deploy, and annotation state.",
        operationId: "builder.get",
        responses: {
          200: {
            description: "Builder state",
            content: {
              "application/json": {
                schema: resolver(BuilderView),
              },
            },
          },
        },
      }),
      async (c) => c.json(await view()),
    )
    .post(
      "/session",
      describeRoute({
        summary: "Ensure builder session",
        description: "Create or return the dedicated builder session for this project.",
        operationId: "builder.session",
        responses: {
          200: {
            description: "Builder state",
            content: {
              "application/json": {
                schema: resolver(BuilderView),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", EnsureSessionInput.optional()),
      async (c) => {
        await ensure(c.req.valid("json") ?? undefined)
        return c.json(await view())
      },
    )
    .post(
      "/build",
      describeRoute({
        summary: "Start builder run",
        description: "Send a real async prompt into the dedicated builder session.",
        operationId: "builder.build",
        responses: {
          200: {
            description: "Builder state",
            content: {
              "application/json": {
                schema: resolver(BuilderView),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", BuildInput),
      async (c) => {
        const body = c.req.valid("json")
        const sessionID = await ensure(body)
        await BuilderState.prompt(body)
        SessionPrompt.prompt({
          sessionID,
          agent: body.agent,
          variant: body.variant,
          model: {
            providerID: body.providerID,
            modelID: body.modelID,
          },
          options: {
            temperature: body.temperature,
            topK: body.topK,
            topP: body.topP,
          },
          parts: [{ type: "text", text: body.prompt }],
        }).catch(() => undefined)
        return c.json(await view())
      },
    )
    .get(
      "/environment",
      describeRoute({
        summary: "List builder environments",
        description: "List deployment environments and the currently selected builder environment.",
        operationId: "builder.environment.list",
        responses: {
          200: {
            description: "Builder environments",
            content: {
              "application/json": {
                schema: resolver(EnvironmentList),
              },
            },
          },
        },
      }),
      async (c) => c.json(await environments()),
    )
    .post(
      "/environment",
      describeRoute({
        summary: "Create builder environment",
        description: "Create a named deployment environment with secret references for builder deploys.",
        operationId: "builder.environment.create",
        responses: {
          200: {
            description: "Created environment",
            content: {
              "application/json": {
                schema: resolver(BuilderState.Environment),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", EnvironmentInput),
      async (c) => c.json(await BuilderState.environment(c.req.valid("json"))),
    )
    .patch(
      "/environment/:id",
      describeRoute({
        summary: "Update builder environment",
        description: "Update a named builder deployment environment without storing raw secret values in builder state.",
        operationId: "builder.environment.update",
        responses: {
          200: {
            description: "Updated environment",
            content: {
              "application/json": {
                schema: resolver(BuilderState.Environment),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", IDParam),
      validator("json", EnvironmentUpdateInput),
      async (c) => {
        const param = c.req.valid("param")
        const body = c.req.valid("json")
        const item = await BuilderState.environmentUpdate({
          id: param.id,
          ...body,
        })
        if (!item) throw new HTTPException(404, { message: `Builder environment ${param.id} not found` })
        return c.json(item)
      },
    )
    .delete(
      "/environment/:id",
      describeRoute({
        summary: "Delete builder environment",
        description: "Delete a builder deployment environment and keep the selected environment pointer valid.",
        operationId: "builder.environment.delete",
        responses: {
          200: {
            description: "Delete result",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", IDParam),
      async (c) => {
        const param = c.req.valid("param")
        const item = await BuilderState.environmentDelete(param)
        if (!item) throw new HTTPException(404, { message: `Builder environment ${param.id} not found` })
        return c.json(true)
      },
    )
    .post(
      "/environment/select",
      describeRoute({
        summary: "Select builder environment",
        description: "Select the active named deployment environment used by builder deploy flows.",
        operationId: "builder.environment.select",
        responses: {
          200: {
            description: "Selected environment",
            content: {
              "application/json": {
                schema: resolver(BuilderState.Environment),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("json", EnvironmentSelectInput.optional()),
      async (c) => {
        const body = c.req.valid("json") ?? {}
        const item = await BuilderState.environmentSelect(body)
        if (!item) throw new HTTPException(404, { message: "No builder environment available to select" })
        return c.json(item)
      },
    )
    .get(
      "/secret",
      describeRoute({
        summary: "List builder secrets",
        description: "List locally managed builder secrets as redacted metadata only.",
        operationId: "builder.secret.list",
        responses: {
          200: {
            description: "Builder secrets",
            content: {
              "application/json": {
                schema: resolver(z.array(BuilderSecret.LocalMeta)),
              },
            },
          },
        },
      }),
      async (c) => c.json(await BuilderSecret.list()),
    )
    .post(
      "/secret",
      describeRoute({
        summary: "Create builder secret",
        description: "Store a local builder secret and return only its redacted metadata for later environment references.",
        operationId: "builder.secret.create",
        responses: {
          200: {
            description: "Stored secret",
            content: {
              "application/json": {
                schema: resolver(BuilderSecret.LocalMeta),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", SecretInput),
      async (c) => c.json(await BuilderSecret.create(c.req.valid("json"))),
    )
    .patch(
      "/secret/:id",
      describeRoute({
        summary: "Update builder secret",
        description: "Replace a local builder secret value while continuing to return only redacted metadata.",
        operationId: "builder.secret.update",
        responses: {
          200: {
            description: "Updated secret",
            content: {
              "application/json": {
                schema: resolver(BuilderSecret.LocalMeta),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", IDParam),
      validator("json", SecretInput),
      async (c) => {
        const param = c.req.valid("param")
        const body = c.req.valid("json")
        const item = await BuilderSecret.update({
          id: param.id,
          ...body,
        })
        if (!item) throw new HTTPException(404, { message: `Builder secret ${param.id} not found` })
        return c.json(item)
      },
    )
    .delete(
      "/secret/:id",
      describeRoute({
        summary: "Delete builder secret",
        description: "Delete a locally managed builder secret from the secret store.",
        operationId: "builder.secret.delete",
        responses: {
          200: {
            description: "Delete result",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", IDParam),
      async (c) => {
        const param = c.req.valid("param")
        const state = await BuilderState.get()
        const used = state.environments.some((env) => Object.values(env.vars).some((ref) => ref.source === "local" && ref.id === param.id))
        if (used) {
          throw new HTTPException(400, { message: `Builder secret ${param.id} is still referenced by an environment` })
        }
        const ok = await BuilderSecret.remove(param)
        if (!ok) throw new HTTPException(404, { message: `Builder secret ${param.id} not found` })
        return c.json(true)
      },
    )
    .post(
      "/preview/start",
      describeRoute({
        summary: "Start builder preview",
        description: "Start or reconnect to the builder preview process in a PTY.",
        operationId: "builder.preview.start",
        responses: {
          200: {
            description: "Builder state",
            content: {
              "application/json": {
                schema: resolver(BuilderView),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", PreviewStartInput.optional()),
      async (c) => {
        const body = c.req.valid("json") ?? {}
        const state = await BuilderState.get()
        if (state.preview.ptyID && Pty.get(state.preview.ptyID)) return c.json(await view())

        const found = await preview(Instance.directory, {
          start: Instance.project.commands?.start,
        })
        const shell = body.command ?? found?.shell
        if (!shell) throw new HTTPException(400, { message: "No preview command found for this project" })

        const info = await Pty.create({
          title: `${Instance.project.name ?? "Builder"} Preview`,
          command: Shell.preferred(),
          args: ["-lc", shell],
          cwd: Instance.directory,
        })

        await BuilderState.preview({
          ptyID: info.id,
          shell,
          url: body.url ?? found?.url,
          status: "running",
          startedAt: Date.now(),
        })

        return c.json(await view())
      },
    )
    .post(
      "/preview/stop",
      describeRoute({
        summary: "Stop builder preview",
        description: "Stop the current builder preview PTY and retain its configuration.",
        operationId: "builder.preview.stop",
        responses: {
          200: {
            description: "Builder state",
            content: {
              "application/json": {
                schema: resolver(BuilderView),
              },
            },
          },
        },
      }),
      async (c) => {
        const state = await BuilderState.get()
        if (state.preview.ptyID) await Pty.remove(state.preview.ptyID)
        await BuilderState.preview({
          ptyID: undefined,
          shell: state.preview.shell,
          url: state.preview.url,
          status: "idle",
          startedAt: state.preview.startedAt,
        })
        return c.json(await view())
      },
    )
    .post(
      "/release",
      describeRoute({
        summary: "Record builder release",
        description: "Record a publishable builder release tied to a real session.",
        operationId: "builder.release",
        responses: {
          200: {
            description: "Recorded release",
            content: {
              "application/json": {
                schema: resolver(BuilderState.Release),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", ReleaseInput),
      async (c) => c.json(await BuilderState.release(c.req.valid("json"))),
    )
    .post(
      "/deploy",
      describeRoute({
        summary: "Deploy builder release",
        description: "Resolve the active builder environment server-side, package the selected release, and deploy it over SSH.",
        operationId: "builder.deploy",
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
      validator("json", DeployInput),
      async (c) => {
        const body = c.req.valid("json")
        const state = await BuilderState.get()
        const item = env(state, body.environmentID)
        if (body.environmentID && !item) {
          throw new HTTPException(404, { message: `Builder environment not found: ${body.environmentID}` })
        }

        const base = await latest({ sessionID: body.sessionID })
        const rel = release(state, {
          releaseID: body.releaseID,
          sessionID: body.sessionID ?? base?.id,
        })
        if (body.releaseID && !rel) {
          throw new HTTPException(404, { message: `Builder release not found: ${body.releaseID}` })
        }

        const session = rel?.sessionID
          ? await Session.get(rel.sessionID).then((row) => (row.share?.url ? row : Session.share(row.id).then(() => Session.get(row.id))))
          : base
            ? base.share?.url
              ? base
              : await Session.share(base.id).then(() => Session.get(base.id))
            : undefined

        const host = body.host ?? item?.host ?? rel?.remote?.host
        if (!host) {
          throw new HTTPException(400, { message: "No deploy host found. Provide host or select an environment with a host." })
        }

        const prev = current(state, item?.id)
        const dir = body.path ?? root(prev?.promotion?.current) ?? root(rel?.remote)
        if (!dir) {
          throw new HTTPException(400, { message: "No deploy path found. Provide path for the first deploy to this target." })
        }

        const pub = body.publicPort ?? prev?.promotion?.current.publicPort ?? rel?.remote?.publicPort ?? 8080
        const envvars = await vars(item)
        const archive = await build(Instance.worktree, {
          name: runtimeRelease({ sessionID: session?.id }),
        })

        try {
          const runtime = await runtimeDeploy(Instance.directory, {
            start: Instance.project.commands?.start,
            runtime: rel?.runtime,
            name: Instance.project.name ?? Instance.project.id,
          })
          if (!runtime.start || !runtime.supervisor) {
            throw new HTTPException(400, { message: "No production runtime found for this project. Add a start command or recorded release runtime." })
          }

          const out = await ProviderRemote.deploy({
            host,
            port: body.port,
            user: body.user,
            password: body.password,
            path: dir,
            publicPort: pub,
            environmentID: item?.id,
            release: {
              id: `rmt_${ulid()}`,
              releaseID: rel?.id,
              sessionID: session?.id,
              title: rel?.title ?? `${Instance.project.name ?? "Copilot Builder"} deployment`,
              shareURL: session?.share?.url,
              branch: rel?.branch,
              commit: rel?.commit,
            },
            archive,
            runtime: {
              pm: runtime.pm,
              install: runtime.install,
              build: runtime.build,
              start: runtime.start,
              detected: runtime.detected,
              supervisor: runtime.supervisor,
            },
            vars: envvars,
          })

          const itemRev = rev(state, item?.id, "release", prev)
          const dep = await BuilderState.deploy({
            releaseID: rel?.id,
            environmentID: item?.id,
            host,
            path: out.remote.path,
            url: out.remote.url ?? `http://${host}:${pub}`,
            status: "ready",
            logs: out.logs,
            branch: rel?.branch,
            commit: rel?.commit,
            revision: itemRev,
            supervisor: out.supervisor,
            promotion: out.promotion,
            readyAt: out.remote.promotedAt,
          })

          if (rel?.id) {
            await BuilderState.update((draft) => {
              draft.releases = draft.releases.map((entry) => {
                if (entry.id !== rel.id) return entry
                return BuilderState.Release.parse({
                  ...entry,
                  remote: out.remote,
                  deployedAt: out.remote.promotedAt,
                })
              })
            })
          }

          return c.json({
            deployID: dep.id,
            revisionID: dep.revision?.id,
            releaseID: rel?.id,
            host,
            port: body.port,
            path: out.remote.path,
            publicPort: out.remote.publicPort ?? pub,
            url: out.remote.url ?? `http://${host}:${pub}`,
            shareURL: out.shareURL,
            sessionID: session?.id,
            logs: [...out.logs, `Recorded deploy ${dep.id}`],
          })
        } catch (err) {
          const bad = fail(err)
          await BuilderState.deploy({
            releaseID: rel?.id,
            environmentID: item?.id,
            host,
            path: dir,
            url: `http://${host}:${pub}`,
            status: "failed",
            logs: bad?.logs ?? [],
            branch: rel?.branch,
            commit: rel?.commit,
            promotion: bad?.promotion,
          })
          throw err
        } finally {
          await fs.rm(archive.tmp, { recursive: true, force: true }).catch(() => undefined)
        }
      },
    )
    .post(
      "/rollback",
      describeRoute({
        summary: "Rollback builder deploy",
        description: "Rollback the active builder deployment to a previous release or deploy revision using stored deploy metadata.",
        operationId: "builder.rollback",
        responses: {
          200: {
            description: "Rollback result",
            content: {
              "application/json": {
                schema: resolver(RollbackResponse),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("json", RollbackInput),
      async (c) => {
        const body = c.req.valid("json")
        const state = await BuilderState.get()
        const item = env(state, body.environmentID)
        if (body.environmentID && !item) {
          throw new HTTPException(404, { message: `Builder environment not found: ${body.environmentID}` })
        }

        const cur = current(state, item?.id)
        if (!cur?.promotion) {
          throw new HTTPException(404, { message: "No active builder deploy found for rollback." })
        }

        const pick = target(state, body, item?.id)
        const rel = body.releaseID ? state.releases.find((entry) => entry.id === body.releaseID) : undefined
        const prev = !pick && !body.releaseID ? cur.promotion.previous : undefined
        const remote = pick?.promotion?.current ?? rel?.remote ?? prev
        if (!remote) {
          throw new HTTPException(404, { message: "No rollback target found. Select a previous release or deploy revision." })
        }
        if (remote.path === cur.promotion.current.path) {
          throw new HTTPException(400, { message: "Rollback target is already active." })
        }

        const host = body.host ?? cur.host ?? item?.host ?? remote.host
        if (!host) {
          throw new HTTPException(400, { message: "No rollback host found. Provide host or select an environment with a host." })
        }
        const pub = body.publicPort ?? remote.publicPort ?? cur.promotion.current.publicPort ?? 8080

        try {
          const out = await ProviderRemote.rollback({
            host,
            port: body.port,
            user: body.user,
            password: body.password,
            reason: body.reason,
            current: {
              deployID: cur.id,
              releaseID: cur.releaseID,
              promotion: cur.promotion,
              supervisor: cur.supervisor,
            },
            target: {
              deployID: pick?.id,
              releaseID: pick?.releaseID ?? rel?.id ?? remote.releaseID,
              revisionID: pick?.revision?.id,
              remote: BuilderState.RemoteRelease.parse({
                ...remote,
                host,
                url: remote.url ?? `http://${host}:${pub}`,
                publicPort: remote.publicPort ?? pub,
              }),
              supervisor: pick?.supervisor ?? cur.supervisor,
            },
          })

          const roll = await BuilderState.rollback({
            environmentID: item?.id,
            releaseID: pick?.releaseID ?? rel?.id ?? remote.releaseID,
            deployID: pick?.id,
            fromDeployID: cur.id,
            toDeployID: pick?.id,
            status: "ready",
            reason: body.reason,
            logs: out.logs,
          })
          const itemRev = rev(state, item?.id, "rollback", cur)
          const dep = await BuilderState.deploy({
            releaseID: pick?.releaseID ?? rel?.id ?? remote.releaseID,
            environmentID: item?.id,
            host,
            path: out.remote.path,
            url: out.remote.url ?? `http://${host}:${pub}`,
            status: "ready",
            logs: out.logs,
            branch: pick?.branch ?? rel?.branch ?? cur.branch,
            commit: pick?.commit ?? rel?.commit ?? cur.commit,
            revision: itemRev,
            supervisor: out.supervisor,
            promotion: out.promotion,
            readyAt: out.remote.promotedAt,
          })

          const releaseID = pick?.releaseID ?? rel?.id ?? remote.releaseID
          if (releaseID) {
            await BuilderState.update((draft) => {
              draft.releases = draft.releases.map((entry) => {
                if (entry.id !== releaseID) return entry
                return BuilderState.Release.parse({
                  ...entry,
                  remote: out.remote,
                  deployedAt: out.remote.promotedAt,
                })
              })
            })
          }

          return c.json({
            rollbackID: roll.id,
            deployID: dep.id,
            revisionID: dep.revision?.id,
            releaseID,
            fromDeployID: cur.id,
            toDeployID: pick?.id,
            host,
            port: body.port,
            path: out.remote.path,
            publicPort: out.remote.publicPort ?? pub,
            url: out.remote.url ?? `http://${host}:${pub}`,
            logs: [...out.logs, `Recorded rollback ${roll.id}`, `Recorded deploy ${dep.id}`],
          })
        } catch (err) {
          const bad = fail(err)
          await BuilderState.rollback({
            environmentID: item?.id,
            releaseID: pick?.releaseID ?? rel?.id ?? remote.releaseID,
            deployID: pick?.id,
            fromDeployID: cur.id,
            toDeployID: pick?.id,
            status: "failed",
            reason: body.reason,
            logs: bad?.logs ?? [],
          })
          throw err
        }
      },
    )
    .post(
      "/annotation",
      describeRoute({
        summary: "Add builder annotation",
        description: "Store a builder annotation for later guided edits.",
        operationId: "builder.annotation",
        responses: {
          200: {
            description: "Recorded annotation",
            content: {
              "application/json": {
                schema: resolver(BuilderState.Annotation),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", AnnotationInput),
      async (c) => c.json(await BuilderState.annotate(c.req.valid("json"))),
    )
)