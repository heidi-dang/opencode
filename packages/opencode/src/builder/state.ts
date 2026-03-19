import path from "path"
import z from "zod"
import { ulid } from "ulid"
import { BuilderSecret } from "@/builder/secret"
import { Storage } from "@/storage/storage"
import { Instance } from "@/project/instance"
import { SessionID } from "@/session/schema"
import { PtyID } from "@/pty/schema"

export namespace BuilderState {
  export const Annotation = z.object({
    id: z.string(),
    file: z.string(),
    note: z.string(),
    start: z.number().int().positive().optional(),
    end: z.number().int().positive().optional(),
    createdAt: z.number(),
  })

  export const Environment = z.object({
    id: z.string(),
    name: z.string(),
    branch: z.string().optional(),
    host: z.string().optional(),
    url: z.string().optional(),
    vars: z.record(z.string(), BuilderSecret.Ref).default({}),
    createdAt: z.number(),
    updatedAt: z.number(),
  })

  const LegacyEnvironment = Environment.extend({
    vars: BuilderSecret.Vars,
  })

  export const Artifact = z.object({
    id: z.string().optional(),
    key: z.string().optional(),
    path: z.string().optional(),
    url: z.string().optional(),
    hash: z.string().optional(),
    size: z.number().int().nonnegative().optional(),
  })

  export const Runtime = z.object({
    entry: z.string().optional(),
    target: z.string().optional(),
    platform: z.string().optional(),
    arch: z.string().optional(),
    node: z.string().optional(),
    bun: z.string().optional(),
    cmd: z.string().optional(),
  })

  export const Layout = z.object({
    root: z.string(),
    releases: z.string(),
    current: z.string(),
    shared: z.string(),
  })

  export const RemoteRelease = z.object({
    id: z.string(),
    releaseID: z.string().optional(),
    sessionID: SessionID.zod.optional(),
    title: z.string().optional(),
    shareURL: z.string().optional(),
    path: z.string(),
    compose: z.string().optional(),
    site: z.string().optional(),
    archive: z.string().optional(),
    host: z.string().optional(),
    url: z.string().optional(),
    publicPort: z.number().int().positive().optional(),
    branch: z.string().optional(),
    commit: z.string().optional(),
    createdAt: z.number(),
    promotedAt: z.number().optional(),
  })

  export const Promotion = z.object({
    layout: Layout,
    previous: RemoteRelease.optional(),
    current: RemoteRelease,
  })

  export const Release = z.object({
    id: z.string(),
    sessionID: SessionID.zod,
    title: z.string(),
    shareURL: z.string().optional(),
    environmentID: z.string().optional(),
    branch: z.string().optional(),
    commit: z.string().optional(),
    artifact: Artifact.optional(),
    runtime: Runtime.optional(),
    remote: RemoteRelease.optional(),
    deployedAt: z.number().optional(),
    createdAt: z.number(),
  })

  export const Revision = z.object({
    id: z.string(),
    parentID: z.string().optional(),
    seq: z.number().int().positive().optional(),
    source: z.enum(["release", "rollback", "manual"]).default("release"),
  })

  export const Supervisor = z.object({
    ptyID: PtyID.zod.optional(),
    pid: z.number().int().positive().optional(),
    name: z.string().optional(),
    status: z.enum(["idle", "starting", "running", "stopped", "failed"]).optional(),
  })

  export const Deploy = z.object({
    id: z.string(),
    releaseID: z.string().optional(),
    environmentID: z.string().optional(),
    host: z.string(),
    path: z.string(),
    url: z.string(),
    status: z.enum(["running", "ready", "failed"]),
    logs: z.array(z.string()),
    branch: z.string().optional(),
    commit: z.string().optional(),
    revision: Revision.optional(),
    supervisor: Supervisor.optional(),
    promotion: Promotion.optional(),
    createdAt: z.number(),
    updatedAt: z.number().optional(),
    readyAt: z.number().optional(),
  })

  export const Rollback = z.object({
    id: z.string(),
    environmentID: z.string().optional(),
    releaseID: z.string().optional(),
    deployID: z.string().optional(),
    fromDeployID: z.string().optional(),
    toDeployID: z.string().optional(),
    status: z.enum(["running", "ready", "failed"]),
    reason: z.string().optional(),
    logs: z.array(z.string()).default([]),
    createdAt: z.number(),
  })

  export const Preview = z.object({
    ptyID: PtyID.zod.optional(),
    shell: z.string().optional(),
    url: z.string().optional(),
    status: z.enum(["idle", "running", "exited", "error"]),
    startedAt: z.number().optional(),
  })

