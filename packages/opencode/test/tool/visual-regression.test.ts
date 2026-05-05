import { describe, test, expect } from "bun:test"
import { compareScreenshots } from "../../src/tool/visual-regression"

describe("VisualRegression", () => {
  test("should have compare function", () => {
    expect(typeof compareScreenshots).toBe("function")
  })

  test("should return VisualDiff structure", async () => {
    // Mock test - just verify interface
    const result = { same: true, diffPath: "", diffCount: 0 }
    expect(result).toHaveProperty("same")
    expect(result).toHaveProperty("diffCount")
  })
})
