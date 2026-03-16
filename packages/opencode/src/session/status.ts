import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Instance } from "@/project/instance"
import { SessionID } from "./schema"
import { Database, eq } from "../storage/db"
import { SessionTable } from "./session.sql"
import z from "zod"

export namespace SessionStatus {
  export const Info = z
    .union([
      z.object({
        type: z.literal("idle"),
      }),
      z.object({
        type: z.literal("retry"),
        attempt: z.number(),
        message: z.string(),
        next: z.number(),
      }),
      z.object({
        type: z.literal("busy"),
      }),
      z.object({
        type: z.literal("connecting"),
      }),
      z.object({
        type: z.literal("completed"),
      }),
    ])
    .meta({
      ref: "SessionStatus",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Status: BusEvent.define(
      "session.status",
      z.object({
        sessionID: SessionID.zod,
        status: Info,
      }),
    ),
    // deprecated
    Idle: BusEvent.define(
      "session.idle",
      z.object({
        sessionID: SessionID.zod,
      }),
    ),
  }

  // In-memory cache for fast reads
  const state = Instance.state(() => {
    const data: Record<string, Info> = {}
    return data
  })

  // Load status from database for a session
  function loadFromDB(sessionID: SessionID): Info | undefined {
    const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get())
    if (!row?.status) return undefined
    try {
      return JSON.parse(row.status) as Info
    } catch {
      return undefined
    }
  }

  // Persist status to database
  function persistToDB(sessionID: SessionID, status: Info): void {
    Database.use((db) => {
      db.update(SessionTable)
        .set({ status: JSON.stringify(status) })
        .where(eq(SessionTable.id, sessionID))
        .run()
    })
  }

  export function get(sessionID: SessionID) {
    // Try in-memory cache first
    const cached = state()[sessionID]
    if (cached) return cached

    // Fall back to DB
    const dbStatus = loadFromDB(sessionID)
    if (dbStatus) {
      state()[sessionID] = dbStatus
      return dbStatus
    }

    return {
      type: "idle",
    }
  }

  export function list() {
    return state()
  }

  export function set(sessionID: SessionID, status: Info) {
    Bus.publish(Event.Status, {
      sessionID,
      status,
    })

    // Update in-memory cache
    if (status.type === "idle") {
      // deprecated
      Bus.publish(Event.Idle, {
        sessionID,
      })
      delete state()[sessionID]
      // Clear from DB
      Database.use((db) => {
        db.update(SessionTable).set({ status: null }).where(eq(SessionTable.id, sessionID)).run()
      })
      return
    }

    state()[sessionID] = status

    // Persist to DB
    persistToDB(sessionID, status)
  }
}
