import type { AudioMetrics, AudioSpec, ScoreCard } from "../types"

function clamp(v: number) {
  return Math.max(0, Math.min(100, v))
}

export function score_sfx(metrics: AudioMetrics, spec: AudioSpec): ScoreCard {
  const duration = clamp(100 - Math.abs(metrics.duration_ms - spec.duration_ms) / Math.max(1, spec.duration_ms) * 100)
  const tail = clamp(100 - Math.abs(metrics.tail_ms - spec.targets.tail_ms) / Math.max(1, spec.targets.tail_ms) * 100)
  const clarity = clamp(100 - metrics.muddiness * 60 - metrics.harshness * 35)
  const transient = clamp(metrics.transient_sharpness * 220)
  const non_annoyance = clamp(100 - metrics.harshness * 75)
  const brightness = clamp(100 - Math.abs(metrics.spectral_centroid / 6000 - spec.targets.brightness) * 100)
  const distinct = clamp(40 + transient * 0.35 + brightness * 0.25)
  const prestige = spec.emotion.includes("prestige") ? clamp(50 + transient * 0.13 + tail * 0.18 + brightness * 0.18) : 0
  // Organic bonus: if style_family is organic and both muddiness/harshness are low
  let organic_bonus = 0
  if ((spec.style_family === "organic" || spec.prompt.toLowerCase().includes("organic")) && metrics.muddiness < 0.22 && metrics.harshness < 0.18) {
    organic_bonus = 8
  }
  const total = Number((duration * 0.15 + tail * 0.09 + clarity * 0.26 + transient * 0.09 + non_annoyance * 0.22 + brightness * 0.09 + distinct * 0.06 + prestige * 0.04 + organic_bonus).toFixed(2))
  const notes = [] as string[]
  if (metrics.harshness > 0.62) notes.push("reduce harsh highs")
  if (metrics.muddiness > 0.48) notes.push("reduce low-mid build-up")
  if (metrics.tail_ms > spec.targets.tail_ms + 80) notes.push("shorten tail")
  if (metrics.transient_sharpness < 0.12) notes.push("cleaner attack needed")
  if (organic_bonus > 0) notes.push("organic clarity bonus applied")
  return {
    total,
    breakdown: { duration, tail, clarity, transient, non_annoyance, brightness, distinctiveness: distinct, prestige, organic_bonus },
    notes,
  }
}
