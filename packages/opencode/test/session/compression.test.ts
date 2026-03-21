import { describe, expect, test } from "bun:test"
import { Command } from "../../src/command"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionCompression } from "../../src/session/compression"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID } from "../../src/session/schema"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { Storage } from "../../src/storage/storage"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

async function addUser(sessionID: Awaited<ReturnType<typeof Session.create>>["id"], text: string) {
  const msg = await Session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "build",
    model: {
      providerID: ProviderID.make("test"),
      modelID: ModelID.make("test-model"),
    },
    time: {
      created: Date.now(),
    },
  })

  await Session.updatePart({
    id: PartID.ascending(),
    messageID: msg.id,
    sessionID,
    type: "text",
    text,
  })

  return msg
}

async function addAssistant(
  sessionID: Awaited<ReturnType<typeof Session.create>>["id"],
  parentID: ReturnType<typeof MessageID.ascending>,
  parts: Array<
    | {
        type: "text"
        text: string
      }
    | {
        type: "tool"
        tool: string
        callID: string
        state:
          | {
              status: "completed"
              input: Record<string, any>
              output: string
            }
          | {
              status: "error"
              input: Record<string, any>
              error: string
            }
      }
  >,
) {
  const msg = await Session.updateMessage({
    id: MessageID.ascending(),
    role: "assistant",
    sessionID,
    mode: "build",
    agent: "build",
    path: {
      cwd: Instance.directory,
      root: Instance.worktree,
    },
    cost: 0,
    tokens: {
      output: 0,
      input: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    modelID: ModelID.make("test-model"),
    providerID: ProviderID.make("test"),
    parentID,
    time: {
      created: Date.now(),
    },
    finish: "stop",
  })

  for (const part of parts) {
    if (part.type === "text") {
      await Session.updatePart({
        id: PartID.ascending(),
        messageID: msg.id,
        sessionID,
        type: "text",
        text: part.text,
      })
      continue
    }

    if (part.state.status === "completed") {
      await Session.updatePart({
        id: PartID.ascending(),
        messageID: msg.id,
        sessionID,
        type: "tool",
        tool: part.tool,
        callID: part.callID,
        state: {
          status: "completed",
          input: part.state.input,
          output: part.state.output,
          title: part.tool,
          metadata: {},
          time: {
            start: Date.now(),
            end: Date.now(),
          },
        },
      })
      continue
    }

    await Session.updatePart({
      id: PartID.ascending(),
      messageID: msg.id,
      sessionID,
      type: "tool",
      tool: part.tool,
      callID: part.callID,
      state: {
        status: "error",
        input: part.state.input,
        error: part.state.error,
        time: {
          start: Date.now(),
          end: Date.now(),
        },
      },
    })
  }

  return msg
}

describe("session.compression", () => {
  test("registers built-in commands", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const list = await Command.list()
        expect(list.find((item) => item.name === "context")?.source).toBe("builtin")
        expect(list.find((item) => item.name === "compact")?.source).toBe("builtin")
        expect(list.find((item) => item.name === "decompress")?.source).toBe("builtin")
      },
    })
  })

  test("applies active compression ranges ephemerally", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const u1 = await addUser(session.id, "Investigate auth flow")
        await addAssistant(session.id, u1.id, [{ type: "text", text: "Reviewed auth.ts and found a race." }])
        const u2 = await addUser(session.id, "Patch refresh handling")
        const a2 = await addAssistant(session.id, u2.id, [{ type: "text", text: "Patched refresh handling and added tests." }])

        await Storage.write(["session_compression", session.id], {
          next: 2,
          items: [
            {
              id: 1,
              start: u1.id,
              end: a2.id,
              summary: "Auth work summary",
              topic: "auth",
              active: true,
              tokens: { before: 40, after: 10, saved: 30 },
              time: { created: Date.now(), updated: Date.now() },
            },
          ],
        })

        const msgs = await Session.messages({ sessionID: session.id })
        await SessionCompression.apply({ sessionID: session.id, messages: msgs })

        expect(msgs).toHaveLength(2)
        expect(msgs[0].info.role).toBe("user")
        expect(msgs[1].info.role).toBe("assistant")
        const part = msgs[1].parts.find((part) => part.type === "text") as MessageV2.TextPart
        expect(part.text).toContain("Auth work summary")

        await Session.remove(session.id)
      },
    })
  })

  test("expands a new compression range to include active overlaps", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const u1 = await addUser(session.id, "Turn one")
        const a1 = await addAssistant(session.id, u1.id, [{ type: "text", text: "A1" }])
        const u2 = await addUser(session.id, "Turn two")
        await addAssistant(session.id, u2.id, [{ type: "text", text: "A2" }])
        const u3 = await addUser(session.id, "Turn three")
        const a3 = await addAssistant(session.id, u3.id, [{ type: "text", text: "A3" }])

        const msgs = await Session.messages({ sessionID: session.id })
        const items = [
          SessionCompression.Item.parse({
            id: 1,
            start: u2.id,
            end: a3.id,
            summary: "Nested summary",
            topic: "nested",
            active: true,
            tokens: { before: 20, after: 10, saved: 10 },
            time: { created: Date.now(), updated: Date.now() },
          }),
        ]

        expect(SessionCompression.expand(msgs, items, { start: 0, end: 3 })).toEqual({ start: 0, end: 5 })

        const projected = SessionCompression.project({
          sessionID: session.id,
          messages: msgs,
          items,
          range: { start: 0, end: 5 },
        })

        expect(projected[0].info.id).toBe(u1.id)
        expect(projected[1].info.id).toBe(a1.id)
        expect(projected[2].info.role).toBe("user")
        expect(projected[3].info.role).toBe("assistant")
        const nested = projected[3].parts.find((part) => part.type === "text") as MessageV2.TextPart
        expect(nested.text).toContain("Nested summary")

        await Session.remove(session.id)
      },
    })
  })

  test("decompresses and recompresses stored ranges", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const user = await addUser(session.id, "Check build")
        const assistant = await addAssistant(session.id, user.id, [{ type: "text", text: "Build checked." }])

        await Storage.write(["session_compression", session.id], {
          next: 2,
          items: [
            {
              id: 1,
              start: user.id,
              end: assistant.id,
              summary: "Build summary",
              topic: "build",
              active: true,
              tokens: { before: 20, after: 8, saved: 12 },
              time: { created: Date.now(), updated: Date.now() },
            },
          ],
        })

        expect(await SessionCompression.decompress({ sessionID: session.id, arguments: "1" })).toContain("Decompressed")
        let state = await Storage.read<{ next: number; items: Array<{ active: boolean }> }>(["session_compression", session.id])
        expect(state.items[0].active).toBe(false)

        expect(await SessionCompression.recompress({ sessionID: session.id, arguments: "1" })).toContain("Recompressed")
        state = await Storage.read<{ next: number; items: Array<{ active: boolean }> }>(["session_compression", session.id])
        expect(state.items[0].active).toBe(true)

        await Session.remove(session.id)
      },
    })
  })

  test("recompress allows overlapping active ranges", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const u1 = await addUser(session.id, "Turn one")
        const a1 = await addAssistant(session.id, u1.id, [{ type: "text", text: "A1" }])
        const u2 = await addUser(session.id, "Turn two")
        const a2 = await addAssistant(session.id, u2.id, [{ type: "text", text: "A2" }])

        await Storage.write(["session_compression", session.id], {
          next: 3,
          items: [
            {
              id: 1,
              start: u1.id,
              end: a2.id,
              summary: "Outer summary",
              topic: "outer",
              active: true,
              tokens: { before: 30, after: 10, saved: 20 },
              time: { created: Date.now(), updated: Date.now() },
            },
            {
              id: 2,
              start: u2.id,
              end: a2.id,
              summary: "Inner summary",
              topic: "inner",
              active: false,
              tokens: { before: 15, after: 8, saved: 7 },
              time: { created: Date.now(), updated: Date.now() },
            },
          ],
        })

        expect(await SessionCompression.recompress({ sessionID: session.id, arguments: "2" })).toContain("Recompressed")

        const msgs = await Session.messages({ sessionID: session.id })
        await SessionCompression.apply({ sessionID: session.id, messages: msgs })
        expect(msgs).toHaveLength(2)
        const part = msgs[1].parts.find((part) => part.type === "text") as MessageV2.TextPart
        expect(part.text).toContain("Outer summary")

        await Session.remove(session.id)
      },
    })
  })

  test("context distinguishes top-level and nested compressions", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const u1 = await addUser(session.id, "Turn one")
        const a1 = await addAssistant(session.id, u1.id, [{ type: "text", text: "A1" }])
        const u2 = await addUser(session.id, "Turn two")
        const a2 = await addAssistant(session.id, u2.id, [{ type: "text", text: "A2" }])

        await Storage.write(["session_compression", session.id], {
          next: 3,
          items: [
            {
              id: 1,
              start: u1.id,
              end: a2.id,
              summary: "Outer summary",
              topic: "outer",
              active: true,
              tokens: { before: 30, after: 10, saved: 20 },
              time: { created: Date.now(), updated: Date.now() },
            },
            {
              id: 2,
              start: u2.id,
              end: a2.id,
              summary: "Inner summary",
              topic: "inner",
              active: true,
              tokens: { before: 15, after: 8, saved: 7 },
              time: { created: Date.now(), updated: Date.now() },
            },
          ],
        })

        const text = await SessionCompression.context(session.id)
        expect(text).toContain("#1 turns 1..2 saved 20 tokens | outer [top-level]")
        expect(text).toContain("#2 turns 2 saved 7 tokens | inner [nested under #1]")

        await Session.remove(session.id)
      },
    })
  })

  test("sweeps recent tool outputs while keeping protected tools", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const user = await addUser(session.id, "Inspect files")
        const assistant = await addAssistant(session.id, user.id, [
          {
            type: "tool",
            tool: "read",
            callID: "call-1",
            state: {
              status: "completed",
              input: { filePath: "src/auth.ts" },
              output: "very long output".repeat(20),
            },
          },
          {
            type: "tool",
            tool: "task",
            callID: "call-2",
            state: {
              status: "completed",
              input: { prompt: "keep me" },
              output: "protected",
            },
          },
        ])

        expect(await SessionCompression.sweep({ sessionID: session.id })).toContain("Swept 1 tool call")

        const stored = await MessageV2.get({ sessionID: session.id, messageID: assistant.id })
        const readPart = stored.parts.find(
          (part): part is MessageV2.ToolPart => part.type === "tool" && part.tool === "read",
        )
        const taskPart = stored.parts.find(
          (part): part is MessageV2.ToolPart => part.type === "tool" && part.tool === "task",
        )
        expect(readPart?.state.status).toBe("completed")
        if (readPart?.state.status !== "completed") throw new Error("expected read tool")
        expect(readPart.state.time.compacted).toBeDefined()
        expect(readPart.state.time.inputCompacted).toBeDefined()
        if (taskPart?.state.status !== "completed") throw new Error("expected task tool")
        expect(taskPart.state.time.compacted).toBeUndefined()

        await Session.remove(session.id)
      },
    })
  })

  test("routes /context through the built-in command path", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const user = await addUser(session.id, "Review session status")
        await addAssistant(session.id, user.id, [{ type: "text", text: "Status reviewed." }])

        const result = await SessionPrompt.command({
          sessionID: session.id,
          command: "context",
          arguments: "",
        })

        expect(result.info.role).toBe("assistant")
        const part = result.parts.find((part): part is MessageV2.TextPart => part.type === "text")
        expect(part?.text).toContain("Context stats")

        await Session.remove(session.id)
      },
    })
  })
})