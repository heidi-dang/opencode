import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./infinity_loop_off.txt"
import { Process } from "../util/process"
import { Instance } from "../project/instance"

export const InfinityLoopOffTool = Tool.define("infinity_loop_off", {
  description: DESCRIPTION,
  parameters: z.object({}),
  async execute(_params, _ctx) {
    const result = await Process.run(["opencode", "infinity", "stop"], {
      cwd: Instance.worktree,
      nothrow: true,
    })

    if (result.code !== 0) {
      return {
        title: "Infinity Loop Stop Failed",
        metadata: { success: false, code: result.code },
        output: `Failed to stop infinity loop:\n${result.stderr.toString()}`,
      }
    }

    return {
      title: "Infinity Loop Stopped",
      metadata: { success: true, code: 0 },
      output: result.stdout.toString() || "Infinity loop stop signal sent successfully.",
    }
  },
})
