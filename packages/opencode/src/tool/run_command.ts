import z from "zod"
import { Tool } from "./tool"
import { Instance } from "@/project/instance"
import { HeidiExec } from "@/heidi/exec"
import { HeidiState } from "@/heidi/state"
import { Agent } from "@/agent/agent"
import path from "path"

const Profile = z.enum(["read_only", "build", "test", "format", "git_safe", "app_local"])

export const RunCommandTool = Tool.define("run_command", {
  description:
    "Run command with explicit profile and checkpoint-aware ledger logging. Available in EXECUTION and VERIFICATION remediation windows.",
  parameters: z.object({
    command: z.string(),
    profile: Profile,
    cwd: z.string().optional(),
    timeout: z.number().default(120000),
  }),
  async execute(params, ctx) {
    const state = await HeidiState.ensure(ctx.sessionID, "")
    const agentInfo = await Agent.get(ctx.agent)
    const isSubagent = agentInfo?.mode === "subagent"
    const allowed =
      isSubagent ||
      state.fsm_state === "EXECUTION" ||
      state.fsm_state === "VERIFICATION" ||
      params.profile === "read_only"
    if (!allowed) throw new Error(`run_command unavailable in ${state.fsm_state}`)
    await HeidiState.checkPlanDrift(ctx.sessionID)

    const cwd = params.cwd
      ? path.isAbsolute(params.cwd)
        ? params.cwd
        : path.join(Instance.directory, params.cwd)
      : Instance.directory
    const result = await HeidiExec.cmd(ctx.sessionID, {
      cmd: params.command,
      cwd,
      profile: params.profile,
      timeout: params.timeout,
    })

    return {
      title: `${params.profile} exit ${result.code}`,
      metadata: {
        code: result.code,
        ms: result.ms,
      },
      output: result.out,
    }
  },
})
