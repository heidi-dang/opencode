import { Filesystem } from "@/util/filesystem"
import { Glob } from "@/util/glob"
import path from "path"
import { Ripgrep } from "@/file/ripgrep"
import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"

function db(sessionID: SessionID) {
  return path.join(path.dirname(HeidiState.plan(sessionID)), "knowledge.jsonl")
}

type SymbolItem = {
  file: string
  line: number
  name: string
  kind: "function" | "class" | "const" | "type"
}

function parse(file: string, text: string) {
  const out = [] as SymbolItem[]
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fn = line.match(/^\s*(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)/)
    if (fn) out.push({ file, line: i + 1, name: fn[3], kind: "function" })
    const cls = line.match(/^\s*(export\s+)?class\s+([A-Za-z0-9_]+)/)
    if (cls) out.push({ file, line: i + 1, name: cls[2], kind: "class" })
    const cst = line.match(/^\s*(export\s+)?const\s+([A-Za-z0-9_]+)/)
    if (cst) out.push({ file, line: i + 1, name: cst[2], kind: "const" })
    const typ = line.match(/^\s*(export\s+)?type\s+([A-Za-z0-9_]+)/)
    if (typ) out.push({ file, line: i + 1, name: typ[2], kind: "type" })
  }
  return out
}

export namespace HeidiRetrieval {
  export async function rebuild(sessionID: SessionID, root: string) {
    const files = await Glob.scan("**/*.{ts,tsx,js,jsx,md}", {
      cwd: root,
      absolute: true,
      include: "file",
      dot: true,
    })
    const lines = await Promise.all(
      files.map(async (file) => {
        const text = await Filesystem.readText(file).catch(() => "")
        const rel = path.relative(root, file)
        return parse(rel, text)
      }),
    )
    const flat = lines.flat()
    await Filesystem.write(
      db(sessionID),
      flat
        .map((item) => JSON.stringify({ type: "symbol", ...item }))
        .join("\n")
        .concat("\n"),
    )
    return flat.length
  }

  export async function update(sessionID: SessionID, root: string, files: string[]) {
    const target = db(sessionID)
    const old = await Filesystem.readText(target).catch(() => "")
    const rows = old
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as any)
      .filter((row) => !files.includes(row.file))

    const add = await Promise.all(
      files.map(async (file) => {
        const full = path.isAbsolute(file) ? file : path.join(root, file)
        const text = await Filesystem.readText(full).catch(() => "")
        const rel = path.relative(root, full)
        return parse(rel, text)
      }),
    )
    const next = [...rows, ...add.flat().map((item) => ({ type: "symbol", ...item }))]
    await Filesystem.write(target, next.map((item) => JSON.stringify(item)).join("\n") + "\n")
  }

  export async function query(sessionID: SessionID, root: string, query: string) {
    const index = await Filesystem.readText(db(sessionID)).catch(() => "")
    const symbols = index
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as any)
      .filter((row) => row.name?.toLowerCase().includes(query.toLowerCase()) || row.file.includes(query))
      .slice(0, 20)

    if (symbols.length > 0) return { kind: "symbol", result: symbols }

    const files = await Glob.scan(`**/*${query}*`, {
      cwd: root,
      absolute: false,
      include: "file",
      dot: true,
    })
    if (files.length > 0) return { kind: "path", result: files.slice(0, 20) }

    const rg = await Ripgrep.filepath()
    const p = Bun.spawn([rg, "-n", "-m", "20", "--no-messages", query, root], { stdout: "pipe", stderr: "pipe" })
    const out = await new Response(p.stdout).text()
    await p.exited
    return {
      kind: "text",
      result: out.split("\n").filter(Boolean).slice(0, 20),
    }
  }
}
