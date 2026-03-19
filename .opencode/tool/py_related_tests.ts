/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"

const description = "Find tests related to a symbol or file path from the local symbolic repo index."

export default tool({
  description,
  args: {
    target: tool.schema.string().describe("Symbol name or repo-relative file path"),
  },
  async execute(args, ctx) {
    const script = `${ctx.worktree}/.opencode/tool/repo_index.py`
    const cmd = ["tests", "--root", ctx.worktree, "--target", args.target]
    const py3 = Bun.spawnSync({ cmd: ["python3", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py3.exitCode === 0) return Buffer.from(py3.stdout).toString("utf8")

    const py = Bun.spawnSync({ cmd: ["python", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py.exitCode === 0) return Buffer.from(py.stdout).toString("utf8")

    const err = [Buffer.from(py3.stderr).toString("utf8"), Buffer.from(py.stderr).toString("utf8")]
      .filter(Boolean)
      .join("\n")
    throw new Error(`py_related_tests failed\n${err}`)
  },
})
