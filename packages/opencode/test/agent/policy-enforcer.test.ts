import { describe, test, expect } from "bun:test"
import { PolicyEnforcer } from "../../src/agent/policy-enforcer"

describe("PolicyEnforcer", () => {
  test("should detect hardcoded password", async () => {
    const content = 'const password = "secret123"'
    const violations = await PolicyEnforcer.scanFile("test.ts", content)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0].rule).toBe("hardcoded-secret")
  })

  test("should detect api key", async () => {
    const content = 'const apiKey = "abc123-def456-ghi789"'
    const violations = await PolicyEnforcer.scanFile("test.ts", content)
    expect(violations.length).toBeGreaterThan(0)
  })

  test("should pass clean code", async () => {
    const content = 'const name = "safe"'
    const violations = await PolicyEnforcer.scanFile("test.ts", content)
    expect(violations).toHaveLength(0)
  })
})
