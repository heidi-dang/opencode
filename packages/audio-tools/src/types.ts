export const mode_ids = ["sfx", "music", "ambience", "loop"] as const
export const style_ids = ["cyber", "premium-ui", "industrial", "cinematic", "rts", "ambient", "organic"] as const
export const engine_ids = ["sfx-engine", "music-engine"] as const

export type AudioMode = (typeof mode_ids)[number]
export type AudioStyle = (typeof style_ids)[number]
export type EngineID = (typeof engine_ids)[number]

export type Waveform = number[]

export type AudioMetrics = {
  duration_ms: number
  sample_rate: number
  channels: number
  peak: number
  rms: number
  loudness: number
  spectral_centroid: number
  tail_ms: number
  transient_sharpness: number
  clipping_detected: boolean
  loop_seam_quality: number
  harshness: number
  muddiness: number
  waveform: Waveform
}

export type ScoreCard = {
  total: number
  breakdown: Record<string, number>
  notes: string[]
}

export type AudioLayer =
  | "chirp_up"
  | "chirp_down"
  | "glass_dual"
  | "metal_click"
  | "triplet_glitch"
  | "soft_pulse"
  | "hybrid_bell"
  | "prestige_rise"
  | "micro_impact"
  | "glass_chord"
  | "low_bloom"
  | "shimmer_tail"
  | "low_support"
  | "air_shimmer"
  | "subtle_body"
  | "drone_bed"
  | "scan_blips"
  | "pulse_loop"

export type AudioVariant = {
  file: string
  sidecar: string
  metrics: AudioMetrics
  score: ScoreCard
  spec: AudioSpec
  engine: EngineID
}

export type AudioPreviewItem = {
  cue: string
  file: string
  url: string
  purpose: string
  metrics: AudioMetrics
  score: ScoreCard
  engine: EngineID
  waveform: Waveform
  history: Array<{
    version: string
    file: string
    score: number
    created_at: string
  }>
}

export type PreviewPackage = {
  route: string
  preview_path: string
  generated_at: string
  items: AudioPreviewItem[]
}

export type AudioTargets = {
  peak_dbfs: number
  tail_ms: number
  brightness: number
  fullness: number
}

export type AudioSpec = {
  mode: AudioMode
  cue_name: string
  style_family: string
  prompt: string
  duration_ms: number
  intensity: number
  brightness: number
  stereo_width: number
  variation_count: number
  sample_rate: number
  format: "wav" | "ogg" | "mp3"
  output_dir: string
  seed: number
  layers: AudioLayer[]
  emotion: string[]
  avoid: string[]
  targets: AudioTargets
  bpm?: number
  key?: string
  bars?: number
  seamless?: boolean
}
