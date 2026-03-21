import type { AudioLayer, AudioMode } from "../../types"

export function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "audio"
}

function has(text: string, list: string[]) {
  return list.some((item) => text.includes(item))
}

export function select_layers(cue: string, prompt: string, mode: AudioMode): AudioLayer[] {
  if (mode !== "sfx") return ["drone_bed", "scan_blips", "pulse_loop"]

  const text = `${cue} ${prompt}`.toLowerCase()
  // Organic style cues: nature, wood, soft, leaf, wind, water, earth, organic
  if (has(text, ["organic", "nature", "wood", "leaf", "wind", "water", "earth", "natural"])) {
    return ["soft_pulse", "low_bloom", "subtle_body", "glass_chord"]
  }
  if (has(text, ["bravo", "combo.max", "hero", "prestige", "rare"])) {
    return ["micro_impact", "glass_chord", "low_bloom", "shimmer_tail"]
  }
  if (has(text, ["combo_3", "combo.3", "resolve", "success"])) {
    return ["prestige_rise", "subtle_body", "glass_dual"]
  }
  if (has(text, ["bell", "attention", "permission", "question"])) {
    return ["hybrid_bell", "air_shimmer"]
  }
  if (has(text, ["click", "tick", "tool", "ui"])) {
    return ["metal_click"]
  }
  if (has(text, ["glitch", "retry", "loop", "warning"])) {
    return ["triplet_glitch", "chirp_down"]
  }
  if (has(text, ["idle", "pulse", "heartbeat"])) {
    return ["soft_pulse", "low_support"]
  }
  if (has(text, ["wake", "start", "chirp"])) {
    return ["chirp_up", "low_support"]
  }
  return ["glass_dual", "subtle_body"]
}
