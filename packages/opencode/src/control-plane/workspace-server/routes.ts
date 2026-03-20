import { GlobalBus } from "../../bus/global"
import { Flag } from "@/flag/flag"
import { ServerStats } from "../../server/stats"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

export function WorkspaceServerRoutes() {
  return new Hono().get("/event", async (c) => {
    c.header("X-Accel-Buffering", "no")
    c.header("X-Content-Type-Options", "nosniff")
    return streamSSE(c, async (stream) => {
      const close = ServerStats.open("workspace")
      const max = setTimeout(
        () => {
          stream.close()
        },
        Flag.OPENCODE_SSE_MAX_AGE_MS ?? 60 * 60 * 1000,
      )
      max.unref?.()
      const send = async (event: unknown) => {
        await stream.writeSSE({
          data: JSON.stringify(event),
        })
      }
      const handler = async (event: { directory?: string; payload: unknown }) => {
        await send(event.payload)
      }
      GlobalBus.on("event", handler)
      await send({ type: "server.connected", properties: {} })
      const heartbeat = setInterval(() => {
        void send({ type: "server.heartbeat", properties: {} })
      }, 10_000)

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          clearTimeout(max)
          clearInterval(heartbeat)
          GlobalBus.off("event", handler)
          close()
          resolve()
        })
      })
    })
  })
}
