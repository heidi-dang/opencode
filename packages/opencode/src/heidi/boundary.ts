import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import z from "zod"
import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"
import { Mode, FsmState, TaskState } from "./schema"
import { Identifier } from "@/id/id"
import { HeidiVerify } from "./verify"

const allowed = new Set([
  "IDLE->DISCOVERY",
  "DISCOVERY->PLAN_DRAFT",
  "PLAN_DRAFT->PLAN_LOCKED",
  "PLAN_LOCKED->EXECUTION",
  "EXECUTION->VERIFICATION",
  "VERIFICATION->COMPLETE",
  // Allowed regressions
  "PLAN_LOCKED->DISCOVERY",
  "EXECUTION->PLAN_DRAFT",
  "EXECUTION->DISCOVERY",
  "VERIFICATION->EXECUTION",
  "VERIFICATION->PLAN_DRAFT",
  "VERIFICATION->DISCOVERY",
  "COMPLETE->DISCOVERY",
  // Transitions to BLOCKED
  "IDLE->BLOCKED",
  "DISCOVERY->BLOCKED",
  "PLAN_DRAFT->BLOCKED",
  "PLAN_LOCKED->BLOCKED",
  "EXECUTION->BLOCKED",
  "VERIFICATION->BLOCKED",
  "COMPLETE->BLOCKED",
  "BLOCKED->BLOCKED",
])

const StateMode: Record<z.infer<typeof FsmState>, z.infer<typeof Mode>> = {
  IDLE: "PLANNING",
  DISCOVERY: "PLANNING",
  PLAN_DRAFT: "PLANNING",
  PLAN_LOCKED: "PLANNING",
  EXECUTION: "EXECUTION",
  VERIFICATION: "VERIFICATION",
  COMPLETE: "VERIFICATION",
  BLOCKED: "PLANNING",
}

const Empty = z.object({}).default({})

const Request = z.discriminatedUnion("action", [
  z.object({
    run_id: z.string().optional(),
    task_id: SessionID.zod,
    action: z.literal("start"),
    payload: z.object({ objective: z.string().trim().min(1) }),
  }),
  z.object({
    run_id: z.string().optional(),
    task_id: SessionID.zod,
    action: z.literal("set_mode"),
    payload: z.object({ mode: Mode }),
  }),
  z.object({
    run_id: z.string().optional(),
    task_id: SessionID.zod,
    action: z.literal("mark_item"),
    payload: z.object({ id: z.string().min(1), status: z.enum(["todo", "doing", "done", "blocked"]) }),
  }),
  z.object({ run_id: z.string().optional(), task_id: SessionID.zod, action: z.literal("lock_plan"), payload: Empty }),
  z.object({
    run_id: z.string().optional(),
    task_id: SessionID.zod,
    action: z.literal("reopen_plan"),
    payload: z.object({ reason: z.string().trim().min(1) }),
  }),
  z.object({
    run_id: z.string().optional(),
    task_id: SessionID.zod,
    action: z.literal("begin_execution"),
    payload: Empty,
  }),
  z.object({
    run_id: z.string().optional(),
    task_id: SessionID.zod,
    action: z.literal("request_verification"),
    payload: Empty,
  }),
  z.object({
    run_id: z.string().optional(),
    task_id: SessionID.zod,
    action: z.literal("block"),
    payload: z.object({ reason: z.string().trim().min(1) }),
  }),
  z.object({ run_id: z.string().optional(), task_id: SessionID.zod, action: z.literal("complete"), payload: Empty }),
  z.object({
    run_id: z.string().optional(),
    task_id: SessionID.zod,
    action: z.literal("add_items"),
    payload: z.object({
      items: z
        .array(
          z.object({
            label: z.string().min(1),
            category: z.enum(["Modify", "New", "Delete", "Verify"]),
          }),
        )
        .min(1),
    }),
  }),
])

const Response = z.object({
  ok: z.boolean(),
  fsm_state: FsmState,
  mode: Mode,
  task_json_version: z.number(),
  artifacts: z
    .object({
      task_json: z.string(),
      task_md: z.string(),
      implementation_plan: z.string(),
      verification: z.string(),
      resume: z.string(),
      knowledge: z.string(),
      exists: z.record(z.string(), z.boolean()),
    })
    .optional(),
  error: z.string().nullable().optional(),
})

export namespace HeidiBoundary {
  export const Event = {
    Updated: BusEvent.define(
      "task_boundary.updated",
      z.object({
        task_id: SessionID.zod,
        mode: Mode,
        fsm_state: FsmState,
      }),
    ),
  }

