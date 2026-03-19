import z from "zod"
import { Database } from "../storage/db"
import { SessionTable } from "./session.sql"
import { Session } from "./index"

export const SessionStats = z.object({
  totalSessions: z.number(),
  totalMessages: z.number(),
  totalCost: z.number(),
  totalTokens: z.object({
    input: z.number(),
    output: z.number(),
    reasoning: z.number(),
    cache: z.object({
      read: z.number(),
      write: z.number(),
    }),
  }),
  toolUsage: z.record(z.string(), z.number()),
  modelUsage: z.record(
    z.string(),
    z.object({
      messages: z.number(),
      tokens: z.object({
        input: z.number(),
        output: z.number(),
        cache: z.object({
          read: z.number(),
          write: z.number(),
        }),
      }),
      cost: z.number(),
    }),
  ),
  dateRange: z.object({
    earliest: z.number(),
    latest: z.number(),
  }),
  days: z.number(),
  costPerDay: z.number(),
  tokensPerSession: z.number(),
  medianTokensPerSession: z.number(),
})

export type SessionStats = z.output<typeof SessionStats>

export async function aggregateSessionStats(input: {
  days?: number
  projectID?: string
  providerID?: string
} = {}): Promise<SessionStats> {
  const sessions = Database.use((db) => db.select().from(SessionTable).all()).map((row) => Session.fromRow(row))
  const day = 24 * 60 * 60 * 1000
  const cutoff = (() => {
    if (input.days === undefined) return 0
    if (input.days === 0) {
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      return now.getTime()
    }
    return Date.now() - input.days * day
  })()
  const span = (() => {
    if (input.days === undefined) return
    if (input.days === 0) return 1
    return input.days
  })()

  const list = sessions
    .filter((session) => (cutoff > 0 ? session.time.updated >= cutoff : true))
    .filter((session) => (input.projectID ? session.projectID === input.projectID : true))

  const stats: SessionStats = {
    totalSessions: 0,
    totalMessages: 0,
    totalCost: 0,
    totalTokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
    toolUsage: {},
    modelUsage: {},
    dateRange: {
      earliest: Date.now(),
      latest: Date.now(),
    },
    days: 0,
    costPerDay: 0,
    tokensPerSession: 0,
    medianTokensPerSession: 0,
  }

  if (list.length === 0) {
    stats.days = span ?? 0
    return stats
  }

  if (list.length > 1000) {
    console.log(`Large dataset detected (${list.length} sessions). This may take a while...`)
  }

  let earliest = Date.now()
  let latest = 0
  const totals: number[] = []
  const size = 20

  for (let i = 0; i < list.length; i += size) {
    const batch = list.slice(i, i + size)
    const rows = await Promise.all(
      batch.map(async (session) => {
        const messages = await Session.messages({ sessionID: session.id })

        let count = input.providerID ? 0 : messages.length
        let cost = 0
        let seen = !input.providerID
        let total = {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        }
        let tool: Record<string, number> = {}
        let model: Record<
          string,
          {
            messages: number
            tokens: { input: number; output: number; cache: { read: number; write: number } }
            cost: number
          }
        > = {}

        for (const message of messages) {
          if (message.info.role !== "assistant") continue
          const info = message.info
          const match = !input.providerID || info.providerID.startsWith(input.providerID)

          if (match) {
            seen = true
            if (input.providerID) count += 1
            cost += info.cost || 0

            const key = `${info.providerID}/${info.modelID}`
            model[key] ??= {
              messages: 0,
              tokens: { input: 0, output: 0, cache: { read: 0, write: 0 } },
              cost: 0,
            }
            model[key].messages += 1
            model[key].cost += info.cost || 0

            if (info.tokens) {
              total.input += info.tokens.input || 0
              total.output += info.tokens.output || 0
              total.reasoning += info.tokens.reasoning || 0
              total.cache.read += info.tokens.cache?.read || 0
              total.cache.write += info.tokens.cache?.write || 0

              model[key].tokens.input += info.tokens.input || 0
              model[key].tokens.output += (info.tokens.output || 0) + (info.tokens.reasoning || 0)
              model[key].tokens.cache.read += info.tokens.cache?.read || 0
              model[key].tokens.cache.write += info.tokens.cache?.write || 0
            }
          }

          if (!match && input.providerID) continue
          for (const part of message.parts) {
            if (part.type !== "tool" || !part.tool) continue
            tool[part.tool] = (tool[part.tool] || 0) + 1
          }
        }

        return {
          seen,
          count,
          cost,
          total,
          tokens: total.input + total.output + total.reasoning + total.cache.read + total.cache.write,
          tool,
          model,
          earliest: cutoff > 0 ? session.time.updated : session.time.created,
          latest: session.time.updated,
        }
      }),
    )

    for (const row of rows) {
      if (!row.seen) continue
      earliest = Math.min(earliest, row.earliest)
      latest = Math.max(latest, row.latest)
      totals.push(row.tokens)
      stats.totalSessions += 1
      stats.totalMessages += row.count
      stats.totalCost += row.cost
      stats.totalTokens.input += row.total.input
      stats.totalTokens.output += row.total.output
      stats.totalTokens.reasoning += row.total.reasoning
      stats.totalTokens.cache.read += row.total.cache.read
      stats.totalTokens.cache.write += row.total.cache.write

      for (const [key, value] of Object.entries(row.tool)) {
        stats.toolUsage[key] = (stats.toolUsage[key] || 0) + value
      }

      for (const [key, value] of Object.entries(row.model)) {
        stats.modelUsage[key] ??= {
          messages: 0,
          tokens: { input: 0, output: 0, cache: { read: 0, write: 0 } },
          cost: 0,
        }
        stats.modelUsage[key].messages += value.messages
        stats.modelUsage[key].tokens.input += value.tokens.input
        stats.modelUsage[key].tokens.output += value.tokens.output
        stats.modelUsage[key].tokens.cache.read += value.tokens.cache.read
        stats.modelUsage[key].tokens.cache.write += value.tokens.cache.write
        stats.modelUsage[key].cost += value.cost
      }
    }
  }

  if (stats.totalSessions === 0) {
    stats.days = span ?? 0
    return stats
  }

  const days = Math.max(1, Math.ceil((latest - earliest) / day))
  const total =
    stats.totalTokens.input +
    stats.totalTokens.output +
    stats.totalTokens.reasoning +
    stats.totalTokens.cache.read +
    stats.totalTokens.cache.write

  totals.sort((a, b) => a - b)
  const mid = Math.floor(totals.length / 2)

  stats.dateRange = { earliest, latest }
  stats.days = span ?? days
  stats.costPerDay = stats.totalCost / stats.days
  stats.tokensPerSession = total / stats.totalSessions
  stats.medianTokensPerSession =
    totals.length % 2 === 0 ? (totals[mid - 1] + totals[mid]) / 2 : totals[mid]

  return stats
}