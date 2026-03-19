import { describe, test, expect } from "bun:test"
import { createServer } from "http"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { SessionID, MessageID } from "../../src/session/schema"
import { BrowserSubagentTool } from "../../src/tool/browser_subagent"
import { Filesystem } from "../../src/util/filesystem"
import { HeidiState } from "../../src/heidi/state"

const ctx = {
  sessionID: SessionID.make("ses_browser-test"),
  messageID: MessageID.make("msg_browser-test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

function startTestServer(content = "<html>ok</html>", status = 200, contentType = "text/html") {
  return new Promise<{ server: any; url: string }>((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(status, { "Content-Type": contentType })
      res.end(content)
    })
    server.listen(0, () => {
      const addr = server.address()
      let port: number
      if (typeof addr === "object" && addr && "port" in addr) {
        port = (addr as import("net").AddressInfo).port
      } else if (typeof addr === "number") {
        port = addr
      } else {
        throw new Error("Could not determine server port")
      }
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

describe("browser_subagent", () => {
  test("persists HTML artifact and evidence metadata", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { server, url } = await startTestServer("<html>proof</html>", 201, "text/html; charset=utf-8")
        try {
          const tool = await BrowserSubagentTool.init()
          const result = await tool.execute({ url, checks: [] }, ctx)
          expect(result.metadata.status).toBe("pass")
          expect(result.metadata.http_status).toBe(201)
          expect(result.metadata.content_type).toContain("text/html")
          // Check artifact file exists
          const files = await HeidiState.files(ctx.sessionID)
          const htmlPath = files.verification.replace(/verification.json$/, "browser-evidence.html")
          const html = await Filesystem.readText(htmlPath)
          expect(html).toContain("proof")
        } finally {
          // @ts-ignore
          server.close()
        }
      },
    })
  })

  test("evidence records HTTP error and status", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { server, url } = await startTestServer("fail", 404, "text/plain")
        try {
          const tool = await BrowserSubagentTool.init()
          const result = await tool.execute({ url, checks: [] }, ctx)
          expect(result.metadata.status).toBe("fail")
          expect(result.metadata.http_status).toBe(404)
          expect(result.metadata.content_type).toContain("text/plain")
          expect(result.metadata.network_failures[0]).toContain("HTTP 404")
        } finally {
          // @ts-ignore
          server.close()
        }
      },
    })
  })
})