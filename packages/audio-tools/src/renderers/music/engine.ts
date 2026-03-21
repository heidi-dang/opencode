import type { AudioSpec } from "../../types"
import type { Stereo } from "../sfx/motifs"
import { drone_bed, pulse_loop, scan_blips } from "../sfx/motifs"
import { loop_frames } from "./loop_builder"

function blank(frames: number, sample_rate: number): Stereo {
  return { left: new Float32Array(frames), right: new Float32Array(frames), sample_rate }
}

function mix(dst: Stereo, src: Stereo, gain: number) {
  for (let i = 0; i < dst.left.length; i++) {
    dst.left[i] += src.left[i] * gain
    dst.right[i] += src.right[i] * gain
  }
}

export function render_music(spec: AudioSpec): Stereo {
  const frames = spec.mode === "loop" ? loop_frames(spec.sample_rate, spec.bpm ?? 96, spec.bars ?? 8) : Math.round((spec.duration_ms / 1000) * spec.sample_rate)
  const ctx = {
    frames,
    sample_rate: spec.sample_rate,
    intensity: spec.intensity,
    brightness: spec.brightness,
    width: Math.max(0.15, spec.stereo_width),
    seed: spec.seed,
  }
  const out = blank(frames, spec.sample_rate)
  mix(out, drone_bed(ctx), 1)
  mix(out, pulse_loop(ctx), 0.7)
  mix(out, scan_blips(ctx), 0.45)
  return out
}
