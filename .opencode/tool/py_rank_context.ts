/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"

const description = "Rank files and symbols for a task description using a local Python-backed context index."

export default tool({
  description,
  args: {
    task_text: tool.schema.string().describe("Natural-language task to rank context for"),
    limit: tool.schema.number().default(15).describe("Maximum ranked files and symbols to return"),
  },
  async execute(args, ctx) {
    const script = `${ctx.worktree}/.opencode/tool/repo_index.py`
    const cmd = ["rank", "--root", ctx.worktree, "--task", args.task_text, "--limit", String(args.limit)]
    const py3 = Bun.spawnSync({ cmd: ["python3", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py3.exitCode === 0) return Buffer.from(py3.stdout).toString("utf8")

    const py = Bun.spawnSync({ cmd: ["python", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py.exitCode === 0) return Buffer.from(py.stdout).toString("utf8")

    const err = [Buffer.from(py3.stderr).toString("utf8"), Buffer.from(py.stderr).toString("utf8")]
      .filter(Boolean)
      .join("\n")
    throw new Error(`py_rank_context failed\n${err}`)
  },
})
