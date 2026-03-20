import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiState } from "../../src/heidi/state"
import { Filesystem } from "../../src/util/filesystem"
import { enterExecution, startAndRead } from "../fixture/heidi"

describe("heidi resume", () => {
  test("writes resume payload with next step", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const state = await startAndRead(session.id, "resume")
        state.resume.next_step = "PLAN_DRAFT"
        await HeidiState.write(session.id, state)
        await HeidiState.updateResume(session.id)
        const paths = await HeidiState.files(session.id)
        const resume = await Filesystem.readJson<any>(paths.resume)
        expect(resume.next_step).toBe("PLAN_DRAFT")
        // Simulate completion
        state.resume.next_step = undefined
        await HeidiState.write(session.id, state)
        await HeidiState.updateResume(session.id)
        const loaded = await HeidiState.read(session.id)
        expect(loaded.resume.next_step).toBeUndefined()
      },
    })
  })

  test("resumes from persisted state without replaying completed work", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterExecution(session.id, "resume")
        let state = await HeidiState.read(session.id)
        state.checklist = [
          { id: "1", label: "step1", status: "done", category: "Modify" },
          { id: "2", label: "step2", status: "todo", category: "Modify" },
        ]
        state.resume.next_step = "step2"
        await HeidiState.write(session.id, state)
        await HeidiState.updateResume(session.id)
        // Simulate interruption and reload
        const loaded = await HeidiState.read(session.id)
        expect(loaded.checklist[0].status).toBe("done")
        expect(loaded.resume.next_step).toBe("step2")
        // Resume should not replay step1
        expect(loaded.checklist.filter((x) => x.status === "done").length).toBe(1)
      },
    })
  })

  test("recovers from partial execution and resumes correctly", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await enterExecution(session.id, "resume")
        let state = await HeidiState.read(session.id)
        // Case 1: checklist empty, next_step should be preserved
        state.checklist = []
        state.resume.next_step = "PLAN_DRAFT"
        await HeidiState.write(session.id, state)
        await HeidiState.updateResume(session.id)
        const loaded1 = await HeidiState.read(session.id)
        expect(loaded1.resume.next_step).toBe("PLAN_DRAFT")

        // Case 2: checklist with all done, next_step should be cleared
        state = await HeidiState.read(session.id)
        state.checklist = [
          { id: "1", label: "step1", status: "done", category: "Modify" },
          { id: "2", label: "step2", status: "done", category: "Modify" },
        ]
        state.resume.next_step = "step2"
        await HeidiState.write(session.id, state)
        await HeidiState.updateResume(session.id)
        const loaded2 = await HeidiState.read(session.id)
        expect(loaded2.checklist.every((x) => x.status === "done")).toBe(true)
        expect(loaded2.resume.next_step).toBe(undefined)

        // Case 3: checklist with some pending, next_step should be preserved
        state.checklist = [
          { id: "1", label: "step1", status: "done", category: "Modify" },
          { id: "2", label: "step2", status: "todo", category: "Modify" },
        ]
        state.resume.next_step = "step2"
        await HeidiState.write(session.id, state)
        await HeidiState.updateResume(session.id)
        const loaded3 = await HeidiState.read(session.id)
        expect(loaded3.resume.next_step).toBe("step2")
        expect(loaded3.checklist.filter((x) => x.status === "done").length).toBe(1)
      },
    })
  })
})
