import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import { Log } from "@/util/log"
import "@/audio/transport"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Flag } from "@/flag/flag"
import { ServerStats } from "../stats"
import { lazy } from "../../util/lazy"
import { AsyncQueue } from "../../util/queue"
import { Instance } from "@/project/instance"
import { SSEBatcher, SSEResumptionBuffer } from "../../util/sse"

const log = Log.create({ service: "server" })

const resumption = new SSEResumptionBuffer(100)

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
      const lastEventID = c.req.header("Last-Event-ID")

      c.header("X-Accel-Buffering", "no")
      c.header("X-Content-Type-Options", "nosniff")
      return streamSSE(c, async (stream) => {
        const close = ServerStats.open("event")
        const q = new AsyncQueue<{ data: string; id: string } | null>()
        let done = false

        const max = setTimeout(() => {
          q.push(null)
        }, Flag.OPENCODE_SSE_MAX_AGE_MS ?? 60 * 60 * 1000)
        max.unref?.()

        // Replay missed events if requested
        if (lastEventID) {
          const missed = resumption.getMissing(lastEventID)
          for (const item of missed) {
            q.push(item)
          }
        }

        const batcher = new SSEBatcher(q, resumption)

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
          for await (const item of q) {
            if (item === null) return
            await stream.writeSSE({ data: item.data, id: item.id })
          }
        } finally {
          stop()
        }
      })
    },
  ),
)
