import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { HeidiVerify } from "../../src/heidi/verify"
import { Filesystem } from "../../src/util/filesystem"

describe("heidi verify", () => {
    test("persists browser evidence and passes verify-complete lifecycle", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})
          const state = await HeidiState.ensure(session.id, "verify gate")
          state.plan.locked = true
          state.checklist = [{ id: "1", label: "do thing", status: "done", category: "Modify" }]
          await HeidiState.write(session.id, state)
          await HeidiState.writeVerification(session.id, {
            task_id: session.id,
            status: "pass",
            checks: [{ name: "check", command: "run", exit_code: 0, duration_ms: 10, log_ref: "log.txt" }],
            evidence: { changed_files: ["foo.txt"], command_summary: ["run"], before_after: "ok" },
            warnings: [],
            remediation: [],
            browser: { required: true, status: "pass", screenshots: ["ok.png"], console_errors: [], network_failures: [] },
          })
          await expect(HeidiVerify.gate(session.id)).resolves.toBe(true)
          // Check browser evidence persisted
          const files = await HeidiState.files(session.id)
          const verify = await Filesystem.readJson<any>(files.verification)
          expect(verify.browser.status).toBe("pass")
          expect(verify.browser.screenshots[0]).toBe("ok.png")
        },
      })
    })
  test("gate fails on incomplete checklist", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "verify gate")
        state.plan.locked = true
        state.checklist = [{ id: "1", label: "do thing", status: "todo", category: "Modify" }]
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
        const state = await HeidiState.ensure(session.id, "verify gate")
        state.plan.locked = true
        state.checklist = [{ id: "1", label: "do thing", status: "done", category: "Modify" }]
        await HeidiState.write(session.id, state)
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [],
          evidence: { changed_files: [], command_summary: [], before_after: "" },
          warnings: [],
          remediation: [],
          browser: { required: true, status: "skipped", screenshots: [], console_errors: [], network_failures: [] },
        })
        await expect(HeidiVerify.gate(session.id)).rejects.toThrow("checks missing")
      },
    })
  })

  test("gate fails with stubbed browser evidence", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "verify gate")
        state.plan.locked = true
        state.checklist = [{ id: "1", label: "do thing", status: "done", category: "Modify" }]
        await HeidiState.write(session.id, state)
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [],
          evidence: { changed_files: ["foo.txt"], command_summary: ["run"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: { required: true, status: "skipped", screenshots: [], console_errors: [], network_failures: [] },
        })
        await expect(HeidiVerify.gate(session.id)).rejects.toThrow("checks missing")
      },
    })
  })

  test("gate fails with failed browser verification", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "verify gate")
        state.plan.locked = true
        state.checklist = [{ id: "1", label: "do thing", status: "done", category: "Modify" }]
        await HeidiState.write(session.id, state)
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [],
          evidence: { changed_files: ["foo.txt"], command_summary: ["run"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: { required: true, status: "fail", screenshots: ["fail.png"], console_errors: ["Error"], network_failures: [] },
        })
        await expect(HeidiVerify.gate(session.id)).rejects.toThrow("checks missing")
      },
    })
  })

  test("gate passes with strict evidence and browser proof", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const state = await HeidiState.ensure(session.id, "verify gate")
        state.plan.locked = true
        state.checklist = [{ id: "1", label: "do thing", status: "done", category: "Modify" }]
        await HeidiState.write(session.id, state)
        await HeidiState.writeVerification(session.id, {
          task_id: session.id,
          status: "pass",
          checks: [{ name: "check", command: "run", exit_code: 0, duration_ms: 10 }],
          evidence: { changed_files: ["foo.txt"], command_summary: ["run"], before_after: "ok" },
          warnings: [],
          remediation: [],
          browser: { required: true, status: "pass", screenshots: ["ok.png"], console_errors: [], network_failures: [] },
        })
        await expect(HeidiVerify.gate(session.id)).resolves.toBe(true)
      },
    })
  })
})
