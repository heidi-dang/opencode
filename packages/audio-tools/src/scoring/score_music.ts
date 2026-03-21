import type { AudioMetrics, AudioSpec, ScoreCard } from "../types"

function clamp(v: number) {
  return Math.max(0, Math.min(100, v))
}

export function score_music(metrics: AudioMetrics, spec: AudioSpec): ScoreCard {
  const duration = clamp(100 - Math.abs(metrics.duration_ms - spec.duration_ms) / Math.max(1, spec.duration_ms) * 100)
  const seam = clamp(metrics.loop_seam_quality * 100)
  const texture = clamp(100 - metrics.muddiness * 55 - metrics.harshness * 35)
  const width = clamp(55 + spec.stereo_width * 40)
  const total = Number((duration * 0.25 + seam * 0.25 + texture * 0.35 + width * 0.15).toFixed(2))
  const notes = [] as string[]
  if (seam < 80) notes.push("improve loop seam")
  if (texture < 70) notes.push("clean texture balance")
  return {
    total,
    breakdown: { duration, seam, texture, width },
    notes,
  }
}