  export const State = z.object({
    id: z.string(),
    projectID: z.string(),
    directory: z.string(),
    title: z.string(),
    sessionID: SessionID.zod.optional(),
    providerID: z.string().optional(),
    modelID: z.string().optional(),
    agent: z.string().optional(),
    options: z
      .object({
        temperature: z.number().optional(),
        topK: z.number().optional(),
        topP: z.number().optional(),
      })
      .optional(),
    prompt: z.string().optional(),
    environmentID: z.string().optional(),
    environments: z.array(Environment).default([]),
    preview: Preview.default({ status: "idle" }),
    releases: z.array(Release).default([]),
    deploys: z.array(Deploy).default([]),
    rollbacks: z.array(Rollback).default([]),
    annotations: z.array(Annotation).default([]),
    createdAt: z.number(),
    updatedAt: z.number(),
  })

  const LegacyState = State.extend({
    environments: z.array(LegacyEnvironment).default([]),
  })

  export type State = z.infer<typeof State>

  function key() {
    return ["builder", Instance.project.id]
  }

  function now() {
    return Date.now()
  }

  function selected(state: State) {
    return state.environments.find((item) => item.id === state.environmentID) ?? state.environments[0]
  }

  function locals(vars: Record<string, z.infer<typeof BuilderSecret.Ref>>) {
    return Object.values(vars).flatMap((ref) => (ref.source === "local" ? [ref.id] : []))
  }

  function used(state: State) {
    return new Set(state.environments.flatMap((env) => locals(env.vars)))
  }

  function normalize(state: State) {
    const item = selected(state)
    return State.parse({
      ...state,
      environmentID: item?.id,
    })
  }

  function init(): State {
    const ts = now()
    return {
      id: `bld_${Instance.project.id}`,
      projectID: Instance.project.id,
      directory: Instance.directory,
      title: Instance.project.name ?? path.basename(Instance.directory) ?? "Builder",
      preview: {
        status: "idle",
      },
      environments: [],
      releases: [],
      deploys: [],
      rollbacks: [],
      annotations: [],
      createdAt: ts,
      updatedAt: ts,
    }
  }

  async function migrate(state: z.infer<typeof LegacyState>) {
    return normalize({
      ...state,
      environments: await Promise.all(
        state.environments.map(async (env) => ({
          ...env,
          vars: await BuilderSecret.vars(env.vars),
        })),
      ),
    })
  }

  export async function get() {
    const value = await Storage.read<unknown>(key()).catch(() => undefined)
    if (!value) {
      const next = init()
      await Storage.write(key(), next)
      return next
    }
    const state = State.safeParse(value)
    if (state.success) return normalize(state.data)
    const legacy = LegacyState.safeParse(value)
    if (!legacy.success) {
      const next = init()
      await Storage.write(key(), next)
      return next
    }
    const next = await migrate(legacy.data)
    await Storage.write(key(), next)
    return next
  }

  export async function write(next: State) {
    const value = normalize({
      ...next,
      projectID: Instance.project.id,
      directory: Instance.directory,
      updatedAt: now(),
    })
    await Storage.write(key(), value)
    return value
  }

  export async function update(fn: (draft: State) => void) {
    const draft = structuredClone(await get())
    fn(draft)
    return write(draft)
  }

  export async function session(input: { sessionID: SessionID; providerID?: string; modelID?: string; agent?: string }) {
    return update((draft) => {
      draft.sessionID = input.sessionID
      if (input.providerID) draft.providerID = input.providerID
      if (input.modelID) draft.modelID = input.modelID
      if (input.agent) draft.agent = input.agent
    })
  }

  export async function prompt(input: {
    prompt: string
    providerID: string
    modelID: string
    agent: string
    options?: {
      temperature?: number
      topK?: number
      topP?: number
    }
  }) {
    return update((draft) => {
      draft.prompt = input.prompt
      draft.providerID = input.providerID
      draft.modelID = input.modelID
      draft.agent = input.agent
      draft.options = input.options
    })
  }

  export async function preview(input: z.infer<typeof Preview>) {
    return update((draft) => {
      draft.preview = Preview.parse(input)
    })
  }

  export async function environment(input: {
    name: string
    branch?: string
    host?: string
    url?: string
    vars?: z.input<typeof BuilderSecret.References>
  }) {
    const ts = now()
    const item = Environment.parse({
      id: `env_${ulid()}`,
      name: input.name,
      branch: input.branch,
      host: input.host,
      url: input.url,
      vars: await BuilderSecret.refs(input.vars),
      createdAt: ts,
      updatedAt: ts,
    })
    await update((draft) => {
      draft.environments.unshift(item)
      if (!draft.environmentID) draft.environmentID = item.id
    })
    return item
  }

