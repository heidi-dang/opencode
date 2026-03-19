/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"

const description =
  "Build the local symbolic repo context index into .opencode/index/symbols.sqlite and .opencode/index/files.jsonl. Run this before querying index-backed tools."

export default tool({
  description,
  args: {
    path_glob: tool.schema.string().default("**/*").describe("Glob pattern for files to index"),
    force: tool.schema.boolean().default(false).describe("Force rebuild even if index appears fresh"),
  },
  async execute(args, ctx) {
    const script = `${ctx.worktree}/.opencode/tool/repo_index.py`
    const cmd = ["--root", ctx.worktree, "--path-glob", args.path_glob, "--force", args.force ? "1" : "0", "build"]
    const py3 = Bun.spawnSync({ cmd: ["python3", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py3.exitCode === 0) return Buffer.from(py3.stdout).toString("utf8")

    const py = Bun.spawnSync({ cmd: ["python", script, ...cmd], cwd: ctx.worktree, stdout: "pipe", stderr: "pipe" })
    if (py.exitCode === 0) return Buffer.from(py.stdout).toString("utf8")

    const err = [Buffer.from(py3.stderr).toString("utf8"), Buffer.from(py.stderr).toString("utf8")]
      .filter(Boolean)
      .join("\n")
    throw new Error(`repo_index_build failed\n${err}`)
  },
})
