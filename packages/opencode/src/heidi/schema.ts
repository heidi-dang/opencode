import z from "zod"

export const FsmState = z.enum([
  "IDLE",
  "DISCOVERY",
  "PLAN_DRAFT",
  "PLAN_LOCKED",
  "EXECUTION",
  "VERIFICATION",
  "COMPLETE",
  "BLOCKED",
])

export const Mode = z.enum(["PLANNING", "EXECUTION", "VERIFICATION"])

export const Item = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["todo", "doing", "done", "blocked"]),
  category: z.enum(["Modify", "New", "Delete", "Verify"]),
})

export const TaskState = z.object({
  run_id: z.string(),
  task_id: z.string(),
  fsm_state: FsmState,
  mode: Mode,
  objective: z.object({
    locked: z.boolean(),
    text: z.string(),
  }),
  plan: z.object({
    path: z.string(),
    hash: z.string(),
    locked: z.boolean(),
    amendments: z.array(
      z.object({
        id: z.string(),
        reason: z.string(),
        timestamp: z.string(),
      }),
    ),
  }),
  checklist: z.array(Item),
  active_files: z.array(z.string()),
  changed_files: z.array(z.string()),
  commands: z.array(
    z.object({
      id: z.string(),
      cmd: z.string(),
      cwd: z.string(),
      profile: z.string(),
      exit_code: z.number(),
      timestamp: z.string(),
    }),
  ),
  verification_commands: z.array(z.string()),
  checkpoints: z.array(
    z.object({
      id: z.string(),
      step_id: z.string(),
      files: z.array(z.string()),
      created_at: z.string(),
    }),
  ),
  block_reason: z.string().nullable(),
  last_successful_step: z.string(),
  next_transition: z.string(),
  resume: z.object({
    next_step: z.string().optional().nullable(),
    checkpoint_id: z.string().nullable(),
    failed_hypotheses: z.array(z.string()),
  }),
})

export const VerifyState = z.object({
  task_id: z.string(),
  status: z.enum(["pass", "fail", "blocked"]),
  checks: z.array(
    z.object({
      name: z.string(),
      command: z.string(),
      exit_code: z.number(),
      duration_ms: z.number(),
      log_ref: z.string().optional(),
    }),
  ),
  evidence: z.object({
    changed_files: z.array(z.string()),
    command_summary: z.array(z.string()),
    before_after: z.string(),
  }),
  warnings: z.array(z.string()),
  remediation: z.array(
    z.object({
      file: z.string(),
      line: z.number(),
      rule_id: z.string(),
      message: z.string(),
      next_action: z.string(),
    }),
  ),
  browser: z
    .object({
      required: z.boolean(),
      status: z.enum(["pass", "fail", "skipped"]),
      screenshots: z.array(z.string()),
      console_errors: z.array(z.string()),
      network_failures: z.array(z.string()),
    })
    .optional(),
})

export const ResumeState = z.object({
  run_id: z.string(),
  task_id: z.string(),
  fsm_state: z.string(),
  objective: z.string(),
  plan_ref: z.string(),
  completed: z.array(z.string()),
  pending: z.array(z.string()),
  touched_files: z.array(z.string()),
  edited_files: z.array(z.string()),
  last_validations: z.array(z.string()),
  failed_hypotheses: z.array(z.string()),
  next_step: z.string().optional(),
  checkpoint_ref: z.string().nullable(),
  narrative: z.string().optional(),
})

export type TaskState = z.infer<typeof TaskState>
export type VerifyState = z.infer<typeof VerifyState>
export type ResumeState = z.infer<typeof ResumeState>