  export const Input = Request
  export const ClientInput = z.discriminatedUnion("action", [
    z.object({
      action: z.literal("start"),
      payload: z.object({ objective: z.string().trim().min(1) }),
      run_id: z.string().optional(),
    }),
    z.object({ action: z.literal("set_mode"), payload: z.object({ mode: Mode }), run_id: z.string().optional() }),
    z.object({
      action: z.literal("mark_item"),
      payload: z.object({ id: z.string().min(1), status: z.enum(["todo", "doing", "done", "blocked"]) }),
      run_id: z.string().optional(),
    }),
    z.object({ action: z.literal("lock_plan"), payload: Empty, run_id: z.string().optional() }),
    z.object({
      action: z.literal("reopen_plan"),
      payload: z.object({ reason: z.string().trim().min(1) }),
      run_id: z.string().optional(),
    }),
    z.object({ action: z.literal("begin_execution"), payload: Empty, run_id: z.string().optional() }),
    z.object({ action: z.literal("request_verification"), payload: Empty, run_id: z.string().optional() }),
    z.object({
      action: z.literal("block"),
      payload: z.object({ reason: z.string().trim().min(1) }),
      run_id: z.string().optional(),
    }),
    z.object({ action: z.literal("complete"), payload: Empty, run_id: z.string().optional() }),
    z.object({
      action: z.literal("add_items"),
      payload: z.object({
        items: z
          .array(
            z.object({
              label: z.string().min(1),
              category: z.enum(["Modify", "New", "Delete", "Verify"]),
            }),
          )
          .min(1),
      }),
      run_id: z.string().optional(),
    }),
  ])
  export const Output = Response

  function move(state: TaskState, next: z.infer<typeof FsmState>) {
    const edge = `${state.fsm_state}->${next}`
    if (!allowed.has(edge)) throw new Error(`Invalid transition ${edge}`)
    state.fsm_state = next
    state.mode = StateMode[next]
  }

  function requirePlan(state: TaskState) {
    const missing = [] as string[]
    if (!state.plan.path) missing.push("plan.path")
    if (!state.objective.text) missing.push("objective.text")
    if (missing.length) throw new Error(`Plan incomplete: ${missing.join(", ")}`)
  }

  async function lock(task_id: SessionID) {
    const state = await HeidiState.read(task_id)
    if (state.fsm_state === "DISCOVERY") {
      move(state, "PLAN_DRAFT")
      await HeidiState.write(task_id, state)
    }
    requirePlan(state)
    await HeidiState.setPlanHash(task_id)
    const next = await HeidiState.read(task_id)
    next.objective.locked = true
    next.plan.locked = true
    move(next, "PLAN_LOCKED")
    next.last_successful_step = "lock_plan"
    next.next_transition = "PLAN_LOCKED->EXECUTION"
    next.resume.next_step = "begin_execution"
    await HeidiState.write(task_id, next)
    await HeidiState.updateResume(task_id)
    return next
  }

  async function execution(task_id: SessionID) {
    const state = await HeidiState.read(task_id)
    if (state.fsm_state === "DISCOVERY" || state.fsm_state === "PLAN_DRAFT") {
      const plan = await HeidiState.planStatus(task_id)
      if (!plan.ready) {
        throw new Error(
          `begin_execution requires a complete implementation plan. Missing sections: ${plan.missing.join(", ")}. Next action: lock_plan after updating the plan.`,
        )
      }
      await lock(task_id)
    }
    const next = await HeidiState.read(task_id)
    if (next.fsm_state !== "PLAN_LOCKED") {
      throw new Error(`begin_execution requires PLAN_LOCKED. Current state: ${next.fsm_state}. Next action: lock_plan`)
    }
    await HeidiState.checkPlanDrift(task_id)
    move(next, "EXECUTION")
    next.last_successful_step = "begin_execution"
    next.next_transition = "EXECUTION->VERIFICATION"
    next.resume.next_step = "EXECUTION"
    await HeidiState.write(task_id, next)
    await HeidiState.updateResume(task_id)
    return next
  }

