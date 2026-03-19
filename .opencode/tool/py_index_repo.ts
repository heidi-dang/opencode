/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"

const description =
  "Python-backed repo index query entrypoint. Use this for heavy repository analysis with structured output from a local SQLite/JSONL index."

export default tool({
  description,
  args: {
    query_mode: tool.schema.enum(["symbol", "file", "text"]).default("symbol").describe("Query mode"),
    path_glob: tool.schema.string().default("**/*").describe("Filter paths using a glob pattern"),
    symbol: tool.schema.string().default("").describe("Symbol for symbol mode"),
    text: tool.schema.string().default("").describe("Text query for text mode"),
    limit: tool.schema.number().default(20).describe("Maximum number of results"),
  },
  async execute(args, ctx) {
    if (args.query_mode === "symbol" && !args.symbol.trim()) {
      throw new Error("py_index_repo requires a non-empty symbol when query_mode=symbol")
    }
    if (args.query_mode === "text" && !args.text.trim()) {
      throw new Error("py_index_repo requires non-empty text when query_mode=text")
    }

    const script = `${ctx.worktree}/.opencode/tool/repo_index.py`
    const cmd = [
      "query",
      "--root",
      ctx.worktree,
      "--mode",
      args.query_mode,
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
    throw new Error(`py_index_repo failed\n${err}`)
  },
})
