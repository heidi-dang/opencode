import { createEffect, onCleanup } from "solid-js"
import { cue_ids, WorkflowAudioEvent } from "@opencode-ai/workflow-audio"
import type { CueID } from "@opencode-ai/workflow-audio/types"
import { useGlobalSDK } from "@/context/global-sdk"
import { useSettings } from "@/context/settings"
import { AudioDebug } from "./audio-debug"
import { createAudioPlayer } from "./audio-player"
import { createAudioQueue } from "./audio-queue"
import { cueSrc } from "./audio-settings"
import { createAudioStore } from "./audio-store"

export function parseWorkflowAudioEvent(event: { details?: { type?: string; properties?: unknown } }) {
  if (event.details?.type !== "workflow.audio") return
  const result = WorkflowAudioEvent.safeParse(event.details.properties)
  if (!result.success) return
  return result.data
}

export function WorkflowAudioService() {
  const globalSDK = useGlobalSDK()
  const settings = useSettings()
  const store = createAudioStore()
  const player = createAudioPlayer((entry) => store.push({ ...entry, time: Date.now() }))
  const queue = createAudioQueue({
    play: (info) => {
      player.play(info, cueSrc(settings.workflowAudio.pack(), info.cue), settings.workflowAudio.volume())
    },
    onEvent: (entry) => store.push({ ...entry, time: Date.now() }),
  })

  createEffect(() => {
    const pack = settings.workflowAudio.pack()
    player.preload(cue_ids.map((cue) => cueSrc(pack, cue as CueID)))
  })

  const unsub = globalSDK.event.listen((event) => {
    const info = parseWorkflowAudioEvent(event)
    if (!info) return
    if (!settings.workflowAudio.enabled()) {
      store.push({ cue: info.cue, status: "disabled", time: Date.now() })
      return
    }
    queue.push(info)
  })

  onCleanup(unsub)

  return <AudioDebug enabled={() => settings.workflowAudio.debug()} list={store.list} />
}