  export async function apply(input: z.input<typeof Request>) {
    const req = Request.parse(input)
    const state = await HeidiState.ensure(req.task_id, req.action === "start" ? req.payload.objective : "")

    // Track telemetry
    if (!state.telemetry) state.telemetry = { tool_calls_count: 0 }
    state.telemetry.tool_calls_count = (state.telemetry.tool_calls_count || 0) + 1

    if (req.action === "start") {
      if (!req.payload.objective.trim()) {
        throw new Error("Cannot start a task with an empty objective.")
      }
      if (state.fsm_state === "COMPLETE") {
        // Transparently reset for a fresh task run
        state.checklist = []
        state.plan.locked = false
        state.objective.locked = false
        state.plan.amendments = []
        state.last_successful_step = "restart"
      }
      state.run_id = req.run_id || state.run_id || Identifier.ascending("tool")
      state.objective.text = req.payload.objective
      state.telemetry = { tool_calls_count: 1, started_at: new Date().toISOString() }
      move(state, "DISCOVERY")
      state.last_successful_step = "start"
      state.next_transition = "DISCOVERY->PLAN_DRAFT"
      state.resume.next_step = "write_plan"
      state.block_reason = null
    }

    if (req.action === "set_mode") {
      if (state.mode !== req.payload.mode) {
        throw new Error(`set_mode is invalid; mode is derived from fsm_state ${state.fsm_state}`)
      }
    }

    if (req.action === "mark_item") {
      const found = state.checklist.find((item) => item.id === req.payload.id)
      if (!found) throw new Error(`Checklist item not found: ${req.payload.id}`)
      found.status = req.payload.status
      state.last_successful_step = `mark_item:${req.payload.id}`
    }

    if (req.action === "add_items") {
      for (const item of req.payload.items) {
        state.checklist.push({
          id: `manual-${state.checklist.length}`,
          label: item.label,
          status: "todo",
          category: item.category,
          priority: "medium",
        })
      }
      state.last_successful_step = "add_items"
    }

    if (req.action === "lock_plan") {
      const next = await lock(req.task_id)
      const artifacts = await HeidiState.files(req.task_id)
      await Bus.publish(Event.Updated, { task_id: req.task_id, mode: next.mode, fsm_state: next.fsm_state })
      return Response.parse({
        ok: true,
        fsm_state: next.fsm_state,
        mode: next.mode,
        task_json_version: 1,
        artifacts,
        error: null,
      })
    }

    if (req.action === "reopen_plan") {
      state.plan.locked = false
      state.objective.locked = false
      state.plan.amendments.push({
        id: Identifier.ascending("tool"),
        reason: req.payload.reason,
        timestamp: new Date().toISOString(),
      })
      move(state, "DISCOVERY")
      state.last_successful_step = "reopen_plan"
      state.next_transition = "DISCOVERY->PLAN_DRAFT"
      state.resume.next_step = "write_plan"
    }

    if (req.action === "begin_execution") {
      const next = await execution(req.task_id)
      const artifacts = await HeidiState.files(req.task_id)
      await Bus.publish(Event.Updated, { task_id: req.task_id, mode: next.mode, fsm_state: next.fsm_state })
      return Response.parse({
        ok: true,
        fsm_state: next.fsm_state,
        mode: next.mode,
        task_json_version: 1,
        artifacts,
        error: null,
      })
    }

    if (req.action === "request_verification") {
      await HeidiVerify.preflight(req.task_id)
      move(state, "VERIFICATION")
      state.last_successful_step = "request_verification"
      state.next_transition = "VERIFICATION->COMPLETE"
      state.resume.next_step = "VERIFICATION"
    }

    if (req.action === "block") {
      state.block_reason = req.payload.reason
      move(state, "BLOCKED")
      state.last_successful_step = "block"
      state.next_transition = "BLOCKED"
      state.resume.next_step = "blocked"
    }

    if (req.action === "complete") {
      if (state.fsm_state !== "VERIFICATION") throw new Error("Task can only complete from VERIFICATION")
      await HeidiVerify.gate(req.task_id)
      const verify = await HeidiState.readVerification(req.task_id)
      if (!verify) throw new Error("Verification must exist before completion")
      if (verify.status !== "pass") throw new Error("Verification must pass before completion")
      if (state.telemetry?.started_at) {
        state.telemetry.duration_ms = Date.now() - new Date(state.telemetry.started_at).getTime()
      }
      move(state, "COMPLETE")
      state.last_successful_step = "complete"
      state.next_transition = "NONE"
      state.resume.next_step = "done"
    }

    await HeidiState.write(req.task_id, state)
    await HeidiState.updateResume(req.task_id)
    const artifacts = await HeidiState.files(req.task_id)
    await Bus.publish(Event.Updated, {
      task_id: req.task_id,
      mode: state.mode,
      fsm_state: state.fsm_state,
    })

    return Response.parse({
      ok: true,
      fsm_state: state.fsm_state,
      mode: state.mode,
      task_json_version: 1,
      artifacts,
      error: null,
    })
  }
}
