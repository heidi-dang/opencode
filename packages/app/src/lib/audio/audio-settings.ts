import { pack_labels, pack_preview, pack_src } from "@opencode-ai/workflow-audio"
import type { CueID, PackID } from "@opencode-ai/workflow-audio/types"

export const PACK_OPTIONS: { value: PackID; label: string }[] = Object.entries(pack_labels).map(([value, label]) => ({
  value: value as PackID,
  label,
}))

export function assetSrc(src: string, dir?: string) {
  if (!dir || !src.startsWith("/")) return src
  if (src === `/${dir}` || src.startsWith(`/${dir}/`)) return src
  return `/${dir}${src}`
}

export function routeDir(path?: string) {
  return path?.replace(/^\/+/, "").split("/").filter(Boolean)[0]
}

export function cueSrc(pack: PackID, cue: CueID, dir?: string) {
  return assetSrc(pack_src(pack, cue), dir)
}

export function previewSrc(pack: PackID, dir?: string) {
  return cueSrc(pack, "turn.complete", dir)
}

export function generatedPreviewSrc(dir?: string) {
  return assetSrc("/audio/generated/preview.json", dir)
}

export function previewList(pack: PackID, dir?: string) {
  return (pack_preview[pack] ?? []).map((item) => ({
    ...item,
    src: assetSrc(`/audio/${pack}/${item.file}`, dir),
    speaker: "system" as const,
  }))
}
