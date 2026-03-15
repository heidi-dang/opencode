import { integer, text } from "drizzle-orm/sqlite-core"
import { sqliteTable } from "drizzle-orm/sqlite-core"

export const InfinityTable = sqliteTable("infinity", {
  id: text().primaryKey(),
  run_id: text(),
  task_id: text(),
  stage: text(),
  state: text(),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
})
