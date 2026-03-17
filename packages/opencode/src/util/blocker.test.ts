import { expect, test, describe } from "bun:test"
import { Blocker } from "./blocker"

describe("Blocker Classifier", () => {
  test("classifies hard execution error as blocker", () => {
    const err = new Error("Hard crash")
    const result = Blocker.classify(err)
    expect(result?.type).toBe("hard_execution_failure")
  })

  test("returns null for non-errors", () => {
    expect(Blocker.classify(null)).toBeNull()
    expect(Blocker.classify(undefined)).toBeNull()
  })

  test("detects routine questions", () => {
    expect(Blocker.isRoutineQuestion("Would you like me to continue?")).toBe(true)
    expect(Blocker.isRoutineQuestion("Should I read the next part?")).toBe(true)
    expect(Blocker.isRoutineQuestion("I have finished the task. Here is the result.")).toBe(false)
  })

  test("labels destructive approval as blocker", () => {
    // Mock a NamedError-like object
    const err = new Error("Auth change")
    Object.defineProperty(err, "name", { value: "PermissionRejectedError" });
    (err as any).data = { destructive: true };
    
    const result = Blocker.classify(err)
    expect(result?.type).toBe("destructive_approval_required")
  })

  test("labels tool not found as blocker", () => {
    const err = new Error("Tool X not found")
    Object.defineProperty(err, "name", { value: "ToolNotFoundError" });
    
    const result = Blocker.classify(err)
    expect(result?.type).toBe("no_tool_fallback")
  })
})
