import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import "@/audio/transport"
import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"
import { AsyncQueue } from "@/util/queue"
import { Instance } from "../../project/instance"
import { Installation } from "@/installation"
import { Log } from "../../util/log"
import { lazy } from "../../util/lazy"
import { Config } from "../../config/config"
import { errors } from "../error"
import { Flag } from "@/flag/flag"
import { ServerStats } from "../stats"
import { SSEBatcher, SSEResumptionBuffer } from "../../util/sse"

const log = Log.create({ service: "server" })

export const GlobalDisposedEvent = BusEvent.define("global.disposed", z.object({}))

const resumption = new SSEResumptionBuffer(50)

export const GlobalRoutes = lazy(() =>
  new Hono()
    .get(
      "/health",
      describeRoute({
        summary: "Get health",
        description: "Get health information about the OpenCode server.",
        operationId: "global.health",
        responses: {
          200: {
            description: "Health information",
            content: {
              "application/json": {
                schema: resolver(z.object({ healthy: z.literal(true), version: z.string() })),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json({ healthy: true, version: Installation.VERSION })
      },
    )
    .get(
      "/event",
      describeRoute({
        summary: "Get global events",
        description: "Subscribe to global events from the OpenCode system using server-sent events.",
        operationId: "global.event",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(
                  z
                    .object({
                      directory: z.string(),
                      payload: BusEvent.payloads(),
                    })
                    .meta({
                      ref: "GlobalEvent",
                    }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("global event connected")
        const lastEventID = c.req.header("Last-Event-ID")

        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")
        return streamSSE(c, async (stream) => {
          const close = ServerStats.open("global")
          const q = new AsyncQueue<{ data: string; id: string } | null>()
          let done = false

          const max = setTimeout(() => {
            q.push(null)
          }, Flag.OPENCODE_SSE_MAX_AGE_MS ?? 60 * 60 * 1000)
          max.unref?.()

          if (lastEventID) {
            const missed = resumption.getMissing(lastEventID)
            for (const item of missed) {
              q.push(item)
            }
          }

          const batcher = new SSEBatcher(q, resumption)

          batcher.push({
            payload: {
              type: "server.connected",
              properties: {},
            },
          })

          // Send heartbeat every 10s to prevent stalled proxy streams.
          const heartbeat = setInterval(() => {
            batcher.push({
              payload: {
                type: "server.heartbeat",
                properties: {},
              },
            })
          }, 10_000)

          async function handler(event: any) {
            batcher.push(event)
          }
          GlobalBus.on("event", handler)

          const stop = () => {
            if (done) return
            done = true
            clearTimeout(max)
            clearInterval(heartbeat)
            GlobalBus.off("event", handler)
            q.push(null)
            close()
            log.info("global event disconnected")
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
    )
    .get(
      "/config",
      describeRoute({
        summary: "Get global configuration",
        description: "Retrieve the current global OpenCode configuration settings and preferences.",
        operationId: "global.config.get",
        responses: {
          200: {
            description: "Get global config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.getGlobal())
      },
    )
    .patch(
      "/config",
      describeRoute({
        summary: "Update global configuration",
        description: "Update global OpenCode configuration settings and preferences.",
        operationId: "global.config.update",
        responses: {
          200: {
            description: "Successfully updated global config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        const config = c.req.valid("json")
        const next = await Config.updateGlobal(config)
        return c.json(next)
      },
    )
    .post(
      "/dispose",
      describeRoute({
        summary: "Dispose instance",
        description: "Clean up and dispose all OpenCode instances, releasing all resources.",
        operationId: "global.dispose",
        responses: {
          200: {
            description: "Global disposed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Instance.disposeAll()
        GlobalBus.emit("event", {
          directory: "global",
          payload: {
            type: GlobalDisposedEvent.type,
            properties: {},
          },
        })
        return c.json(true)
      },
    ),
)
