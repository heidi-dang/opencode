import type { AudioSpec, EngineID } from "./types"

export function route_engine(spec: AudioSpec): EngineID {
  if (spec.mode === "sfx") return "sfx-engine"
  return "music-engine"
}
