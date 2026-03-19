/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"

const description = "Lookup an exact symbol in the local repo index and return signature, docs, callers, callees, and source path metadata."

export default tool({
  description,
  args: {
    symbol: tool.schema.string().describe("Exact symbol name to lookup"),
  },
  async execute(args, ctx) {
    const script = `${ctx.worktree}/.opencode/tool/repo_index.py`
    const cmd = ["symbol", "--root", ctx.worktree, "--symbol", args.symbol]
    const py3 = Bun.spawnSync({ cmd: ["python3", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py3.exitCode === 0) return Buffer.from(py3.stdout).toString("utf8")

    const py = Bun.spawnSync({ cmd: ["python", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py.exitCode === 0) return Buffer.from(py.stdout).toString("utf8")

    const err = [Buffer.from(py3.stderr).toString("utf8"), Buffer.from(py.stderr).toString("utf8")]
      .filter(Boolean)
      .join("\n")
    throw new Error(`repo_symbol_lookup failed\n${err}`)
  },
})
