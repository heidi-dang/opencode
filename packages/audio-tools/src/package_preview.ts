import path from "node:path"
import { mkdir } from "node:fs/promises"
import { analyze_audio, basename_no_ext, sidecar_file } from "./analyze"
import type { AudioPreviewItem, PreviewPackage, ScoreCard } from "./types"

function public_url(file: string) {
  const clean = file.replaceAll("\\", "/")
  const idx = clean.indexOf("/public/")
  if (idx >= 0) return clean.slice(idx + 7)
  return path.basename(file)
}

function default_score(): ScoreCard {
  return { total: 0, breakdown: {}, notes: [] }
}

async function load_sidecar(file: string) {
  const sidecar = sidecar_file(file)
  const blob = Bun.file(sidecar)
  if (!(await blob.exists())) return undefined
  return blob.json() as Promise<any>
}

export async function package_preview(files: string[], manifest_path: string, preview_route: string, preview_path?: string) {
  const items = [] as AudioPreviewItem[]
  for (const file of files) {
    const data = await load_sidecar(file)
    const metrics = data?.metrics ?? (await analyze_audio(file))
    const score = data?.score ?? default_score()
    const cue = data?.spec?.cue_name ?? basename_no_ext(file)
    const created_at = data?.generated_at ?? new Date().toISOString()
    items.push({
      cue,
      file,
      url: public_url(file),
      purpose: data?.spec?.prompt ?? cue,
      metrics,
      score,
      engine: data?.engine ?? "sfx-engine",
      waveform: metrics.waveform,
      history: [
        {
          version: path.basename(file),
          file,
          score: score.total,
          created_at,
        },
      ],
    })
  }

  const preview_file = preview_path ?? path.join(path.dirname(manifest_path), "preview.json")
  const payload: PreviewPackage = {
    route: preview_route,
    preview_path: preview_file,
    generated_at: new Date().toISOString(),
    items,
  }

  await mkdir(path.dirname(preview_file), { recursive: true })
  await Bun.write(preview_file, JSON.stringify(payload, null, 2))
  return payload
}
