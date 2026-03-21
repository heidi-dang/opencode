import z from "zod"
import { category_ids, cue_ids, pack_ids, source_ids } from "./types"

export const CueSchema = z.enum(cue_ids).meta({ ref: "WorkflowAudioCue" })
export const PackSchema = z.enum(pack_ids).meta({ ref: "WorkflowAudioPack" })
export const CategorySchema = z.enum(category_ids).meta({ ref: "WorkflowAudioCategory" })
export const SourceSchema = z.enum(source_ids).meta({ ref: "WorkflowAudioSource" })

export const WorkflowAudioEvent = z
  .object({
    id: z.string(),
    time: z.number(),
    cue: CueSchema,
    category: CategorySchema,
    source: SourceSchema,
    priority: z.number(),
    sessionID: z.string().optional(),
    dedupe: z.string().optional(),
    combo: z.string().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ ref: "WorkflowAudioEvent" })

export type WorkflowAudioEvent = z.infer<typeof WorkflowAudioEvent>