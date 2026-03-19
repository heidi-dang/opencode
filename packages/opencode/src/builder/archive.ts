import fs from "fs/promises"
import path from "path"
import { tmpdir } from "os"
import { FileIgnore } from "@/file/ignore"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"

const DIRS = new Set([
  ".direnv",
  ".devenv",
  ".nuxt",
  ".opencode",
  ".parcel-cache",
  ".playwright",
  ".svelte-kit",
  ".venv",
  ".vercel",
  ".yarn",
  "venv",
])

const FILES = [
  "**/.env",
  "**/.env.local",
  "**/.env.*.local",
  "**/.envrc",
  "**/.secrets*",
  "**/*.key",
  "**/*.pem",
  "**/*.p12",
  "**/*.pfx",
  "**/*.tfstate",
  "**/*.tfstate.*",
  "**/npm-debug.log*",
  "**/pnpm-debug.log*",
  "**/yarn-debug.log*",
  "**/yarn-error.log*",
]

export type Build = {
  file: string
  name: string
  size: number
  root: string
  tmp: string
  count: number
}

function skip(rel: string) {
  if (FileIgnore.match(rel, { extra: FILES })) return true
  return rel.split("/").some((part) => DIRS.has(part))
}

async function list(root: string, dir = "") {
  const cwd = dir ? path.join(root, dir) : root
  const out: string[] = []
  for (const entry of await fs.readdir(cwd, { withFileTypes: true })) {
    const rel = dir ? path.posix.join(dir, entry.name) : entry.name
    if (skip(rel)) continue
    if (entry.isDirectory()) {
      out.push(...(await list(root, rel)))
      continue
    }
    out.push(rel)
  }
  return out
}

export async function build(dir: string, input?: { name?: string }) {
  const root = Filesystem.resolve(dir)
  const tmp = await fs.mkdtemp(path.join(tmpdir(), "opencode-builder-"))
  const name = `${input?.name ?? "project"}.tar.gz`
  const file = path.join(tmp, name)
  const manifest = path.join(tmp, "files.txt")
  const items = await list(root)
  if (items.length === 0) throw new Error(`No project files found to archive in ${root}`)
  await Filesystem.write(manifest, `${items.join("\n")}\n`)
  await Process.run(["tar", "-czf", file, "-T", manifest], { cwd: root })
  return {
    file,
    name,
    size: await Filesystem.size(file),
    root,
    tmp,
    count: items.length,
  } satisfies Build
}