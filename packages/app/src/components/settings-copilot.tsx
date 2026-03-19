import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMemo, Show, type Component } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { useLanguage } from "@/context/language"
import { useCopilotSummary } from "@/hooks/use-copilot-summary"
import { useProviders } from "@/hooks/use-providers"

export const SettingsCopilot: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const navigate = useNavigate()
  const params = useParams()
  const providers = useProviders()
  const summary = useCopilotSummary()

  const copilot = createMemo(() => providers.connected().find((item) => item.id.startsWith("github-copilot")))
  const models = createMemo(() => summary.data()?.models.length ?? Object.keys(copilot()?.models ?? {}).length)
  const sessions = createMemo(() => summary.data()?.usage.totalSessions ?? 0)
  const messages = createMemo(() => summary.data()?.usage.totalMessages ?? 0)
  const tokens = createMemo(() => {
    const usage = summary.data()?.usage.totalTokens
    if (!usage) return 0
    return usage.input + usage.output + usage.reasoning + usage.cache.read + usage.cache.write
  })
  const stamp = createMemo(() => {
    const value = summary.data()?.usage.lastUpdated
    if (!value) return language.t("settings.copilot.lastUsed.empty")
    return new Date(value).toLocaleString()
  })

  const open = () => {
    if (!params.dir) return
    dialog.close()
    navigate(`/${params.dir}/copilot`)
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.copilot.title")}</h2>
          <p class="text-14-regular text-text-weak">{language.t("settings.copilot.subtitle")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-6 max-w-[720px]">
        <div class="rounded-3xl border border-border-weak-base bg-[radial-gradient(circle_at_top_left,rgba(86,156,214,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent)] p-5 sm:p-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex flex-col gap-2">
              <div class="inline-flex w-fit items-center rounded-full border border-border-weak-base bg-surface-base px-3 py-1 text-11-medium uppercase tracking-[0.16em] text-text-weak">
                {summary.data()?.connected || copilot()
                  ? language.t("settings.copilot.status.connected")
                  : language.t("settings.copilot.status.disconnected")}
              </div>
              <div class="text-18-medium text-text-strong">
                {summary.data()?.name ?? copilot()?.name ?? language.t("settings.copilot.status.empty")}
              </div>
              <div class="text-13-regular text-text-weak">
                {language.t("settings.copilot.models", { count: models() })}
              </div>
              <div class="text-12-regular text-text-weak">
                {language.t("settings.copilot.lastUsed")}: {stamp()}
              </div>
              <Show when={params.dir}>
                <div class="text-12-regular text-text-weak">
                  {language.t("settings.copilot.routeHint")} /{params.dir}/copilot
                </div>
              </Show>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                size="large"
                variant="secondary"
                onClick={() => dialog.show(() => <DialogConnectProvider provider="github-copilot" />)}
              >
                {copilot() ? language.t("settings.copilot.cta.reconnect") : language.t("settings.copilot.cta.connect")}
              </Button>
              <Show when={params.dir}>
                <Button size="large" variant="ghost" onClick={open}>
                  {language.t("settings.copilot.cta.open")}
                </Button>
              </Show>
            </div>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-2xl border border-border-weak-base bg-surface-base p-4">
            <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{language.t("settings.copilot.metric.models")}</div>
            <div class="mt-2 text-18-medium text-text-strong">{models().toLocaleString()}</div>
            <div class="mt-1 text-12-regular text-text-weak">{language.t("settings.copilot.feature.build")}</div>
          </div>
          <div class="rounded-2xl border border-border-weak-base bg-surface-base p-4">
            <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{language.t("settings.copilot.metric.sessions")}</div>
            <div class="mt-2 text-18-medium text-text-strong">{sessions().toLocaleString()}</div>
            <div class="mt-1 text-12-regular text-text-weak">{language.t("settings.copilot.feature.preview")}</div>
          </div>
          <div class="rounded-2xl border border-border-weak-base bg-surface-base p-4">
            <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{language.t("settings.copilot.metric.messages")}</div>
            <div class="mt-2 text-18-medium text-text-strong">{messages().toLocaleString()}</div>
            <div class="mt-1 text-12-regular text-text-weak">{language.t("settings.copilot.feature.publish")}</div>
          </div>
          <div class="rounded-2xl border border-border-weak-base bg-surface-base p-4">
            <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{language.t("settings.copilot.metric.tokens")}</div>
            <div class="mt-2 text-18-medium text-text-strong">{tokens().toLocaleString()}</div>
            <div class="mt-1 text-12-regular text-text-weak">{language.t("settings.copilot.feature.deploy")}</div>
          </div>
        </div>
      </div>
    </div>
  )
}