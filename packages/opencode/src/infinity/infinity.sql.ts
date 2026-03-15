import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import { Timestamps } from "../storage/schema.sql"
import type { ProjectID } from "../project/schema"

export const InfinityTable = sqliteTable(
  "infinity",
  {
    id: text().primaryKey(),
    project_id: text()
      .$type<ProjectID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    status: text().notNull(),
    current_stage: text().notNull(),
    current_run_id: text(),
    current_task_id: text(),
    health_score: integer(),
    metrics: text({ mode: "json" }),
    ...Timestamps,
  },
  (table) => [
    index("infinity_project_idx").on(table.project_id),
    uniqueIndex("infinity_project_unique_idx").on(table.project_id),
  ],
)
