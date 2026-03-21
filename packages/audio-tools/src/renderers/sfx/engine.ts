import type { AudioSpec, AudioLayer } from "../../types"
import type { RenderCtx, Stereo } from "./motifs"
import * as motifs from "./motifs"

const bank: Record<AudioLayer, (ctx: RenderCtx) => Stereo> = {
  chirp_up: motifs.chirp_up,
  chirp_down: motifs.chirp_down,
  glass_dual: motifs.glass_dual,
  metal_click: motifs.metal_click,
  triplet_glitch: motifs.triplet_glitch,
  soft_pulse: motifs.soft_pulse,
  hybrid_bell: motifs.hybrid_bell,
  prestige_rise: motifs.prestige_rise,
  micro_impact: motifs.micro_impact,
  glass_chord: motifs.glass_chord,
  low_bloom: motifs.low_bloom,
  shimmer_tail: motifs.shimmer_tail,
  low_support: motifs.low_support,
  air_shimmer: motifs.air_shimmer,
  subtle_body: motifs.subtle_body,
  drone_bed: motifs.drone_bed,
  scan_blips: motifs.scan_blips,
  pulse_loop: motifs.pulse_loop,
}

function blank(frames: number, sample_rate: number): Stereo {
  return { left: new Float32Array(frames), right: new Float32Array(frames), sample_rate }
}

function mix(dst: Stereo, src: Stereo, gain: number) {
  for (let i = 0; i < dst.left.length; i++) {
    dst.left[i] += src.left[i] * gain
    dst.right[i] += src.right[i] * gain
  }
}

function normalize(dst: Stereo, peak = 0.89) {
  let max = 0
  for (let i = 0; i < dst.left.length; i++) {
    max = Math.max(max, Math.abs(dst.left[i]), Math.abs(dst.right[i]))
  }
  if (!max) return dst
  const gain = peak / max
  for (let i = 0; i < dst.left.length; i++) {
    dst.left[i] *= gain
    dst.right[i] *= gain
  }
  return dst
}

export function render_sfx(spec: AudioSpec, variant = 0): Stereo {
  const frames = Math.round((spec.duration_ms / 1000) * spec.sample_rate)
  const ctx: RenderCtx = {
    frames,
    sample_rate: spec.sample_rate,
    intensity: Math.max(0, Math.min(1, spec.intensity + variant * 0.025 - 0.025)),
    brightness: Math.max(0, Math.min(1, spec.brightness + variant * 0.02 - 0.02)),
    width: Math.max(0, Math.min(1, spec.stereo_width + variant * 0.015 - 0.015)),
    seed: spec.seed + variant * 97,
  }
  const out = blank(frames, spec.sample_rate)
  const len = spec.layers.length || 1

  spec.layers.forEach((layer, idx) => {
    const fn = bank[layer]
    const gain = len === 1 ? 1 : 0.95 - idx * 0.08
    mix(out, fn(ctx), gain)
  })

  return normalize(out, 0.89)
}
