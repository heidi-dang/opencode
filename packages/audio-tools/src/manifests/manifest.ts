import path from "node:path"
import { mkdir } from "node:fs/promises"
import type { AudioVariant } from "../types"

export async function write_variant_manifest(file: string, variants: AudioVariant[]) {
  await mkdir(path.dirname(file), { recursive: true })
  const payload = {
    generated_at: new Date().toISOString(),
    variants: variants.map((item) => ({
      file: item.file,
      sidecar: item.sidecar,
      engine: item.engine,
      score: item.score,
      metrics: item.metrics,
      cue_name: item.spec.cue_name,
      style_family: item.spec.style_family,
    })),
  }
  await Bun.write(file, JSON.stringify(payload, null, 2))
  return file
}
