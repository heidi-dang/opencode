import { describe, test, expect } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { SessionID } from "../../src/session/schema"
import { HeidiMemory } from "../../src/heidi/memory"

describe("heidi memory", () => {
  test("rejects unsafe memory entries", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = SessionID.make("mem-unsafe")
        await expect(
          HeidiMemory.add(sessionID, { type: "note", key: "danger", content: "my secret password is 123" })
        ).rejects.toThrow("Unsafe memory content detected")
      },
    })
  })

  test("stores and queries safe memory entries with trust metadata", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = SessionID.make("mem-safe")
        await HeidiMemory.add(sessionID, { type: "note", key: "hello", content: "all clear here" })
        const results = await HeidiMemory.query("hello")
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].trust).toBe("safe")
        expect(results[0].key).toBe("hello")
        expect(results[0].content).toBe("all clear here")
      },
    })
  })

  test("does not return unsafe entries in query", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = SessionID.make("mem-mixed")
        // Safe
        await HeidiMemory.add(sessionID, { type: "note", key: "safe", content: "this is fine" })
        // Unsafe
        await expect(
          HeidiMemory.add(sessionID, { type: "note", key: "unsafe", content: "PRIVATE_KEY=abc" })
        ).rejects.toThrow()
        // Query should only return safe
        const results = await HeidiMemory.query("")
        expect(results.some(x => x.key === "unsafe")).toBe(false)
        expect(results.some(x => x.key === "safe")).toBe(true)
      },
    })
  })
})