import path from "path"
import { Filesystem } from "@/util/filesystem"

type Pkg = {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packageManager?: string
  main?: string
}

type Cmd = {
  key?: string
  shell: string
}

export type Preview = {
  shell: string
  url: string
  port: number
}

export type Deploy = {
  pm: string
  install: string
  build?: string
  start?: string
  detected?: string
  supervisor?: {
    kind: "pm2"
    name: string
    file: string
    start: string
    stop: string
    save: string
    status: string
  }
}

type Runtime = {
  cmd?: string
  entry?: string
  target?: string
  node?: string
  bun?: string
}

function stamp() {
  return new Date().toISOString().replace(/[:]/g, "").replace(/\.\d+Z$/, "Z")
}

async function pkg(dir: string) {
  return Filesystem.readJson<Pkg>(path.join(dir, "package.json")).catch(() => undefined)
}

async function pm(dir: string, file?: Pkg) {
  const name = file?.packageManager?.split("@")[0]
  if (name) return name
  if (await Filesystem.exists(path.join(dir, "bun.lockb"))) return "bun"
  if (await Filesystem.exists(path.join(dir, "bun.lock"))) return "bun"
  if (await Filesystem.exists(path.join(dir, "pnpm-lock.yaml"))) return "pnpm"
  if (await Filesystem.exists(path.join(dir, "yarn.lock"))) return "yarn"
  return "npm"
}

function run(name: string, key: string) {
  if (name === "npm") return `${name} run ${key}`
  if (name === "pnpm") return `${name} run ${key}`
  return `${name} ${key}`
}

function q(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function port(text?: string, file?: Pkg) {
  const value = text ?? ""
  const match = /(?:--port|-p|PORT=)\s*(\d{2,5})/.exec(value)
  if (match) return Number(match[1])
  const deps = { ...file?.dependencies, ...file?.devDependencies }
  if (value.includes("vite") || deps.vite) return 5173
  if (value.includes("astro") || deps.astro) return 4321
  return 3000
}

function dev(cmd?: string) {
  const value = cmd?.trim()
  if (!value) return false
  return /(\bdev\b|vite|next dev|nuxt dev|astro dev|svelte-kit|webpack serve|react-scripts start)/i.test(value)
}

function pick(file: Pkg | undefined, key: string): Cmd | undefined {
  const cmd = file?.scripts?.[key]?.trim()
  if (!cmd) return
  return {
    key,
    shell: cmd,
  }
}

function prod(cmd?: string) {
  const value = cmd?.trim()
  if (!value) return false
  return !dev(value)
}

function slug(value: string) {
  const text = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return text || "app"
}

function main(file?: Pkg) {
  const value = file?.main?.trim()
  if (!value) return
  return value
}

function rt(value?: Runtime) {
  const cmd = value?.cmd?.trim()
  if (cmd) return cmd
  const entry = value?.entry?.trim()
  if (!entry) return
  if (value?.target === "bun" || value?.bun) return `bun ${q(entry)}`
  return `node ${q(entry)}`
}

function frame(file: Pkg | undefined, build?: Cmd) {
  const deps = { ...file?.dependencies, ...file?.devDependencies }
  const shell = build?.shell ?? ""
  if (deps.next || /next\s+build/i.test(shell)) return { shell: "npx next start -p $PORT", detected: "framework:next" }
  if (deps.nuxt || /nuxt\s+build/i.test(shell)) return { shell: "node .output/server/index.mjs", detected: "framework:nuxt" }
  if (deps.astro || /astro\s+build/i.test(shell)) {
    return { shell: "npx --yes serve@14 dist -l tcp://0.0.0.0:$PORT", detected: "framework:astro-static" }
  }
  if (deps.vite || /vite\s+build/i.test(shell)) {
    return { shell: "npx --yes serve@14 dist -l tcp://0.0.0.0:$PORT", detected: "framework:vite-static" }
  }
  if (/react-scripts\s+build/i.test(shell)) {
    return { shell: "npx --yes serve@14 build -l tcp://0.0.0.0:$PORT", detected: "framework:react-static" }
  }
}

export async function preview(dir: string, input?: { start?: string }) {
  const file = await pkg(dir)
  const cmd = input?.start?.trim()
  if (dev(cmd)) {
    const value = cmd!
    const num = port(value, file)
    return {
      shell: value,
      port: num,
      url: `http://127.0.0.1:${num}`,
    } satisfies Preview
  }

  const found = pick(file, "dev")
  if (!found) return
  const name = await pm(dir, file)
  const num = port(found.shell, file)
  return {
    shell: run(name, found.key!),
    port: num,
    url: `http://127.0.0.1:${num}`,
  } satisfies Preview
}

export async function deploy(dir: string, input?: { start?: string; runtime?: Runtime; name?: string }) {
  const file = await pkg(dir)
  const name = await pm(dir, file)
  const build = pick(file, "build")
  const start = input?.start?.trim()
  const script = pick(file, "start")
  const found = prod(start)
    ? { shell: start!, detected: "project:start" }
    : rt(input?.runtime)
      ? { shell: rt(input?.runtime)!, detected: "release:runtime" }
      : script?.shell && !dev(script.shell)
        ? { shell: run(name, script.key!), detected: "package:start" }
        : frame(file, build) ?? (main(file) ? { shell: `${name === "bun" ? "bun" : "node"} ${q(main(file)! )}`, detected: "package:main" } : undefined)
  const app = slug(input?.name ?? path.basename(dir) ?? "app")
  return {
    pm: name,
    install: `${name} install`,
    build: build ? run(name, build.key!) : undefined,
    start: found?.shell,
    detected: found?.detected,
    supervisor: found
      ? {
          kind: "pm2",
          name: app,
          file: ".opencode/pm2.config.cjs",
          start: `npx --yes pm2@latest start .opencode/pm2.config.cjs --only ${app} --update-env`,
          stop: `npx --yes pm2@latest delete ${app}`,
          save: "npx --yes pm2@latest save --force",
          status: `npx --yes pm2@latest describe ${app}`,
        }
      : undefined,
  } satisfies Deploy
}

export function release(input?: { sessionID?: string }) {
  const name = input?.sessionID?.trim() || "release"
  return `${name}-${stamp()}`
}