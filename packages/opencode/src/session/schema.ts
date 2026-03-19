import { Schema } from "effect"
import z from "zod"

import { Identifier } from "@/id/id"
import { withStatics } from "@/util/schema"

export const SessionID = Schema.String.pipe(
  Schema.brand("SessionID"),
  withStatics((s) => ({
    make: (id: string) => s.makeUnsafe(id),
    descending: (id?: string) => s.makeUnsafe(Identifier.descending("session", id)),
    zod: Identifier.schema("session") as unknown as z.ZodType<typeof s.Type>,
  })),
)

export type SessionID = Schema.Schema.Type<typeof SessionID>

export const MessageID = Schema.String.pipe(
  Schema.brand("MessageID"),
  withStatics((s) => ({
    make: (id: string) => s.makeUnsafe(id),
    ascending: (id?: string) => s.makeUnsafe(Identifier.ascending("message", id)),
    zod: Identifier.schema("message") as unknown as z.ZodType<typeof s.Type>,
  })),
)

export type MessageID = Schema.Schema.Type<typeof MessageID>

export const PartID = Schema.String.pipe(
  Schema.brand("PartID"),
  withStatics((s) => ({
    make: (id: string) => s.makeUnsafe(id),
    ascending: (id?: string) => s.makeUnsafe(Identifier.ascending("part", id)),
    zod: Identifier.schema("part") as unknown as z.ZodType<typeof s.Type>,
  })),
)

export type PartID = Schema.Schema.Type<typeof PartID>
