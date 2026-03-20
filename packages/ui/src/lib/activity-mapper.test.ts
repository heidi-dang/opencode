import { describe, expect, test } from "bun:test"
import { humanize } from "./activity-mapper"

describe("activity-mapper task_boundary", () => {
  test("uses execution wording for begin_execution", () => {
    const info = humanize("task_boundary", { action: "begin_execution" }, "pending")
    expect(info.tone).toBe("neutral")
    expect(info.effect).toBe("shimmer")
    expect(info.title.length).toBeGreaterThan(0)
    expect(info.subtitle.length).toBeGreaterThan(0)
  })

  test("uses generic wording for reopen_plan", () => {
    const info = humanize("task_boundary", { action: "reopen_plan" }, "done")
    expect(info.tone).toBe("neutral")
    expect(info.effect).toBe("none")
    expect(info.title.length).toBeGreaterThan(0)
  })
})
