import { pack_labels, pack_preview, pack_src } from "@opencode-ai/workflow-audio"
import type { CueID, PackID } from "@opencode-ai/workflow-audio/types"

export const PACK_OPTIONS: { value: PackID; label: string }[] = Object.entries(pack_labels).map(
  ([value, label]) => ({
    value: value as PackID,
    label,
  }),
)

export function cueSrc(pack: PackID, cue: CueID) {
  return pack_src(pack, cue)
}

export function previewSrc(pack: PackID) {
  return cueSrc(pack, "turn.complete")
}

export function previewList(pack: PackID) {
  return pack_preview[pack].map((item) => ({
    ...item,
    src: `/audio/${pack}/${item.file}`,
    speaker: "system" as const,
  }))
}