  export async function environmentUpdate(input: {
    id: string
    name?: string
    branch?: string
    host?: string
    url?: string
    vars?: z.input<typeof BuilderSecret.References>
  }) {
    const ts = now()
    const vars = input.vars ? await BuilderSecret.refs(input.vars) : undefined
    let item: z.infer<typeof Environment> | undefined
    let prev: z.infer<typeof Environment> | undefined
    const next = await update((draft) => {
      draft.environments = draft.environments.map((env) => {
        if (env.id !== input.id) return env
        prev = env
        item = Environment.parse({
          ...env,
          name: input.name ?? env.name,
          branch: input.branch ?? env.branch,
          host: input.host ?? env.host,
          url: input.url ?? env.url,
          vars: vars ?? env.vars,
          updatedAt: ts,
        })
        return item
      })
    })
    if (prev && item && vars) {
      const keep = used(next)
      await Promise.all(
        locals(prev.vars)
          .filter((id) => !keep.has(id))
          .map((id) => BuilderSecret.remove({ id })),
      )
    }
    return item
  }

  export async function environmentDelete(input: { id: string }) {
    let item: z.infer<typeof Environment> | undefined
    const next = await update((draft) => {
      item = draft.environments.find((env) => env.id === input.id)
      draft.environments = draft.environments.filter((env) => env.id !== input.id)
      if (draft.environmentID === input.id) draft.environmentID = draft.environments[0]?.id
    })
    if (!item) return
    const keep = used(next)
    await Promise.all(
      locals(item.vars)
        .filter((id) => !keep.has(id))
        .map((id) => BuilderSecret.remove({ id })),
    )
    return item
  }

  export async function environmentSelect(input: { id?: string }) {
    let item: z.infer<typeof Environment> | undefined
    await update((draft) => {
      item = input.id
        ? draft.environments.find((env) => env.id === input.id)
        : draft.environments[0]
      draft.environmentID = item?.id
    })
    return item
  }

  export async function release(input: {
    sessionID: SessionID
    title: string
    shareURL?: string
    environmentID?: string
    branch?: string
    commit?: string
    artifact?: z.input<typeof Artifact>
    runtime?: z.input<typeof Runtime>
    remote?: z.input<typeof RemoteRelease>
    deployedAt?: number
  }) {
    const item = Release.parse({
      id: `rel_${ulid()}`,
      sessionID: input.sessionID,
      title: input.title,
      shareURL: input.shareURL,
      environmentID: input.environmentID,
      branch: input.branch,
      commit: input.commit,
      artifact: input.artifact,
      runtime: input.runtime,
      remote: input.remote,
      deployedAt: input.deployedAt,
      createdAt: now(),
    })
    await update((draft) => {
      draft.releases.unshift(item)
      draft.releases = draft.releases.slice(0, 20)
    })
    return item
  }

  export async function deploy(input: {
    releaseID?: string
    environmentID?: string
    host: string
    path: string
    url: string
    status: "running" | "ready" | "failed"
    logs: string[]
    branch?: string
    commit?: string
    revision?: z.input<typeof Revision>
    supervisor?: z.input<typeof Supervisor>
    promotion?: z.input<typeof Promotion>
    readyAt?: number
  }) {
    const ts = now()
    const item = Deploy.parse({
      id: `dep_${ulid()}`,
      releaseID: input.releaseID,
      environmentID: input.environmentID,
      host: input.host,
      path: input.path,
      url: input.url,
      status: input.status,
      logs: input.logs,
      branch: input.branch,
      commit: input.commit,
      revision: input.revision,
      supervisor: input.supervisor,
      promotion: input.promotion,
      createdAt: ts,
      updatedAt: ts,
      readyAt: input.readyAt,
    })
    await update((draft) => {
      draft.deploys.unshift(item)
      draft.deploys = draft.deploys.slice(0, 20)
    })
    return item
  }

  export async function rollback(input: {
    environmentID?: string
    releaseID?: string
    deployID?: string
    fromDeployID?: string
    toDeployID?: string
    status: "running" | "ready" | "failed"
    reason?: string
    logs?: string[]
  }) {
    const item = Rollback.parse({
      id: `rbk_${ulid()}`,
      environmentID: input.environmentID,
      releaseID: input.releaseID,
      deployID: input.deployID,
      fromDeployID: input.fromDeployID,
      toDeployID: input.toDeployID,
      status: input.status,
      reason: input.reason,
      logs: input.logs,
      createdAt: now(),
    })
    await update((draft) => {
      draft.rollbacks.unshift(item)
      draft.rollbacks = draft.rollbacks.slice(0, 50)
    })
    return item
  }

  export async function annotate(input: { file: string; note: string; start?: number; end?: number }) {
    const item = Annotation.parse({
      id: `ann_${ulid()}`,
      file: input.file,
      note: input.note,
      start: input.start,
      end: input.end,
      createdAt: now(),
    })
    await update((draft) => {
      draft.annotations.unshift(item)
      draft.annotations = draft.annotations.slice(0, 50)
    })
    return item
  }
}