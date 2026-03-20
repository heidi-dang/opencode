import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { HeidiBoundary } from "../../src/heidi/boundary"
import { HeidiState } from "../../src/heidi/state"
import { Filesystem } from "../../src/util/filesystem"
import { EditTool } from "../../src/tool/edit"
import { WriteTool } from "../../src/tool/write"
import { ReplaceFileContentTool } from "../../src/tool/replace_file_content"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { TaskBoundaryTool } from "../../src/tool/task_boundary"
import { SessionID, MessageID } from "../../src/session/schema"
import { startTask } from "../fixture/heidi"
import { FileTime } from "../../src/file/time"
import path from "path"

describe("fsm consistency", () => {
  const mockCtx = (sessionID: string) => ({
    sessionID: SessionID.make(sessionID),
    messageID: MessageID.make("msg_test"),
    callID: "call_test",
    agent: "heidi",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
  })

  test("edit is blocked in DISCOVERY", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await startTask(session.id, "Test gating")
        const file = path.join(tmp.path, "test.txt")
        await Filesystem.write(file, "hello")
        await FileTime.read(SessionID.make(session.id), file)

        const tool = await EditTool.init()
        await expect(
          tool.execute(
            {
              filePath: file,
              oldString: "hello",
              newString: "world",
            },
            mockCtx(session.id),
          ),
        ).rejects.toThrow(/requires EXECUTION or VERIFICATION state/)
      },
    })
  })

  test("write is blocked in DISCOVERY", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await startTask(session.id, "Test gating")
        const file = path.join(tmp.path, "test.txt")

        const tool = await WriteTool.init()
        await expect(
          tool.execute(
            {
              filePath: file,
              content: "world",
            },
            mockCtx(session.id),
          ),
        ).rejects.toThrow(/requires EXECUTION or VERIFICATION state/)
      },
    })
  })

  test("replace_file_content is blocked in DISCOVERY", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await startTask(session.id, "Test gating")
        const file = path.join(tmp.path, "test.txt")
        await Filesystem.write(file, "anchor\nsearch")

        const tool = await ReplaceFileContentTool.init()
        await expect(
          tool.execute(
            {
              edits: [
                {
                  path: file,
                  anchor: "anchor",
                  search_string: "search",
                  replace_string: "replace",
                },
              ],
            },
            mockCtx(session.id),
          ),
        ).rejects.toThrow(/requires EXECUTION or VERIFICATION state/)
      },
    })
  })

  test("apply_patch is blocked in DISCOVERY", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await startTask(session.id, "Test gating")
        const file = path.join(tmp.path, "test.txt")
        await Filesystem.write(file, "hello")

        const tool = await ApplyPatchTool.init()
        // This is EXPECTED TO FAIL (currently passes but should fail after my fix)
        await expect(
          tool.execute(
            {
              patchText: `--- a/test.txt\n+++ b/test.txt\n@@ -1 +1 @@\n-hello\n+world\n`,
            },
            mockCtx(session.id),
          ),
        ).rejects.toThrow(/requires EXECUTION or VERIFICATION state/)
      },
    })
  })

  test("begin_execution with incomplete plan gives structured errors", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await startTask(session.id, "Test plan validation")
        
        // Plan has TBDs
        await Filesystem.write(
          (await HeidiState.files(session.id)).implementation_plan,
          "# Goal\nTest\n## Background and discovered repo facts\n- TBD\n## Scope\n- TBD\n## Files to modify\n- TBD (Modify)\n## Change strategy by component\n- TBD\n## Verification plan\n- TBD",
        )

        await expect(
          HeidiBoundary.apply({
            run_id: "run-test",
            task_id: session.id,
            action: "begin_execution",
            payload: {},
          }),
        ).rejects.toThrow(/Missing sections: .*Background.*Scope.*Files to modify.*Change strategy.*Verification/)
      },
    })
  })

  test("valid transition allows editing", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await startTask(session.id, "Test transition")
        const file = path.join(tmp.path, "test.txt")
        await Filesystem.write(file, "hello")

        // Complete plan
        await Filesystem.write(
          (await HeidiState.files(session.id)).implementation_plan,
          "# Goal\nTest\n## Background and discovered repo facts\nNone\n## Scope\nAll\n## Files to modify\n- test.txt\n## Change strategy by component\nNone\n## Verification plan\n- test",
        )

        await HeidiBoundary.apply({
          run_id: "run-test",
          task_id: session.id,
          action: "begin_execution",
          payload: {},
        })
        await FileTime.read(SessionID.make(session.id), file)

        const tool = await EditTool.init()
        const result = await tool.execute(
          {
            filePath: file,
            oldString: "hello",
            newString: "world",
          },
          mockCtx(session.id),
        )
        expect(result.output).toContain("Edit applied successfully")
      },
    })
  })

  test("task_boundary tool correctly maps top-level id and status for mark_item", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        await startTask(SessionID.make(session.id), "Test task_boundary mapping")
        
        // Add an item to mark
        const state = await HeidiState.read(SessionID.make(session.id))
        state.checklist.push({
          id: "item-1",
          label: "Test item",
          status: "todo",
          category: "Modify",
          priority: "medium",
        })
        await HeidiState.write(SessionID.make(session.id), state)

        const tool = await TaskBoundaryTool.init()
        await tool.execute(
          {
            action: "mark_item",
            id: "item-1",
            status: "done",
          },
          mockCtx(session.id),
        )
        const nextState = await HeidiState.read(SessionID.make(session.id))
        expect(nextState.checklist[0].status).toBe("done")
      },
    })
  })
})
