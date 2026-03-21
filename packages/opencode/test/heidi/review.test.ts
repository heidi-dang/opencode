import { expect, test, describe } from "bun:test"
import { HeidiReview } from "../../src/heidi/review"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import path from "path"

describe("HeidiReview", () => {
  test("should detect floating promises for common services", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "test.ts")
        await Filesystem.write(file, `
            async function fail() {
                Filesystem.write("foo", "bar") // missing await
                await Filesystem.write("ok", "ok")
            }
        `)
        
        const findings = await HeidiReview.audit([file])
        expect(findings).toHaveLength(1)
        expect(findings[0].reason).toContain("Floating promise")
        expect(findings[0].content).toContain('Filesystem.write("foo", "bar")')
      }
    })
  })

  test("should detect SSE resource leaks (missing stop in onAbort)", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "leak.ts")
        await Filesystem.write(file, `
            stream.onAbort(() => {
                log.info("aborted")
                // missing stop() or cleanup
            })
        `)
        
        const findings = await HeidiReview.audit([file])
        expect(findings).toHaveLength(1)
        expect(findings[0].reason).toContain("leak")
      }
    })
  })
})
