import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo, createResource, For, Show } from "solid-js"
import { assetSrc, generatedPreviewSrc } from "@/lib/audio/audio-settings"
import { playSound } from "@/utils/sound"

type PreviewItem = {
  cue: string
  file: string
  url: string
  purpose: string
  waveform: number[]
  engine: string
  metrics: {
    duration_ms: number
    loudness: number
    peak: number
    tail_ms: number
    transient_sharpness: number
    spectral_centroid: number
    loop_seam_quality: number
  }
  score: {
    total: number
    notes: string[]
  }
  history: Array<{
    version: string
    score: number
    created_at: string
  }>
}

type PreviewModel = {
  generated_at: string
  items: PreviewItem[]
}

const tweaks = [
  "keep",
  "rerender",
  "make brighter",
  "shorter tail",
  "more premium",
  "less harsh",
  "more cyber",
  "make it punchier",
]

function fmt_db(v: number) {
  return `${v.toFixed(1)} dB`
}

function copy(payload: unknown) {
  return navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
}

function one(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value
}

export default function AudioPreviewPage() {
  const params = useParams()
  const [search] = useSearchParams()
  const src = createMemo(() => assetSrc(one(search.manifest) ?? generatedPreviewSrc(), params.dir))
  const [data, actions] = createResource(src, async (item) => {
    const res = await fetch(item)
    if (!res.ok) throw new Error(`Failed to load preview manifest: ${res.status}`)
    return res.json() as Promise<PreviewModel>
  })

  return (
    <div class="min-h-full w-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.08),transparent_32%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_34%),linear-gradient(180deg,var(--background-base),var(--surface-base))] px-4 py-6 sm:px-8 lg:px-12">
      <div class="mx-auto flex max-w-7xl flex-col gap-6">
        <div class="flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-border-weak-base bg-surface-panel/95 px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur">
          <div class="flex flex-col gap-2">
            <span class="text-11-medium uppercase tracking-[0.24em] text-text-weak">Internal Audio Preview</span>
            <h1 class="text-24-medium text-text-strong">Audio iteration surface</h1>
            <p class="max-w-3xl text-13-regular text-text-weak">
              Play generated assets, inspect waveform summaries, review quality scores, and copy structured tweak
              payloads for the audio tools.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button size="small" variant="secondary" onClick={() => actions.refetch()}>
              Refresh
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                copy({ route: window.location.pathname, manifest: src() })
                showToast({ title: "Preview route copied", description: src() })
              }}
            >
              Copy route payload
            </Button>
          </div>
        </div>

        <Show
          when={data()}
          fallback={
            <div class="rounded-2xl border border-border-weak-base bg-surface-panel px-5 py-6 text-13-regular text-text-weak">
              {data.loading
                ? "Loading preview manifest…"
                : "No preview manifest found yet. Run audio.package_preview to populate this page."}
            </div>
          }
        >
          {(model) => (
            <>
              <div class="text-12-regular text-text-weak">
                Generated {new Date(model().generated_at).toLocaleString()}
              </div>
              <div class="grid gap-4 xl:grid-cols-2">
                <For each={model().items}>
                  {(item) => (
                    <section class="flex flex-col gap-4 rounded-3xl border border-border-weak-base bg-surface-panel/95 px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.14)]">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="flex min-w-0 flex-col gap-1">
                          <span class="font-mono text-12-medium uppercase tracking-[0.12em] text-text-link">
                            {item.cue}
                          </span>
                          <h2 class="truncate text-18-medium text-text-strong">{item.file.split("/").at(-1)}</h2>
                          <p class="text-12-regular text-text-weak">{item.purpose}</p>
                        </div>
                        <div class="flex items-center gap-2">
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() =>
                              playSound(assetSrc(item.url.startsWith("/") ? item.url : `/${item.url}`, params.dir), 0.9)
                            }
                          >
                            Play
                          </Button>
                          <div class="rounded-full border border-border-weak-base px-3 py-1 text-11-medium text-text-weak">
                            {item.engine}
                          </div>
                        </div>
                      </div>

                      <div class="flex h-24 items-end gap-[3px] rounded-2xl border border-border-weak-base bg-background-base px-3 py-3">
                        <For each={item.waveform}>
                          {(bar) => (
                            <div
                              class="min-w-0 flex-1 rounded-full bg-[linear-gradient(180deg,var(--text-link),rgba(255,255,255,0.08))]"
                              style={{ height: `${Math.max(8, bar * 180)}px` }}
                            />
                          )}
                        </For>
                      </div>

                      <div class="grid gap-2 sm:grid-cols-3">
                        <div class="rounded-2xl border border-border-weak-base bg-background-base px-3 py-3">
                          <div class="text-11-medium uppercase tracking-[0.16em] text-text-weak">Score</div>
                          <div class="mt-1 text-20-medium text-text-strong">{item.score.total.toFixed(1)}</div>
                        </div>
                        <div class="rounded-2xl border border-border-weak-base bg-background-base px-3 py-3">
                          <div class="text-11-medium uppercase tracking-[0.16em] text-text-weak">Loudness</div>
                          <div class="mt-1 text-16-medium text-text-strong">{fmt_db(item.metrics.loudness)}</div>
                        </div>
                        <div class="rounded-2xl border border-border-weak-base bg-background-base px-3 py-3">
                          <div class="text-11-medium uppercase tracking-[0.16em] text-text-weak">Duration</div>
                          <div class="mt-1 text-16-medium text-text-strong">{item.metrics.duration_ms} ms</div>
                        </div>
                      </div>

                      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-12-regular text-text-weak">
                        <div class="rounded-xl bg-background-base px-3 py-2">Peak {item.metrics.peak.toFixed(3)}</div>
                        <div class="rounded-xl bg-background-base px-3 py-2">Tail {item.metrics.tail_ms} ms</div>
                        <div class="rounded-xl bg-background-base px-3 py-2">
                          Transient {item.metrics.transient_sharpness.toFixed(3)}
                        </div>
                        <div class="rounded-xl bg-background-base px-3 py-2">
                          Centroid {item.metrics.spectral_centroid.toFixed(0)} Hz
                        </div>
                      </div>

                      <Show when={item.score.notes.length > 0}>
                        <div class="rounded-2xl border border-border-weak-base bg-background-base px-4 py-3 text-12-regular text-text-weak">
                          <div class="mb-2 text-11-medium uppercase tracking-[0.16em] text-text-weak">
                            Quality notes
                          </div>
                          <div class="flex flex-wrap gap-2">
                            <For each={item.score.notes}>
                              {(note) => <span class="rounded-full bg-surface-panel px-2 py-1">{note}</span>}
                            </For>
                          </div>
                        </div>
                      </Show>

                      <div class="flex flex-col gap-2">
                        <div class="text-11-medium uppercase tracking-[0.16em] text-text-weak">Designer actions</div>
                        <div class="flex flex-wrap gap-2">
                          <For each={tweaks}>
                            {(action) => (
                              <Button
                                size="small"
                                variant="secondary"
                                onClick={() => {
                                  const payload =
                                    action === "rerender"
                                      ? {
                                          name: "audio.generate",
                                          input: {
                                            mode: item.engine === "sfx-engine" ? "sfx" : "music",
                                            prompt: item.purpose,
                                            style: item.engine === "sfx-engine" ? "cyber" : "ambient",
                                            duration_ms: item.metrics.duration_ms,
                                            format: "wav",
                                            sample_rate: 48000,
                                            intensity: 0.72,
                                            brightness: 0.68,
                                            stereo_width: 0.18,
                                            variation_count: 3,
                                            output_dir: "public/audio/generated",
                                          },
                                        }
                                      : {
                                          name: "audio.edit",
                                          input: {
                                            source_file: item.file,
                                            changes: [action],
                                          },
                                        }
                                  copy(payload)
                                  showToast({ title: "Tool payload copied", description: action })
                                }}
                              >
                                {action}
                              </Button>
                            )}
                          </For>
                        </div>
                      </div>

                      <div class="rounded-2xl border border-border-weak-base bg-background-base px-4 py-3">
                        <div class="mb-2 text-11-medium uppercase tracking-[0.16em] text-text-weak">
                          Version history
                        </div>
                        <div class="flex flex-col gap-2 text-12-regular text-text-weak">
                          <For each={item.history}>
                            {(entry) => (
                              <div class="flex items-center justify-between gap-4 rounded-xl bg-surface-panel px-3 py-2">
                                <span class="truncate">{entry.version}</span>
                                <span class="shrink-0">{entry.score.toFixed(1)}</span>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </section>
                  )}
                </For>
              </div>
            </>
          )}
        </Show>
      </div>
    </div>
  )
}
