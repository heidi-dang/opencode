import { cue_meta, pick_audio, RateLimit, type WorkflowAudioEvent } from "@opencode-ai/workflow-audio"

type Opts = {
  play: (info: WorkflowAudioEvent) => void
  onEvent: (entry: { cue: string; status: "queued" | "dropped" }) => void
  enabled: () => boolean
}

export function createAudioQueue(opts: Opts) {
  const gate = new RateLimit()
  let list: WorkflowAudioEvent[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    timer = undefined
    const next = pick_audio(list)
    list = []
    if (!next) return
    const meta = cue_meta[next.cue]
    if (!gate.allow(next.cue, next.dedupe, next.time, meta.cooldown)) {
      if (opts.enabled()) opts.onEvent({ cue: next.cue, status: "dropped" })
      return
    }
    opts.play(next)
  }

  return {
    push(info: WorkflowAudioEvent) {
      if (!opts.enabled()) return
      list.push(info)
      opts.onEvent({ cue: info.cue, status: "queued" })
      if (timer) return
      timer = setTimeout(flush, 60)
    },
  }
}
