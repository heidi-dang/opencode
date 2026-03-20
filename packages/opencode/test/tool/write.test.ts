import { describe, test, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { WriteTool } from "../../src/tool/write"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { SessionID, MessageID } from "../../src/session/schema"
import { enterExecution } from "../fixture/heidi"

const baseCtx = {
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

async function withExecutionState(session: { id: string }, label = "test write") {
  await enterExecution(session.id as SessionID, label)
}

describe("tool.write", () => {
  test("plan-lock drift blocks write execution", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { Session } = await import("../../src/session")
        const { HeidiState } = await import("../../src/heidi/state")
        const { Filesystem } = await import("../../src/util/filesystem")
        const session = await Session.create({})
        // Use real contract to lock plan and begin execution
        const { HeidiBoundary } = await import("../../src/heidi/boundary")
        await HeidiBoundary.apply({
          run_id: "run-drift-2",
          task_id: session.id,
          action: "start",
          payload: { objective: "test write drift" },
        })
        const planPath = HeidiState.plan(session.id)
        await Filesystem.write(
          planPath,
          [
            "# Implementation Plan",
            "",
            "## Task goal",
            "test write drift",
            "",
            "## Background and discovered repo facts",
            "None",
            "",
            "## Scope",
            "None",
            "",
            "## Files to modify",
            "- src/a.ts",
            "",
            "## Change strategy by component",
            "None",
            "",
            "## Verification plan",
            "- bun test",
          ].join("\n"),
        )
        await HeidiBoundary.apply({
          run_id: "run-drift-2",
          task_id: session.id,
          action: "lock_plan",
          payload: {},
        })
        await HeidiBoundary.apply({
          run_id: "run-drift-2",
          task_id: session.id,
          action: "begin_execution",
          payload: {},
        })
        // Mutate the plan file after lock
        const orig = await Filesystem.readText(planPath)
        await Filesystem.write(planPath, orig + "\n# DRIFT\n")
        const write = await WriteTool.init()
        const driftCtx = {
          ...baseCtx,
          sessionID: session.id,
        }
        await expect(
          write.execute(
            {
              filePath: path.join(tmp.path, "drift.txt"),
              content: "should fail",
            },
            driftCtx,
          ),
        ).rejects.toThrow(/drift/i)
      },
    })
  })
  describe("new file creation", () => {
    test("writes content to new file", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "newfile.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const { HeidiState } = await import("../../src/heidi/state")
          const session = await Session.create({})
          await withExecutionState(session, "test write new file")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          const result = await write.execute(
            {
              filePath: filepath,
              content: "Hello, World!",
            },
            testCtx,
          )

          expect(result.output).toContain("Wrote file successfully")
          expect(result.metadata.exists).toBe(false)

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("Hello, World!")
        },
      })
    })

    test("creates parent directories if needed", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "nested", "deep", "file.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const { HeidiState } = await import("../../src/heidi/state")
          const session = await Session.create({})
          await withExecutionState(session, "test write nested dir")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: filepath,
              content: "nested content",
            },
            testCtx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("nested content")
        },
      })
    })

    test("rejects writes outside exclusive ownership set", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "blocked.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const { HeidiState } = await import("../../src/heidi/state")
          const session = await Session.create({})
          await withExecutionState(session, "test write exclusive ownership")
          const write = await WriteTool.init()
          await expect(
            write.execute(
              {
                filePath: filepath,
                content: "nope",
              },
              {
                ...baseCtx,
                sessionID: session.id,
                extra: {
                  ownership: {
                    mode: "exclusive_edit",
                    files: ["allowed.txt"],
                  },
                },
              },
            ),
          ).rejects.toThrow("outside exclusive ownership set")
        },
      })
    })

    test("handles relative paths by resolving to instance directory", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const { HeidiState } = await import("../../src/heidi/state")
          const session = await Session.create({})
          await withExecutionState(session, "test write relative path")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: "relative.txt",
              content: "relative content",
            },
            testCtx,
          )

          const content = await fs.readFile(path.join(tmp.path, "relative.txt"), "utf-8")
          expect(content).toBe("relative content")
        },
      })
    })
  })

  describe("existing file overwrite", () => {
    test("overwrites existing file content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "existing.txt")
      await fs.writeFile(filepath, "old content", "utf-8")

      // First read the file to satisfy FileTime requirement
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const { HeidiState } = await import("../../src/heidi/state")
          const { FileTime } = await import("../../src/file/time")
          const session = await Session.create({})
          await withExecutionState(session, "test write overwrite")
          await FileTime.read(session.id, filepath)
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          const result = await write.execute(
            {
              filePath: filepath,
              content: "new content",
            },
            testCtx,
          )

          expect(result.output).toContain("Wrote file successfully")
          expect(result.metadata.exists).toBe(true)

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("new content")
        },
      })
    })

    test("returns diff in metadata for existing files", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "old", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const { HeidiState } = await import("../../src/heidi/state")
          const { FileTime } = await import("../../src/file/time")
          const session = await Session.create({})
          await withExecutionState(session, "test write diff")
          await FileTime.read(session.id, filepath)
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          const result = await write.execute(
            {
              filePath: filepath,
              content: "new",
            },
            testCtx,
          )

          // Diff should be in metadata
          expect(result.metadata).toHaveProperty("filepath", filepath)
          expect(result.metadata).toHaveProperty("exists", true)
        },
      })
    })
  })

  describe("file permissions", () => {
    test("sets file permissions when writing sensitive data", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "sensitive.json")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const session = await Session.create({})
          await withExecutionState(session, "test write sensitive")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: filepath,
              content: JSON.stringify({ secret: "data" }),
            },
            testCtx,
          )

          // On Unix systems, check permissions
          if (process.platform !== "win32") {
            const stats = await fs.stat(filepath)
            expect(stats.mode & 0o200).toBe(0o200)
            expect(stats.mode & 0o002).toBe(0)
          }
        },
      })
    })
  })
  describe("file permissions", () => {
    test("sets file permissions when writing sensitive data", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "sensitive.json")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const session = await Session.create({})
          await withExecutionState(session, "test write sensitive")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: filepath,
              content: JSON.stringify({ secret: "data" }),
            },
            testCtx,
          )

          // On Unix systems, check permissions
          if (process.platform !== "win32") {
            const stats = await fs.stat(filepath)
            expect(stats.mode & 0o200).toBe(0o200)
            expect(stats.mode & 0o002).toBe(0)
          }
        },
      })
    })
  })

  describe("content types", () => {
    test("writes JSON content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "data.json")
      const data = { key: "value", nested: { array: [1, 2, 3] } }
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const session = await Session.create({})
          await withExecutionState(session, "test write json content")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: filepath,
              content: JSON.stringify(data, null, 2),
            },
            testCtx,
          )
          const content = await fs.readFile(filepath, "utf-8")
          expect(JSON.parse(content)).toEqual(data)
        },
      })
    })
    test("writes JSON content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "data.json")
      const data = { key: "value", nested: { array: [1, 2, 3] } }

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const session = await Session.create({})
          await withExecutionState(session, "test write json content")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: filepath,
              content: JSON.stringify(data, null, 2),
            },
            testCtx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(JSON.parse(content)).toEqual(data)
        },
      })
    })

    test("writes binary-safe content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "binary.bin")
      const content = "Hello\x00World\x01\x02\x03"

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const session = await Session.create({})
          await withExecutionState(session, "test write binary content")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: filepath,
              content,
            },
            testCtx,
          )

          const buf = await fs.readFile(filepath)
          expect(buf.toString()).toBe(content)
        },
      })
    })

    test("writes empty content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "empty.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const session = await Session.create({})
          await withExecutionState(session, "test write empty content")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: filepath,
              content: "",
            },
            testCtx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("")

          const stats = await fs.stat(filepath)
          expect(stats.size).toBe(0)
        },
      })
    })

    test("writes multi-line content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "multiline.txt")
      const lines = ["Line 1", "Line 2", "Line 3", ""].join("\n")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const session = await Session.create({})
          await withExecutionState(session, "test write multiline content")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: filepath,
              content: lines,
            },
            testCtx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe(lines)
        },
      })
    })

    test("handles different line endings", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "crlf.txt")
      const content = "Line 1\r\nLine 2\r\nLine 3"

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const session = await Session.create({})
          await withExecutionState(session, "test write crlf content")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await write.execute(
            {
              filePath: filepath,
              content,
            },
            testCtx,
          )

          const buf = await fs.readFile(filepath)
          expect(buf.toString()).toBe(content)
        },
      })
    })
  })

  describe("error handling", () => {
    test("throws error when OS denies write access", async () => {
      await using tmp = await tmpdir()
      const readonlyPath = path.join(tmp.path, "readonly.txt")
      await fs.writeFile(readonlyPath, "test", "utf-8")
      await fs.chmod(readonlyPath, 0o444)
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const { FileTime } = await import("../../src/file/time")
          const session = await Session.create({})
          await withExecutionState(session, "test write readonly")
          await FileTime.read(session.id, readonlyPath)
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          await expect(
            write.execute(
              {
                filePath: readonlyPath,
                content: "new content",
              },
              testCtx,
            ),
          ).rejects.toThrow()
        },
      })
    })
  })

  describe("title generation", () => {
    test("returns relative path as title", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "src", "components", "Button.tsx")
      await fs.mkdir(path.dirname(filepath), { recursive: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Session } = await import("../../src/session")
          const session = await Session.create({})
          await withExecutionState(session, "test write title")
          const write = await WriteTool.init()
          const testCtx = { ...baseCtx, sessionID: session.id }
          const result = await write.execute(
            {
              filePath: filepath,
              content: "export const Button = () => {}",
            },
            testCtx,
          )
          expect(result.title).toEndWith(path.join("src", "components", "Button.tsx"))
        },
      })
    })
  })
})
