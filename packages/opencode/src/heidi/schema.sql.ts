import { text, sqliteTable, integer } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const task_cards = sqliteTable("task_cards", {
  id: text().primaryKey(),
  session_id: text().notNull(),
  objective: text().notNull(),
  state: text().notNull(), // queued, planning, running, verifying, done, blocked
  created_at: integer().notNull(),
  updated_at: integer().notNull()
})

export const artifact_metadata = sqliteTable("artifact_metadata", {
  id: text().primaryKey(),
  task_id: text().notNull(),
  artifact_type: text().notNull(), // implementation_plan, task, verification, browser_report
  path: text().notNull(),
  status: text().notNull(),
  created_at: integer().notNull()
})

export const fsm_snapshots = sqliteTable("fsm_snapshots", {
  id: text().primaryKey(),
  session_id: text().notNull(),
  state: text().notNull(),
  payload: text().notNull(), // JSON blob of full HeidiState
  created_at: integer().notNull()
})

export const agent_runs = sqliteTable("agent_runs", {
  id: text().primaryKey(),
  task_id: text().notNull(),
  agent_name: text().notNull(),
  status: text().notNull(),
  started_at: integer().notNull(),
  completed_at: integer()
})
