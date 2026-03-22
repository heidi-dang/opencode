import type { FileDiff } from "@opencode-ai/sdk/v2"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { For, Match, Show, Switch, type JSX } from "solid-js"

export interface MobileReviewProps {
  title?: JSX.Element
  diffs: () => FileDiff[]
  loading: boolean
  empty: JSX.Element
  labels: {
    open: string
    added: string
    removed: string
    modified: string
    loading: string
  }
  onViewFile: (file: string) => void
}

export const mobileReviewMode = (loading: boolean, diffs: FileDiff[]) => {
  if (loading) return "loading"
  if (diffs.length === 0) return "empty"
  return "ready"
}

export const mobileReviewStatus = (diff: FileDiff, labels: MobileReviewProps["labels"]) => {
  if (diff.status === "added") return labels.added
  if (diff.status === "deleted") return labels.removed
  return labels.modified
}

export const mobileReviewOpen = (onViewFile: (file: string) => void, file: string) => () => onViewFile(file)

const trim = (dir: string) => (dir === "/" ? dir : dir.replace(/\/$/, ""))

export const mobileReviewItems = (diffs: FileDiff[], labels: MobileReviewProps["labels"]) =>
  diffs.map((diff) => ({
    file: diff.file,
    name: getFilename(diff.file),
    dir: diff.file.includes("/") ? trim(getDirectory(diff.file)) : undefined,
    status: mobileReviewStatus(diff, labels),
    additions: diff.additions,
    deletions: diff.deletions,
  }))

export function MobileReview(props: MobileReviewProps) {
  const items = () => mobileReviewItems(props.diffs(), props.labels)
  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-background-stronger">
      <Show when={props.title}>
        <div class="px-4 pt-3">{props.title}</div>
      </Show>
      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-8" data-scrollable>
        <Switch>
          <Match when={mobileReviewMode(props.loading, props.diffs()) === "loading"}>
            <div class="py-4 text-text-weak">{props.labels.loading}</div>
          </Match>
          <Match when={mobileReviewMode(props.loading, props.diffs()) === "empty"}>{props.empty}</Match>
          <Match when={true}>
            <div class="flex flex-col gap-3 py-3">
              <For each={items()}>
                {(item) => (
                  <div class="rounded-lg border border-border-subtle bg-background-panel p-3" data-file={item.file}>
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex-1">
                        <Show when={item.dir}>
                          <div class="truncate text-12-regular text-text-weak">{item.dir}</div>
                        </Show>
                        <div class="truncate text-14-medium text-text-strong">{item.name}</div>
                      </div>
                      <button
                        type="button"
                        class="shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-12-medium text-text-strong"
                        data-file={item.file}
                        onClick={mobileReviewOpen(props.onViewFile, item.file)}
                      >
                        {props.labels.open}
                      </button>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-2 text-12-regular text-text-weak">
                      <span class="rounded-full bg-background px-2 py-1 text-text-strong">{item.status}</span>
                      <span class="font-medium text-green">+{item.additions}</span>
                      <span class="font-medium text-red">-{item.deletions}</span>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  )
}
