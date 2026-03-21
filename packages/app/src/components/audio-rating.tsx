import { createSignal } from "solid-js"

export function AudioRating({ onRate }: { onRate: (score: number) => void }) {
  const [rating, setRating] = createSignal(0)
  return (
    <div class="flex flex-row gap-1 mt-1" aria-label="Rate this audio">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          class={`text-14 ${rating() >= n ? 'text-yellow-400' : 'text-white/30'}`}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          tabIndex={0}
          onClick={() => { setRating(n); onRate(n) }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setRating(n); onRate(n) } }}
        >
          ★
        </button>
      ))}
    </div>
  )
}
