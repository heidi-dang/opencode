import { describe, test, expect } from "bun:test"
import { HeidiAPI } from "@/heidi/api"
import { Identifier } from "@/id/id"

describe("HeidiAPI", () => {
  test("should export version", () => {
    const v = HeidiAPI.version()
    expect(v.version).toBe("1.0.0")
    expect(v.api).toBe("HeidiStateAPI")
  })

  test("should generate paths for session", () => {
    const sessionID = "test-session-123" as any
    const p = HeidiAPI.paths(sessionID)
    expect(p.task).toContain("task.json")
    expect(p.plan).toContain("implementation_plan.md")
  })

  test("should validate plan text", () => {
    const validPlan = `
## Background and discovered repo facts
Some facts here.

## Scope
Task scope.

## Files to modify
- /path/to/file.ts

## Change strategy by component
Strategy here.

## Verification plan
- Test something.
`
    const result = HeidiAPI.validatePlan(validPlan)
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  test("should detect invalid plan", () => {
    const invalidPlan = `
## Background and discovered repo facts
- TBD

## Scope
- TBD
`
    const result = HeidiAPI.validatePlan(invalidPlan)
    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
