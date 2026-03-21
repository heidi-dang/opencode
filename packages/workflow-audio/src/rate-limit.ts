import type { CueID } from "./types"

export class RateLimit {
  private seen = new Map<string, number>()

  allow(cue: CueID, key: string | undefined, time: number, cooldown: number) {
    const id = key ?? cue
    const prev = this.seen.get(id)
    if (prev !== undefined && time - prev < cooldown) return false
    this.seen.set(id, time)
    return true
  }
}