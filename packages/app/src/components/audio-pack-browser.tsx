import { createSignal, For, Show } from "solid-js"
import { AudioRating } from "./audio-rating"

export function AudioPackBrowser({ items }: { items: any[] }) {
  const [selected, setSelected] = createSignal(0)
  return (
    <div class="rounded-xl border border-white/8 bg-white/[0.03] p-3 flex flex-col gap-2">
      <div class="text-12-medium text-white/60 mb-2">Audio Pack Browser</div>
      <div class="flex flex-row gap-2 overflow-x-auto">
        <For each={items}>
          {(item, i) => (
            <button
              class={`rounded border px-2 py-1 text-11-regular ${selected() === i() ? 'bg-sky-400/20 border-sky-400 text-sky-300' : 'bg-white/5 border-white/10 text-white/60'}`}
              onClick={() => setSelected(i())}
            >
              {item.cue || item.file || `Audio ${i() + 1}`}
            </button>
          )}
        </For>
      </div>
      <Show when={items[selected()]}> 
        <audio
          controls
          src={items[selected()].url}
          style={{ width: '100%', outline: 'none' }}
          tabIndex={0}
          aria-label="Audio preview"
          onMouseEnter={e => { try { e.currentTarget.currentTime = 0; e.currentTarget.play() } catch {} }}
          onFocus={e => { try { e.currentTarget.currentTime = 0; e.currentTarget.play() } catch {} }}
          onMouseLeave={e => { try { e.currentTarget.pause() } catch {} }}
          onBlur={e => { try { e.currentTarget.pause() } catch {} }}
          onKeyDown={e => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              try { e.currentTarget.currentTime = 0; e.currentTarget.play() } catch {}
            }
          }}
        />
        <div class="flex flex-row gap-2 mt-1" role="group" aria-label="Audio quick actions">
          {/* Flexible download: show all formats if available */}
          {(() => {
            const meta = items[selected()]
            const formats = ["wav", "mp3", "ogg"]
            return formats.map(fmt => {
              const url = meta?.file?.replace(/\.(wav|mp3|ogg)$/i, "." + fmt)
              return url && (
                <a
                  href={url.replace(/^.*\/public/, "")}
                  download={fmt}
                  class="text-sky-400 underline text-12-regular"
                  aria-label={`Download as ${fmt}`}
                >
                  {fmt.toUpperCase()}
                </a>
              )
            })
          })()}
        </div>
        <AudioRating onRate={score => console.log('Rated', items[selected()].url, score)} />
      </Show>
    </div>
  )
}
