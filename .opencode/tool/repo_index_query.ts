/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"

const description =
  "Query the local symbolic repo index by symbol, file, or text. Uses .opencode/index/symbols.sqlite built by repo_index_build."

export default tool({
  description,
  args: {
    mode: tool.schema.enum(["symbol", "file", "text"]).default("symbol").describe("Query mode"),
    path_glob: tool.schema.string().default("**/*").describe("Filter paths using a glob pattern"),
    symbol: tool.schema.string().default("").describe("Symbol name for symbol mode"),
    text: tool.schema.string().default("").describe("Text query for text mode"),
    limit: tool.schema.number().default(20).describe("Maximum number of results"),
  },
  async execute(args, ctx) {
    if (args.mode === "symbol" && !args.symbol.trim()) {
      throw new Error("repo_index_query requires a non-empty symbol when mode=symbol")
    }
    if (args.mode === "text" && !args.text.trim()) {
      throw new Error("repo_index_query requires non-empty text when mode=text")
    }

    const script = `${ctx.worktree}/.opencode/tool/repo_index.py`
    const cmd = [
      "query",
      "--root",
      ctx.worktree,
      "--mode",
      args.mode,
      "--path-glob",
      args.path_glob,
      "--symbol",
      args.symbol,
      "--text",
      args.text,
      "--limit",
      String(args.limit),
    ]
    const py3 = Bun.spawnSync({ cmd: ["python3", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py3.exitCode === 0) return Buffer.from(py3.stdout).toString("utf8")

    const py = Bun.spawnSync({ cmd: ["python", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py.exitCode === 0) return Buffer.from(py.stdout).toString("utf8")

    const err = [Buffer.from(py3.stderr).toString("utf8"), Buffer.from(py.stderr).toString("utf8")]
      .filter(Boolean)
      .join("\n")
    throw new Error(`repo_index_query failed\n${err}`)
  },
})
