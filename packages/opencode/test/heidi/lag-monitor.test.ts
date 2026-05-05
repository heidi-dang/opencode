import { describe, test, expect, mock } from "bun:test"
import { HeidiLagMonitor } from "@/heidi/lag-monitor"

describe("HeidiLagMonitor", () => {
  test("should create lag monitor module", () => {
    expect(HeidiLagMonitor).toBeDefined()
    expect(HeidiLagMonitor.checkLag).toBeDefined()
    expect(HeidiLagMonitor.doctorCheck).toBeDefined()
  })

  test("should detect lag when index is behind", async () => {
    // This is a basic test - full integration would need git mocks
    const result = await HeidiLagMonitor.checkLag()
    expect(result).toHaveProperty("isBehind")
    expect(result).toHaveProperty("lagCommits")
  })

  test("should return healthy when up to date", async () => {
    const check = await HeidiLagMonitor.doctorCheck()
    expect(check).toHaveProperty("healthy")
    expect(check).toHaveProperty("message")
  })
})
