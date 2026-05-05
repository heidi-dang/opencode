import { describe, test, expect } from "bun:test"
import { MockRegistry } from "../../src/skill-test/mock-registry"

describe("MockRegistry", () => {
  test("should load skills from local dir", async () => {
    const reg = new MockRegistry("/home/heidi/opencode/packages/opencode/src/skill")
    await reg.load()
    const skills = reg.list()
    expect(skills.length).toBeGreaterThan(0)
  })

  test("should find skill by name", async () => {
    const reg = new MockRegistry("/home/heidi/opencode/packages/opencode/src/skill")
    await reg.load()
    const skill = reg.find("brainstorming")
    expect(skill).toBeDefined()
    expect(skill?.name).toBe("brainstorming")
  })
})
