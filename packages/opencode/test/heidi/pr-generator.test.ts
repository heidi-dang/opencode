import { describe, test, expect } from "bun:test"
import { HeidiPRGenerator } from "@/heidi/pr-generator"

describe("HeidiPRGenerator", () => {
  test("should generate PR description structure", async () => {
    // Mock test - just verify the module loads
    expect(HeidiPRGenerator).toBeDefined()
    expect(typeof HeidiPRGenerator.generate).toBe("function")
  })

  test("should have write function", () => {
    expect(typeof HeidiPRGenerator.writePRDescription).toBe("function")
  })
})
