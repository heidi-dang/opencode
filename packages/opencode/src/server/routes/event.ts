import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import { Log } from "@/util/log"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Flag } from "@/flag/flag"
import { ServerStats } from "../stats"
import { lazy } from "../../util/lazy"
import { AsyncQueue } from "../../util/queue"
import { Instance } from "@/project/instance"
import { SSEResumptionBuffer, SSEBatcher } from "@/util/sse"

const log = Log.create({ service: "server" })

const globalEventBuffer = new SSEResumptionBuffer(500)

export const EventRoutes = lazy(() =>
  new Hono().get(
    "/event",
    describeRoute({
      summary: "Subscribe to events",
      description: "Get events",
      operationId: "event.subscribe",
      responses: {
        200: {
          description: "Event stream",
          content: {
            "text/event-stream": {
              schema: resolver(BusEvent.payloads()),
            },
          },
        },
      },
    }),
    async (c) => {
      log.info("event connected")
      c.header("X-Accel-Buffering", "no")
      c.header("X-Content-Type-Options", "nosniff")
      return streamSSE(c, async (stream) => {
        const close = ServerStats.open("event")
        const q = new AsyncQueue<{ data: string; id: string } | null>()
        const batcher = new SSEBatcher<any>(q, globalEventBuffer)
        let done = false

        const max = setTimeout(() => {
          q.push(null)
        }, Flag.OPENCODE_SSE_MAX_AGE_MS ?? 60 * 60 * 1000)
        max.unref?.()

        // Handle Reconnection
        const lastEventId = c.req.header("Last-Event-ID")
        if (lastEventId) {
          const missing = globalEventBuffer.getMissing(lastEventId)
          for (const msg of missing) {
            q.push({ data: msg.data, id: msg.id })
          }
        }

        batcher.push({
          type: "server.connected",
          properties: {},
        })

        // Send heartbeat every 10s to prevent stalled proxy streams.
        const heartbeat = setInterval(() => {
          batcher.push({
            type: "server.heartbeat",
            properties: {},
          })
        }, 10_000)

        const unsub = Bus.subscribeAll((event) => {
          batcher.push(event)
          if (event.type === Bus.InstanceDisposed.type) {
            stop()
          }
        })

        const stop = () => {
          if (done) return
          done = true
          clearTimeout(max)
          clearInterval(heartbeat)
          unsub()
          q.push(null)
          close()
          log.info("event disconnected")
        }

        stream.onAbort(stop)

        try {
          for await (const chunk of q) {
            if (chunk === null) {
              batcher.flush()
              return
            }
            await stream.writeSSE({ data: chunk.data, id: chunk.id })
          }
        } finally {
          stop()
        }
      })
    },
  ),
)
