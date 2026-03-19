import z from "zod"
import { Tool } from "./tool"
import { HeidiExec } from "../heidi/exec"
import { HeidiState } from "../heidi/state"

export const TransactionTool = Tool.define("transaction", {
  description: "Manage explicit multi-file transactions. Group multiple tool calls into an atomic unit with a named checkpoint.",
  parameters: z.object({
    action: z.enum(["begin", "commit", "rollback"]),
    name: z.string().optional().describe("A descriptive name for the transaction (required for begin)"),
    files: z.array(z.string()).optional().describe("Files involved in the transaction (optional)"),
  }),
  async execute(params, ctx) {
    const state = await HeidiState.read(ctx.sessionID)
    
    if (params.action === "begin") {
      if (!params.name) throw new Error("Transaction name is required for 'begin'")
      const checkpointId = await HeidiExec.begin(ctx.sessionID, params.name, params.files ?? [])
      return {
        title: `Transaction Started: ${params.name}`,
        metadata: { checkpointId },
        output: `Started transaction '${params.name}'. Subsquent errors in EXECUTION tools will automatically rollback to this state until 'commit' or 'rollback' is called.`
      }
    }

    if (params.action === "commit") {
      await HeidiExec.commit(ctx.sessionID)
      return {
        title: "Transaction Committed",
        metadata: { checkpointId: "" },
        output: "Successfully committed the transaction. Current state is now the new baseline."
      }
    }

    if (params.action === "rollback") {
      const checkpointId = state.resume.checkpoint_id
      if (!checkpointId) throw new Error("No active transaction to rollback")
      await HeidiExec.rollback(ctx.sessionID, checkpointId)
      await HeidiExec.commit(ctx.sessionID) // Clear the checkpoint reference after rollback
      return {
        title: "Transaction Rolled Back",
        metadata: { checkpointId },
        output: `Successfully rolled back to checkpoint ${checkpointId}.`
      }
    }

    throw new Error(`Unknown transaction action: ${params.action}`)
  }
})
