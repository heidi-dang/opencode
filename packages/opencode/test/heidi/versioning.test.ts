import { describe, test, expect } from "bun:test"
import { HeidiVersioning } from "@/heidi/versioning"

describe("HeidiVersioning", () => {
  test("should add version to artifact", () => {
    const meta = HeidiVersioning.addVersion({
      type: "verification",
      session_id: "test-1",
    })
    expect(meta.version).toBe("1.0.0")
    expect(meta.type).toBe("verification")
    expect(meta.created_at).toBeDefined()
  })

  test("should have current version", () => {
    expect(HeidiVersioning.CURRENT_VERSION).toBe("1.0.0")
  })
})
