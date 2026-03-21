import { Component, For, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { Select } from "@opencode-ai/ui/select"
import { Switch } from "@opencode-ai/ui/switch"
import { useSettings } from "@/context/settings"
import { PACK_OPTIONS, previewList, previewSrc } from "@/lib/audio/audio-settings"
import { playSound } from "@/utils/sound"

let demo = {
  cleanup: undefined as (() => void) | undefined,
  timeout: undefined as NodeJS.Timeout | undefined,
}

function stop() {
  demo.cleanup?.()
  clearTimeout(demo.timeout)
  demo.cleanup = undefined
}

function play(src: string | undefined, volume = 1) {
  stop()
  if (!src) return
  demo.timeout = setTimeout(() => {
    demo.cleanup = playSound(src, volume)
  }, 100)
}

export const SettingsAudio: Component = () => {
  const settings = useSettings()
  const params = useParams()
  const list = () => previewList(settings.workflowAudio.pack(), params.dir)

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-2 pt-6 pb-8">
          <h2 class="text-16-medium text-text-strong">Audio Lab</h2>
          <p class="text-12-regular text-text-weak">
            Tune the workflow pack, inspect live volume intent, and audition every cue in-browser.
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-8 w-full">
        <div class="flex flex-col gap-3 rounded-2xl border border-border-weak-base bg-surface-panel px-4 py-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-14-medium text-text-strong">Tool-generated preview</span>
              <span class="text-12-regular text-text-weak">
                Open the internal iteration surface for waveform, scores, and version history.
              </span>
            </div>
            <a href={`/${params.dir}/internal/audio-preview`} class="inline-flex">
              <Button size="small" variant="secondary">
                Open preview page
              </Button>
            </a>
          </div>

          <div class="flex flex-wrap items-center gap-4 justify-between">
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="text-14-medium text-text-strong">Workflow audio</span>
              <span class="text-12-regular text-text-weak">Master switch for runtime and app workflow cues.</span>
            </div>
            <Switch
              checked={settings.workflowAudio.enabled()}
              onChange={(checked) => settings.workflowAudio.setEnabled(checked)}
            />
          </div>

          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div class="flex min-w-0 flex-col gap-2">
              <span class="text-13-medium text-text-strong">Pack</span>
              <span class="text-12-regular text-text-weak">
                Choose the cue family used across turn, tool, planner, and attention events.
              </span>
            </div>
            <Select
              data-action="settings-workflow-audio-pack"
              options={PACK_OPTIONS}
              current={PACK_OPTIONS.find((option) => option.value === settings.workflowAudio.pack())}
              value={(option) => option.value}
              label={(option) => option.label}
              onHighlight={(option) => {
                if (!option) return
                play(previewSrc(option.value, params.dir), settings.workflowAudio.volume() / 100)
              }}
              onSelect={(option) => {
                if (!option) return
                settings.workflowAudio.setPack(option.value)
                play(previewSrc(option.value, params.dir), settings.workflowAudio.volume() / 100)
              }}
              variant="secondary"
              size="small"
              triggerVariant="settings"
            />
          </div>

          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div class="flex min-w-0 flex-col gap-2">
              <span class="text-13-medium text-text-strong">Volume</span>
              <span class="text-12-regular text-text-weak">
                Browser preview uses the same workflow-audio level as runtime playback intent.
              </span>
            </div>
            <div class="flex items-center gap-3 w-[220px]">
              <input
                class="w-full accent-text-link"
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.workflowAudio.volume()}
                onInput={(event) => settings.workflowAudio.setVolume(Number(event.currentTarget.value))}
              />
              <span class="w-10 text-right text-12-regular text-text-weak">{settings.workflowAudio.volume()}%</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-4 justify-between">
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="text-13-medium text-text-strong">Debug overlay</span>
              <span class="text-12-regular text-text-weak">
                Show the recent workflow-audio queue and playback decisions on screen.
              </span>
            </div>
            <Switch
              checked={settings.workflowAudio.debug()}
              onChange={(checked) => settings.workflowAudio.setDebug(checked)}
            />
          </div>
        </div>

        <div class="flex flex-col gap-3 rounded-2xl border border-border-weak-base bg-surface-panel px-4 py-4">
          <div class="flex flex-col gap-1">
            <span class="text-14-medium text-text-strong">Preview cues</span>
            <span class="text-12-regular text-text-weak">
              Full Minimal Pro audition surface for pack QA. Each button plays at the current workflow-audio volume.
            </span>
          </div>

          <Show
            when={list().length > 0}
            fallback={
              <div class="text-12-regular text-text-weak">Preview metadata is currently available for Minimal Pro.</div>
            }
          >
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <For each={list()}>
                {(item) => (
                  <Button
                    size="small"
                    variant="secondary"
                    class="flex h-auto min-h-18 flex-col items-start gap-1 px-3 py-2 text-left"
                    onClick={() => play(item.src, settings.workflowAudio.volume() / 100)}
                  >
                    <span class="font-mono text-11-medium text-text-strong">{item.event}</span>
                    <span class="text-11-regular text-text-weak">{item.file}</span>
                    <span class="text-11-regular text-text-muted">{item.purpose}</span>
                  </Button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
