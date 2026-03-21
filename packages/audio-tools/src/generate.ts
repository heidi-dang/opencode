import path from "node:path"
import { mkdir } from "node:fs/promises"
import { analyze_audio, sidecar_file } from "./analyze"
import { write_variant_manifest } from "./manifests/manifest"
import { render_music } from "./renderers/music/engine"
import { music_provider } from "./renderers/music/provider"
import { render_sfx } from "./renderers/sfx/engine"
import { route_engine } from "./router"
import { score_music } from "./scoring/score_music"
import { score_sfx } from "./scoring/score_sfx"
import { spec_from_input } from "./spec"
import type { AudioSpec, AudioVariant } from "./types"
import { encode_wav } from "./wav"

function hash(text: string) {
  let out = 0
  for (let i = 0; i < text.length; i++) out = (out * 31 + text.charCodeAt(i)) >>> 0
  return out || 1
}

async function write_sidecar(file: string, data: unknown) {
  await Bun.write(sidecar_file(file), JSON.stringify(data, null, 2))
}

function variant_file(spec: AudioSpec, idx: number) {
  return path.join(spec.output_dir, `${spec.cue_name}_v${idx + 1}.wav`)
}

function refine(spec: AudioSpec, notes: string[]) {
  const next = structuredClone(spec)
  for (const note of notes) {
    const lower = note.toLowerCase()
    if (lower.includes("harsh")) next.brightness = Math.max(0.18, next.brightness - 0.08)
    if (lower.includes("tail")) next.targets.tail_ms = Math.max(40, next.targets.tail_ms - 80)
    if (lower.includes("attack")) next.intensity = Math.min(1, next.intensity + 0.06)
  }
  next.seed += 401
  return next
}

export async function generate_audio(input: Parameters<typeof spec_from_input>[0], root: string) {
  const spec = spec_from_input(input, root, hash(JSON.stringify(input)))
  await mkdir(spec.output_dir, { recursive: true })

  const variants = [] as AudioVariant[]
  const engine = route_engine(spec)
  for (let idx = 0; idx < spec.variation_count; idx++) {
    const file = variant_file(spec, idx)
    const rendered = engine === "sfx-engine" ? render_sfx(spec, idx) : render_music(spec)
    await Bun.write(file, encode_wav({ sample_rate: rendered.sample_rate, channels: 2, left: rendered.left, right: rendered.right }))
    const metrics = await analyze_audio(file)
    const score = engine === "sfx-engine" ? score_sfx(metrics, spec) : score_music(metrics, spec)
    const sidecar = sidecar_file(file)
    const item = { file, sidecar, metrics, score, spec, engine }
    variants.push(item)
    await write_sidecar(file, {
      generated_at: new Date().toISOString(),
      provider: engine === "music-engine" ? music_provider() : { name: "procedural-local", available: true },
      engine,
      metrics,
      score,
      spec,
    })
  }

  variants.sort((a, b) => b.score.total - a.score.total)
  let best = variants[0]
  if (best?.score.notes.length) {
    const next = refine(best.spec, best.score.notes)
    const file = path.join(spec.output_dir, `${spec.cue_name}_refined.wav`)
    const rendered = engine === "sfx-engine" ? render_sfx(next, 0) : render_music(next)
    await Bun.write(file, encode_wav({ sample_rate: rendered.sample_rate, channels: 2, left: rendered.left, right: rendered.right }))
    const metrics = await analyze_audio(file)
    const score = engine === "sfx-engine" ? score_sfx(metrics, next) : score_music(metrics, next)
    const sidecar = sidecar_file(file)
    const refined = { file, sidecar, metrics, score, spec: next, engine }
    await write_sidecar(file, {
      generated_at: new Date().toISOString(),
      provider: engine === "music-engine" ? music_provider() : { name: "procedural-local", available: true },
      engine,
      metrics,
      score,
      spec: next,
      refined_from: best.file,
    })
    variants.push(refined)
    variants.sort((a, b) => b.score.total - a.score.total)
    best = variants[0]
  }

  const manifest = await write_variant_manifest(path.join(spec.output_dir, `${spec.cue_name}.manifest.json`), variants)
  return { engine, spec, best, variants, manifest }
}
