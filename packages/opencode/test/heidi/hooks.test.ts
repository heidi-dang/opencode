import { describe, test, expect } from "bun:test"
import { HeidiHooks } from "@/heidi/hooks"

describe("HeidiHooks", () => {
  test("should create hooks layer", () => {
    const layer = HeidiHooks.layer
    expect(layer).toBeDefined()
  })

  // Note: Full integration test would require Effect test utilities
  // This is a placeholder to verify the module loads
})
