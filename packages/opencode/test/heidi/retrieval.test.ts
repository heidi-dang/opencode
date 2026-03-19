import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiRetrieval } from "../../src/heidi/retrieval"
import { Filesystem } from "../../src/util/filesystem"

describe("heidi retrieval", () => {
  test("rebuild and query symbols", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await Filesystem.write(path.join(tmp.path, "src", "x.ts"), "export function alpha() { return 1 }\n")
        const session = await Session.create({})
        const count = await HeidiRetrieval.rebuild(session.id, tmp.path)
        expect(count).toBeGreaterThan(0)
        const hit = await HeidiRetrieval.query(session.id, tmp.path, "alpha")
        expect(hit.kind).toBe("symbol")
      },
    })
  })
})
