import path from "node:path"
import { analyze_audio, sidecar_file } from "./analyze"
import { render_music } from "./renderers/music/engine"
import { render_sfx } from "./renderers/sfx/engine"
import { route_engine } from "./router"
import { score_music } from "./scoring/score_music"
import { score_sfx } from "./scoring/score_sfx"
import type { AudioSpec } from "./types"
import { encode_wav } from "./wav"

function apply(spec: AudioSpec, changes: string[]) {
  const next = structuredClone(spec)
  for (const item of changes) {
    const text = item.toLowerCase()
    if (text.includes("attack") || text.includes("punch")) next.intensity = Math.min(1, next.intensity + 0.08)
    if (text.includes("harsh") || text.includes("reduce highs")) next.brightness = Math.max(0.18, next.brightness - 0.1)
    if (text.includes("premium") || text.includes("futur")) {
      next.brightness = Math.min(0.9, next.brightness + 0.05)
      next.targets.fullness = Math.min(0.9, next.targets.fullness + 0.05)
    }
    const short = text.match(/shorten tail by (\d+)ms/)
    if (short) next.targets.tail_ms = Math.max(30, next.targets.tail_ms - Number(short[1]))
    if (text.includes("more cyber")) next.style_family = "cyber-ops"
  }
  next.seed += 173
  return next
}

export async function edit_audio(source_file: string, changes: string[]) {
  const sidecar = sidecar_file(source_file)
  const blob = Bun.file(sidecar)
  if (!(await blob.exists())) throw new Error(`Missing sidecar for ${source_file}`)
  const data = await blob.json() as { spec: AudioSpec }
  const spec = apply(data.spec, changes)
  const engine = route_engine(spec)
  const dir = path.dirname(source_file)
  const base = path.basename(source_file).replace(/\.[^.]+$/, "")
  const file = path.join(dir, `${base}_edit.wav`)
  const rendered = engine === "sfx-engine" ? render_sfx(spec, 0) : render_music(spec)
  await Bun.write(file, encode_wav({ sample_rate: rendered.sample_rate, channels: 2, left: rendered.left, right: rendered.right }))
  const metrics = await analyze_audio(file)
  const score = engine === "sfx-engine" ? score_sfx(metrics, spec) : score_music(metrics, spec)
  await Bun.write(sidecar_file(file), JSON.stringify({ generated_at: new Date().toISOString(), source_file, changes, engine, spec, metrics, score }, null, 2))
  return { file, sidecar: sidecar_file(file), engine, spec, metrics, score }
}
