import { describe, expect, test } from "bun:test"
import { HeidiMemory, HeidiMemoryRules } from "../../src/heidi/memory"

describe("heidi memory rules", () => {
  test("exports named rule groups", () => {
    expect(HeidiMemoryRules.unsafe.map((group) => group.name)).toEqual([
      "credentials",
      "keys",
      "auth",
      "blob",
    ])
    expect(HeidiMemoryRules.unknown.map((group) => group.name)).toEqual(["entropy"])
  })

  test("flags obvious secrets as unsafe", () => {
    const cases = [
      { content: "password = hunter2", group: "credentials" },
      { content: "my secret is swordfish", group: "credentials" },
      { content: "-----BEGIN OPENSSH PRIVATE KEY-----", group: "keys" },
      { content: `Authorization: Bearer ${"a".repeat(24)}`, group: "auth" },
      { content: `sk-${"a".repeat(24)}`, group: "auth" },
      { content: `${"Q".repeat(48)} ${"R".repeat(16)} ${"S".repeat(48)}`, group: "blob" },
    ]

    for (const item of cases) {
      const result = HeidiMemory.inspect(item.content)
      expect(result.trust).toBe("unsafe")
      expect(result.groups).toContain(item.group)
    }
  })

  test("keeps obvious false positives safe", () => {
    const cases = [
      "the secretary handles release notes",
      "token bucket rate limiting is enabled",
      "read the API key rotation guide before deploys",
      "-----BEGIN CERTIFICATE-----",
    ]

    for (const content of cases) {
      expect(HeidiMemory.inspect(content)).toEqual({ trust: "safe", groups: [] })
    }
  })

  test("marks long opaque strings as unknown", () => {
    const result = HeidiMemory.inspect(`build cache key ${"A1".repeat(20)}`)
    expect(result.trust).toBe("unknown")
    expect(result.groups).toEqual(["entropy"])
  })
})