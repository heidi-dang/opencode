import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { HeidiVerify } from "../../src/heidi/verify"
import { Filesystem } from "../../src/util/filesystem"
import { enterVerification } from "../fixture/heidi"

describe("heidi verify", () => {
  test("persists browser evidence and passes verify-complete lifecycle", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterVerification(session.id, "verify gate")
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [{ name: "check", command: "run", exit_code: 0, duration_ms: 10, log_ref: "log.txt" }],
          evidence: { changed_files: ["foo.txt"], command_summary: ["run"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: {
            required: true,
            status: "pass",
            screenshots: [],
            html: ["ok.html"],
            console_errors: [],
            network_failures: [],
          },
        })
        await expect(HeidiVerify.gate(session.id)).resolves.toBe(true)
        // Check browser evidence persisted
        const files = await HeidiState.files(session.id)
        const verify = await Filesystem.readJson<any>(files.verification)
        expect(verify.browser.status).toBe("pass")
        expect(Array.isArray(verify.browser.html)).toBe(true)
        expect(verify.browser.html[0]).toBe("ok.html")
      },
    })
  })

  test("browser verifier persists HTML and fails on bad URL", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterVerification(session.id, "verify gate")
        // Simulate browser verifier with bad URL
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "fail",
          checks: [{ name: "check", command: "run", exit_code: 1, duration_ms: 10, log_ref: "log.txt" }],
          evidence: { changed_files: ["foo.txt"], command_summary: ["run"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: {
            required: true,
            status: "fail",
            screenshots: [],
            html: [],
            console_errors: [],
            network_failures: ["Network error"],
          },
        })
        const files = await HeidiState.files(session.id)
        const verify = await Filesystem.readJson<any>(files.verification)
        expect(verify.browser.status).toBe("fail")
        expect(Array.isArray(verify.browser.html)).toBe(true)
        expect(verify.browser.html.length).toBe(0)
        expect(Array.isArray(verify.browser.network_failures)).toBe(true)
        expect(verify.browser.network_failures.length).toBeGreaterThan(0)
      },
    })
  })
  test("gate fails on incomplete checklist", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterVerification(session.id, "verify gate")
        const state = await HeidiState.read(session.id)
        state.checklist = [{ id: "1", label: "do thing", status: "todo", category: "Modify", priority: "medium" }]
        await HeidiState.write(session.id, state)
        await expect(HeidiVerify.gate(session.id)).rejects.toThrow("checklist incomplete")
      },
    })
  })

  test("gate fails with empty evidence", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterVerification(session.id, "verify gate")
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [{ name: "check", command: "run", exit_code: 0, duration_ms: 10 }],
          evidence: { changed_files: [], command_summary: [], before_after: "" },
          warnings: [],
          remediation: [],
          browser: {
            required: true,
            status: "skipped",
            screenshots: [],
            html: [],
            console_errors: [],
            network_failures: [],
          },
        })
        await expect(HeidiVerify.gate(session.id)).rejects.toThrow("evidence is empty or ceremonial")
      },
    })
  })

  test("gate fails with stubbed browser evidence", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterVerification(session.id, "verify gate")
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [{ name: "check", command: "run", exit_code: 0, duration_ms: 10 }],
          evidence: { changed_files: ["foo.txt"], command_summary: ["run"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: {
            required: true,
            status: "skipped",
            screenshots: [],
            html: [],
            console_errors: [],
            network_failures: [],
          },
        })
        await expect(HeidiVerify.gate(session.id)).rejects.toThrow("browser evidence missing or failed")
      },
    })
  })

  test("gate fails with failed browser verification", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterVerification(session.id, "verify gate")
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [{ name: "check", command: "run", exit_code: 0, duration_ms: 10 }],
          evidence: { changed_files: ["foo.txt"], command_summary: ["run"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: {
            required: true,
            status: "fail",
            screenshots: ["fail.png"],
            html: [],
            console_errors: ["Error"],
            network_failures: [],
          },
        })
        await expect(HeidiVerify.gate(session.id)).rejects.toThrow("browser evidence missing or failed")
      },
    })
  })

  test("gate passes with strict evidence and browser proof", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterVerification(session.id, "verify gate")
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [{ name: "check", command: "run", exit_code: 0, duration_ms: 10 }],
          evidence: { changed_files: ["foo.txt"], command_summary: ["run"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: {
            required: true,
            status: "pass",
            screenshots: ["ok.png"],
            html: [],
            console_errors: [],
            network_failures: [],
          },
        })
        await expect(HeidiVerify.gate(session.id)).resolves.toBe(true)
      },
    })
  })
})
