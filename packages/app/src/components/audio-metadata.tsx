import { Show } from "solid-js"

export function AudioMetadata({ duration, score, style }: { duration: number; score: number; style: string }) {
  return (
    <div class="flex flex-row gap-3 items-center text-11-regular text-white/50 mt-1">
      <span>⏱ {Math.round(duration)}ms</span>
      <span>⭐ {score}</span>
      <Show when={style}><span>🎨 {style}</span></Show>
    </div>
  )
}
