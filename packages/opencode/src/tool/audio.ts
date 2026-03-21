import path from "node:path"
import z from "zod"
import {
  analyze_audio,
  edit_audio,
  generate_audio,
  layer_audio,
  normalize_audio,
  package_preview,
} from "@opencode-ai/audio-tools"
import { Tool } from "./tool"
import { Instance } from "../project/instance"

function resolve(file: string) {
  if (path.isAbsolute(file)) return file
  if (file.startsWith("public/")) return path.join(Instance.worktree, "packages/app", file)
  return path.resolve(Instance.worktree, file)
}

const gen_schema = z.object({
  mode: z.enum(["sfx", "music", "ambience", "loop"]),
  prompt: z.string(),
  style: z.enum(["cyber", "premium-ui", "industrial", "cinematic", "rts", "ambient"]),
  duration_ms: z.number().int().positive(),
  format: z.enum(["wav", "ogg", "mp3"]),
  sample_rate: z.number().int().positive().default(48000),
  intensity: z.number().min(0).max(1),
  brightness: z.number().min(0).max(1),
  stereo_width: z.number().min(0).max(1),
  variation_count: z.number().int().min(1).max(4),
  output_dir: z.string(),
})

export const AudioGenerateTool = Tool.define("audio.generate", {
  description: "Generate deterministic workflow SFX or routed music/ambience variants, score them, and keep the best candidate.",
  parameters: gen_schema,
  async execute(params) {
    const result = await generate_audio({ ...params, output_dir: resolve(params.output_dir) }, Instance.worktree)
    return {
      title: `audio.generate ${result.best.spec.cue_name}`,
      metadata: {
        engine: result.engine,
        best: result.best.file,
        score: result.best.score.total,
        manifest: result.manifest,
      },
      output: JSON.stringify(
        {
          engine: result.engine,
          manifest: result.manifest,
          best: {
            file: result.best.file,
            score: result.best.score,
            metrics: result.best.metrics,
          },
          variants: result.variants.map((item: { file: string; score: { total: number } }) => ({
            file: item.file,
            score: item.score.total,
          })),
        },
        null,
        2,
      ),
    }
  },
})

export const AudioEditTool = Tool.define("audio.edit", {
  description: "Refine an existing generated audio file by applying qualitative change requests to its stored AudioSpec.",
  parameters: z.object({
    source_file: z.string(),
    changes: z.array(z.string()).min(1),
  }),
  async execute(params) {
    const result = await edit_audio(resolve(params.source_file), params.changes)
    return {
      title: `audio.edit ${path.basename(result.file)}`,
      metadata: { file: result.file, score: result.score.total },
      output: JSON.stringify(result, null, 2),
    }
  },
})

export const AudioLayerTool = Tool.define("audio.layer", {
  description: "Layer multiple WAV files into a single normalized composite render.",
  parameters: z.object({
    files: z.array(z.string()).min(1),
    gains: z.array(z.number().min(0)).optional(),
    out_file: z.string(),
    peak_dbfs: z.number().default(-1),
  }),
  async execute(params) {
    const file = await layer_audio(params.files.map(resolve), resolve(params.out_file), params.gains, params.peak_dbfs)
    return {
      title: `audio.layer ${path.basename(file)}`,
      metadata: { file },
      output: JSON.stringify({ file }, null, 2),
    }
  },
})

export const AudioNormalizeTool = Tool.define("audio.normalize", {
  description: "Normalize a WAV file to a target peak level.",
  parameters: z.object({
    file: z.string(),
    peak_dbfs: z.number().default(-1),
    out_file: z.string().optional(),
  }),
  async execute(params) {
    const file = await normalize_audio(resolve(params.file), params.peak_dbfs, params.out_file ? resolve(params.out_file) : undefined)
    return {
      title: `audio.normalize ${path.basename(file)}`,
      metadata: { file },
      output: JSON.stringify({ file }, null, 2),
    }
  },
})

export const AudioAnalyzeTool = Tool.define("audio.analyze", {
  description: "Analyze a WAV file for duration, loudness, centroid, tail, transient sharpness, clipping, and loop seam quality.",
  parameters: z.object({
    file: z.string(),
  }),
  async execute(params) {
    const metrics = await analyze_audio(resolve(params.file))
    return {
      title: `audio.analyze ${path.basename(params.file)}`,
      metadata: metrics,
      output: JSON.stringify(metrics, null, 2),
    }
  },
})

export const AudioPackagePreviewTool = Tool.define("audio.package_preview", {
  description: "Build a preview manifest consumable by the internal audio preview page with scores, waveforms, and version history.",
  parameters: z.object({
    files: z.array(z.string()).min(1),
    manifest_path: z.string(),
    preview_route: z.string().default("/internal/audio-preview"),
  }),
  async execute(params) {
    const result = await package_preview(
      params.files.map(resolve),
      resolve(params.manifest_path),
      params.preview_route,
      resolve("public/audio/generated/preview.json"),
    )
    return {
      title: "audio.package_preview",
      metadata: { route: result.route, preview_path: result.preview_path },
      output: JSON.stringify(result, null, 2),
    }
  },
})
