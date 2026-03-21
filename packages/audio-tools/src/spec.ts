import path from "node:path"
import z from "zod"
import type { AudioLayer, AudioSpec } from "./types"
import { mode_ids, style_ids } from "./types"
import { select_layers, slug } from "./renderers/sfx/presets"

export const GenerateInput = z.object({
  mode: z.enum(mode_ids),
  prompt: z.string(),
  style: z.enum(style_ids),
  duration_ms: z.number().int().positive(),
  format: z.enum(["wav", "ogg", "mp3"]).default("wav"),
  sample_rate: z.number().int().positive().default(48000),
  intensity: z.number().min(0).max(1).default(0.72),
  brightness: z.number().min(0).max(1).default(0.68),
  stereo_width: z.number().min(0).max(1).default(0.18),
  variation_count: z.number().int().min(1).max(4).default(3),
  output_dir: z.string(),
  cue_name: z.string().optional(),
  style_family: z.string().optional(),
  emotion: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
  bpm: z.number().int().positive().optional(),
  key: z.string().optional(),
  bars: z.number().int().positive().optional(),
  seamless: z.boolean().optional(),
})

export const EditInput = z.object({
  source_file: z.string(),
  changes: z.array(z.string()).min(1),
})

export const AnalyzeInput = z.object({
  file: z.string(),
})

export const NormalizeInput = z.object({
  file: z.string(),
  peak_dbfs: z.number().default(-1),
  out_file: z.string().optional(),
})

export const LayerInput = z.object({
  files: z.array(z.string()).min(1),
  gains: z.array(z.number().min(0)).optional(),
  out_file: z.string(),
  peak_dbfs: z.number().default(-1),
})

export const PackagePreviewInput = z.object({
  files: z.array(z.string()).min(1),
  manifest_path: z.string(),
  preview_route: z.string().default("/internal/audio-preview"),
  preview_path: z.string().optional(),
})

function tone(prompt: string) {
  const lower = prompt.toLowerCase()
  const emotion = [] as string[]
  if (lower.includes("hero") || lower.includes("prestige") || lower.includes("max")) emotion.push("prestige")
  if (lower.includes("success") || lower.includes("win") || lower.includes("resolve")) emotion.push("confidence")
  if (lower.includes("ai") || lower.includes("autonomous") || lower.includes("cyber")) emotion.push("autonomous")
  return emotion.length ? emotion : ["focused"]
}

function defaults(duration_ms: number, brightness: number) {
  return {
    peak_dbfs: -1,
    tail_ms: Math.max(90, Math.round(duration_ms * 0.24)),
    brightness,
    fullness: 0.66,
  }
}

export function spec_from_input(input: z.input<typeof GenerateInput>, root: string, seed = 1): AudioSpec {
  const data = GenerateInput.parse(input)
  const cue_name = data.cue_name ?? slug(data.prompt)
  const layers = select_layers(cue_name, data.prompt, data.mode) as AudioLayer[]

  return {
    mode: data.mode,
    cue_name,
    style_family: data.style_family ?? (data.style === "cyber" ? "cyber-ops" : data.style),
    prompt: data.prompt,
    duration_ms: data.duration_ms,
    intensity: data.intensity,
    brightness: data.brightness,
    stereo_width: data.stereo_width,
    variation_count: data.variation_count,
    sample_rate: data.sample_rate,
    format: data.format,
    output_dir: path.resolve(root, data.output_dir),
    seed,
    layers,
    emotion: data.emotion ?? tone(data.prompt),
    avoid: data.avoid ?? ["stock notification", "cheap ding", "arcade", "cartoon"],
    targets: defaults(data.duration_ms, data.brightness),
    bpm: data.bpm,
    key: data.key,
    bars: data.bars,
    seamless: data.seamless,
  }
}
