import { createSignal, createEffect } from "solid-js"

export function PlaybackControls(props: {
  playing: boolean
  onToggle: () => void
  onSkipBack: () => void
  onSkipForward: () => void
}) {
  return (
    <div class="flex items-center gap-4 bg-surface-base rounded-lg p-4">
      <button
        class="p-2 rounded-full hover:bg-surface-raised-base-hover transition-colors"
        onClick={props.onSkipBack}
        title="Skip back"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.066 3L3 12l9.066 9V3z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 3l-9.066 9L21 21V3z"/>
        </svg>
      </button>

      <button
        class="p-3 rounded-full bg-accent text-white hover:bg-accent/90 transition-colors"
        onClick={props.onToggle}
        title={props.playing ? "Pause" : "Play"}
      >
        {props.playing ? (
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 4h4v16h-4zM16 4h4v16h-4z"/>
          </svg>
        ) : (
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z"/>
          </svg>
        )}
      </button>

      <button
        class="p-2 rounded-full hover:bg-surface-raised-base-hover transition-colors"
        onClick={props.onSkipForward}
        title="Skip forward"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.933 3L21 12l-9.066 9V3z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l9.066 9L3 21V3z"/>
        </svg>
      </button>
    </div>
  )
}
