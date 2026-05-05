import { createSignal, For } from "solid-js"
import { Accessor } from "solid-js"

export interface TimelineEvent {
  id: string
  time: number
  type: "step" | "tool" | "message"
  label: string
}

export function Timeline(props: {
  events: TimelineEvent[]
  current: Accessor<number>
  onSeek: (idx: number) => void
}) {
  return (
    <div class="w-full bg-surface-base rounded-lg p-4 overflow-x-auto">
      <div class="flex gap-2 min-w-max">
        <For each={props.events}>
          {(evt, idx) => (
            <button
              class={`px-3 py-2 rounded-md text-sm border transition-colors ${
                props.current() === idx()
                  ? "bg-accent text-white border-accent"
                  : "bg-surface-raised-base border-border-base hover:bg-surface-raised-base-hover"
              }`}
              onClick={() => props.onSeek(idx())}
            >
              <div class="font-medium">{evt.label}</div>
              <div class="text-xs opacity-60">
                {new Date(evt.time).toLocaleTimeString()}
              </div>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
