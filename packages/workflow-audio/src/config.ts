import z from "zod"
import { default_audio } from "./defaults"
import { PackSchema } from "./events"

export const WorkflowAudioConfig = z
  .object({
    enabled: z.boolean().default(default_audio.enabled),
    pack: PackSchema.default(default_audio.pack),
    volume: z.number().min(0).max(100).default(default_audio.volume),
    debug: z.boolean().default(default_audio.debug),
  })
  .meta({ ref: "WorkflowAudioConfig" })

export type WorkflowAudioConfig = z.infer<typeof WorkflowAudioConfig>