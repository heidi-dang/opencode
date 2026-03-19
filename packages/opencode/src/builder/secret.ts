import path from "path"
import z from "zod"
import { ulid } from "ulid"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import { Filesystem } from "@/util/filesystem"

export namespace BuilderSecret {
  const EnvInput = z.object({
    source: z.literal("env"),
    name: z.string(),
  })

  const FileInput = z.object({
    source: z.literal("file"),
    path: z.string(),
    key: z.string().optional(),
  })

  const ExternalInput = z.object({
    source: z.literal("external"),
    uri: z.string(),
  })

  const LocalInput = z.object({
    source: z.literal("local"),
    value: z.string(),
    label: z.string().optional(),
  })

  export const Env = z.object({
    source: z.literal("env"),
    name: z.string(),
    redacted: z.string(),
    updatedAt: z.number(),
  })

  export const File = z.object({
    source: z.literal("file"),
    path: z.string(),
    key: z.string().optional(),
    redacted: z.string(),
    updatedAt: z.number(),
  })

  export const External = z.object({
    source: z.literal("external"),
    uri: z.string(),
    redacted: z.string(),
    updatedAt: z.number(),
  })

  export const Local = z.object({
    source: z.literal("local"),
    id: z.string(),
    redacted: z.string(),
    updatedAt: z.number(),
  })

  export const LocalMeta = Local.extend({
    createdAt: z.number(),
  })

  export const Ref = z.discriminatedUnion("source", [Env, File, External, Local])

  export const Remote = z.discriminatedUnion("source", [EnvInput, FileInput, ExternalInput])

  export const Input = z.discriminatedUnion("source", [EnvInput, FileInput, ExternalInput, LocalInput])

  export const Value = z.object({
    value: z.string(),
    redacted: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })

  const Store = z.record(z.string(), Value).default({})

  export const Var = z.union([z.string(), Input, Ref])
  export const Vars = z.record(z.string(), Var).default({})
  export const Reference = z.union([Remote, Ref])
  export const References = z.record(z.string(), Reference).default({})

  export const Resolved = z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("value"),
      value: z.string(),
    }),
    z.object({
      mode: z.literal("external"),
      uri: z.string(),
    }),
  ])

  function now() {
    return Date.now()
  }

  function file() {
    return path.join(Global.Path.data, "builder", "secret", `${Instance.project.id}.json`)
  }

  function mask(value: string) {
    if (!value) return "local:empty"
    return `local:${value.length} chars`
  }

  function base(p: string) {
    return path.basename(p) || p
  }

  function strip(value: string) {
    if (
      (value.startsWith(`"`) && value.endsWith(`"`)) ||
      (value.startsWith(`'`) && value.endsWith(`'`))
    ) {
      return value.slice(1, -1)
    }
    return value
  }

  function pick(data: unknown, key: string) {
    return key
      .split(".")
      .reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined), data)
  }

  function envmap(text: string) {
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.replace(/^export\s+/, ""))
        .flatMap((line) => {
          const idx = line.indexOf("=")
          if (idx <= 0) return []
          return [[line.slice(0, idx).trim(), strip(line.slice(idx + 1).trim())] as const]
        }),
    )
  }

  async function load() {
    return Store.parse(await Filesystem.readJson(file()).catch(() => ({})))
  }

  async function save(data: z.infer<typeof Store>) {
    await Filesystem.writeJson(file(), data, 0o600)
  }

  function meta(id: string, value: z.infer<typeof Value>) {
    return LocalMeta.parse({
      source: "local",
      id,
      redacted: value.redacted ?? mask(value.value),
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    })
  }

  async function store(value: string, label?: string) {
    const ts = now()
    const id = `sec_${ulid()}`
    const data = await load()
    data[id] = {
      value,
      redacted: label ? `local:${label}` : mask(value),
      createdAt: ts,
      updatedAt: ts,
    }
    await save(data)
    return meta(id, data[id])
  }

  export async function put(input: z.input<typeof Var>): Promise<z.infer<typeof Ref>> {
    const ref = Ref.safeParse(input)
    if (ref.success) return ref.data
    if (typeof input === "string") return store(input)
    const next = Input.parse(input)
    const ts = now()
    if (next.source === "local") {
      return Local.parse(await store(next.value, next.label))
    }
    if (next.source === "env") {
      return Env.parse({
        source: "env",
        name: next.name,
        redacted: `env:${next.name}`,
        updatedAt: ts,
      })
    }
    if (next.source === "file") {
      return File.parse({
        source: "file",
        path: next.path,
        key: next.key,
        redacted: next.key ? `file:${base(next.path)}#${next.key}` : `file:${base(next.path)}`,
        updatedAt: ts,
      })
    }
    return External.parse({
      source: "external",
      uri: next.uri,
      redacted: `external:${next.uri}`,
      updatedAt: ts,
    })
  }

  export async function vars(input?: z.input<typeof Vars>) {
    if (!input) return {} as Record<string, z.infer<typeof Ref>>
    return Object.fromEntries(await Promise.all(Object.entries(Vars.parse(input)).map(async ([key, value]) => [key, await put(value)])))
  }

  export async function refs(input?: z.input<typeof References>) {
    if (!input) return {} as Record<string, z.infer<typeof Ref>>
    return Object.fromEntries(await Promise.all(Object.entries(References.parse(input)).map(async ([key, value]) => [key, await put(value)])))
  }

  export async function list() {
    return Object.entries(await load())
      .map(([id, value]) => meta(id, value))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  export async function create(input: { value: string; label?: string }) {
    return store(input.value, input.label)
  }

  export async function update(input: { id: string; value: string; label?: string }) {
    const data = await load()
    const item = data[input.id]
    if (!item) return
    data[input.id] = {
      value: input.value,
      redacted: input.label ? `local:${input.label}` : mask(input.value),
      createdAt: item.createdAt,
      updatedAt: now(),
    }
    await save(data)
    return meta(input.id, data[input.id])
  }

  export async function remove(input: { id: string }) {
    const data = await load()
    if (!data[input.id]) return false
    delete data[input.id]
    await save(data)
    return true
  }

  export async function drop(input: z.input<typeof Ref>) {
    const ref = Ref.parse(input)
    if (ref.source !== "local") return
    await remove({ id: ref.id })
  }

  export async function resolve(input: z.input<typeof Ref>) {
    const ref = Ref.parse(input)
    if (ref.source === "env") {
      const value = process.env[ref.name]
      return value ? Resolved.parse({ mode: "value", value }) : undefined
    }
    if (ref.source === "external") {
      return Resolved.parse({ mode: "external", uri: ref.uri })
    }
    if (ref.source === "local") {
      const data = await load()
      const item = data[ref.id]
      return item ? Resolved.parse({ mode: "value", value: item.value }) : undefined
    }
    if (!ref.key) {
      return Resolved.parse({ mode: "value", value: await Filesystem.readText(ref.path) })
    }
    if (ref.path.endsWith(".json")) {
      const value = pick(await Filesystem.readJson(ref.path), ref.key)
      return typeof value === "string" ? Resolved.parse({ mode: "value", value }) : undefined
    }
    const value = envmap(await Filesystem.readText(ref.path))[ref.key]
    return value ? Resolved.parse({ mode: "value", value }) : undefined
  }
}