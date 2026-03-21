import type { Accessor } from "solid-js"
import { For, Show } from "solid-js"
import type { AudioEntry } from "./audio-store"

export function AudioDebug(props: { enabled: Accessor<boolean>; list: Accessor<AudioEntry[]> }) {
  return (
    <Show when={props.enabled() && props.list().length > 0}>
      <div class="pointer-events-none fixed bottom-3 right-3 z-[80] w-80 rounded-xl border border-border-weak-base bg-surface-panel/90 p-3 shadow-xl backdrop-blur">
        <div class="mb-2 text-11-medium uppercase tracking-[0.14em] text-text-weak">Workflow audio</div>
        <div class="flex flex-col gap-1">
          <For each={props.list()}>
            {(item) => (
              <div class="flex items-center justify-between gap-3 rounded-md bg-surface-base/70 px-2 py-1 text-11-regular text-text-base">
                <span class="truncate">{item.cue}</span>
                <span class="shrink-0 text-text-weak">{item.status}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}