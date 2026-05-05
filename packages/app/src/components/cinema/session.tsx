import { createSignal, createEffect, onCleanup } from "solid-js"
import { Timeline, TimelineEvent } from "./timeline"
import { PlaybackControls } from "./playback"

export interface SessionData {
  id: string
  events: TimelineEvent[]
}

export function CinemaSession(props: {
  session: SessionData
  onClose: () => void
}) {
  const [playing, setPlaying] = createSignal(false)
  const [current, setCurrent] = createSignal(0)

  let interval: ReturnType<typeof setInterval> | undefined

  createEffect(() => {
    if (playing()) {
      interval = setInterval(() => {
        setCurrent((i) => {
          const next = i + 1
          if (next >= props.session.events.length) {
            setPlaying(false)
            return i
          }
          return next
        })
      }, 1000)
    } else if (interval) {
      clearInterval(interval)
      interval = undefined
    }
  })

  onCleanup(() => {
    if (interval) clearInterval(interval)
  })

  return (
    <div class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
      <div class="bg-surface-base rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div class="p-4 border-b border-border-base flex items-center justify-between">
          <h2 class="text-xl font-bold text-text-strong">
            Cinema: {props.session.id}
          </h2>
          <button
            class="p-2 rounded-md hover:bg-surface-raised transition-colors"
            onClick={props.onClose}
          >
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-auto p-4">
          <div class="bg-surface-raised-base rounded-lg p-4 mb-4">
            <h3 class="font-medium text-text-strong mb-2">Current Step</h3>
            <div class="text-sm text-text-base">
              {props.session.events[current()]?.label ?? "No selection"}
            </div>
            <div class="text-xs text-text-weak mt-1">
              {current() < props.session.events.length
                ? new Date(props.session.events[current()].time).toLocaleString()
                : ""}
            </div>
          </div>

          <Timeline
            events={props.session.events}
            current={current}
            onSeek={setCurrent}
          />
        </div>

        <div class="p-4 border-t border-border-base">
          <PlaybackControls
            playing={playing()}
            onToggle={() => setPlaying(!playing())}
            onSkipBack={() => setCurrent((i) => Math.max(0, i - 1))}
            onSkipForward={() =>
              setCurrent((i) => Math.min(props.session.events.length - 1, i + 1))
            }
          />
        </div>
      </div>
    </div>
  )
}
