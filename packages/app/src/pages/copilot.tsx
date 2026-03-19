import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Tabs } from "@opencode-ai/ui/tabs"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useParams } from "@solidjs/router"
import { DialogConnectProvider } from "@/components/dialog-connect-provider"
import { useLanguage } from "@/context/language"
import { useCopilotSummary } from "@/hooks/use-copilot-summary"
import { decode64 } from "@/utils/base64"

const lanes = [
  "copilot.page.build.lane.prompt",
  "copilot.page.build.lane.code",
  "copilot.page.build.lane.preview",
  "copilot.page.build.lane.deploy",
] as const

const publishItems = [
  "copilot.page.publish.item.private",
  "copilot.page.publish.item.updates",
  "copilot.page.publish.item.repo",
] as const

const deploy = [
  "copilot.page.deploy.item.compose",
  "copilot.page.deploy.item.logs",
  "copilot.page.deploy.item.rollback",
] as const

const tabs = ["build", "preview", "publish", "deploy"] as const

export default function CopilotPage() {
  const dialog = useDialog()
  const language = useLanguage()
  const navigate = useNavigate()
  const params = useParams()
  const summary = useCopilotSummary()
  const dir = createMemo(() => decode64(params.dir) ?? "")
  const app = createMemo(() => dir().split("/").filter(Boolean).at(-1) ?? "app")
  const target = createMemo(() => `${app()}.vps.local`)
  const client = createMemo(() => summary.sdk())
  const connected = createMemo(() => summary.data()?.connected ?? false)
  const latest = createMemo(() => summary.data()?.latestSession)
  const share = createMemo(() => store.shareURL || latest()?.shareURL)
  const total = createMemo(() => {
    const usage = summary.data()?.usage.totalTokens
    if (!usage) return 0
    return usage.input + usage.output + usage.reasoning + usage.cache.read + usage.cache.write
  })
  const stamp = createMemo(() => {
    const value = summary.data()?.usage.lastUpdated
    if (!value) return language.t("copilot.page.summary.empty")
    return new Date(value).toLocaleString()
  })
  const [store, setStore] = createStore({
    prompt: language.t("copilot.page.build.prompt.placeholder"),
    host: target(),
    publicPort: "8080",
    user: "root",
    password: "",
    path: `/srv/${app()}`,
    publishPending: false,
    deployPending: false,
    shareURL: "",
    deployURL: "",
    deployLogs: [] as string[],
  })

  async function publish() {
    const id = latest()?.id
    if (!client() || !id) return
    setStore("publishPending", true)
    try {
      const result = await client()!.provider.publish(
        {
          providerID: "github-copilot",
          sessionID: id,
        },
        { throwOnError: true },
      )
      setStore("shareURL", result.data!.shareURL)
      await summary.refetch()
      showToast({
        variant: "success",
        title: language.t("copilot.page.publish.toast.success"),
        description: result.data!.shareURL,
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("copilot.page.publish.toast.failed"),
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("publishPending", false)
    }
  }

  async function unpublish() {
    const id = latest()?.id
    if (!client() || !id) return
    setStore("publishPending", true)
    try {
      await client()!.provider.unpublish(
        {
          providerID: "github-copilot",
          sessionID: id,
        },
        { throwOnError: true },
      )
      setStore("shareURL", "")
      await summary.refetch()
      showToast({
        variant: "success",
        title: language.t("copilot.page.publish.toast.unpublished"),
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("copilot.page.publish.toast.failed"),
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("publishPending", false)
    }
  }

  async function deployRun() {
    if (!client()) return
    setStore("deployPending", true)
    try {
      const result = await client()!.provider.deploy(
        {
          providerID: "github-copilot",
          host: store.host,
          port: 22,
          user: store.user,
          password: store.password,
          path: store.path,
          publicPort: Number(store.publicPort || "8080"),
          sessionID: latest()?.id,
        },
        { throwOnError: true },
      )
      setStore("deployURL", result.data!.url)
      setStore("deployLogs", result.data!.logs)
      if (result.data!.shareURL) setStore("shareURL", result.data!.shareURL)
      await summary.refetch()
      showToast({
        variant: "success",
        title: language.t("copilot.page.deploy.toast.success"),
        description: result.data!.url,
      })
    } catch (error) {
      setStore("deployLogs", [error instanceof Error ? error.message : language.t("common.requestFailed")])
      showToast({
        variant: "error",
        title: language.t("copilot.page.deploy.toast.failed"),
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("deployPending", false)
    }
  }

  return (
    <main data-page="copilot-builder" class="h-full overflow-y-auto">
      <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8">
        <section class="overflow-hidden rounded-[28px] border border-border-weak-base bg-[radial-gradient(circle_at_top_left,rgba(86,156,214,0.22),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(135,206,235,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-6 sm:p-8">
          <div class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div class="max-w-3xl">
              <div class="inline-flex items-center gap-2 rounded-full border border-border-weak-base bg-surface-base px-3 py-1 text-11-medium uppercase tracking-[0.16em] text-text-weak">
                <Icon name="brain" size="small" />
                {language.t("copilot.page.badge")}
              </div>
              <h1 class="mt-4 max-w-2xl text-28-medium leading-tight text-text-strong sm:text-[34px]">
                {language.t("copilot.page.title")}
              </h1>
              <p class="mt-3 max-w-2xl text-14-regular leading-6 text-text-base sm:text-15-regular">
                {language.t("copilot.page.body")}
              </p>
              <div class="mt-6 flex flex-wrap gap-3">
                <Button
                  size="large"
                  variant="secondary"
                  onClick={() => dialog.show(() => <DialogConnectProvider provider="github-copilot" />)}
                >
                  {connected() ? language.t("settings.copilot.cta.reconnect") : language.t("copilot.page.cta.connect")}
                </Button>
                <Button size="large" variant="ghost" onClick={() => navigate(`/${params.dir}/session`)}>
                  {language.t("copilot.page.cta.session")}
                </Button>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3 lg:min-w-[360px] lg:max-w-[420px]">
              <div class="rounded-2xl border border-border-weak-base bg-surface-base/80 p-4 backdrop-blur">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">
                  {language.t("copilot.page.hero.connection")}
                </div>
                <div class="mt-2 text-14-medium text-text-strong">
                  {connected() ? language.t("settings.copilot.status.connected") : language.t("settings.copilot.status.disconnected")}
                </div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-base/80 p-4 backdrop-blur">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">
                  {language.t("copilot.page.hero.sessions")}
                </div>
                <div class="mt-2 truncate text-14-medium text-text-strong">{summary.data()?.usage.totalSessions.toLocaleString() ?? "0"}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-base/80 p-4 backdrop-blur">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">
                  {language.t("copilot.page.hero.tokens")}
                </div>
                <div class="mt-2 truncate text-14-medium text-text-strong">{total().toLocaleString()}</div>
              </div>
            </div>
          </div>
        </section>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="text-14-medium text-text-strong">{language.t("copilot.page.summary.title")}</div>
                <div class="mt-1 text-13-regular text-text-weak">{language.t("copilot.page.summary.subtitle")}</div>
              </div>
              <div class="text-12-regular text-text-weak">{stamp()}</div>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-4">
              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-4">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{language.t("copilot.page.metric.models")}</div>
                <div class="mt-2 text-18-medium text-text-strong">{summary.data()?.models.length.toLocaleString() ?? "0"}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-4">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{language.t("copilot.page.metric.messages")}</div>
                <div class="mt-2 text-18-medium text-text-strong">{summary.data()?.usage.totalMessages.toLocaleString() ?? "0"}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-4">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{language.t("copilot.page.metric.tokens")}</div>
                <div class="mt-2 text-18-medium text-text-strong">{total().toLocaleString()}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-4">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{language.t("copilot.page.metric.cost")}</div>
                <div class="mt-2 text-18-medium text-text-strong">${(summary.data()?.usage.totalCost ?? 0).toFixed(2)}</div>
              </div>
            </div>
          </div>
          <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
            <div class="text-14-medium text-text-strong">{language.t("copilot.page.metric.defaultModel")}</div>
            <div class="mt-2 text-16-medium text-text-strong break-all">
              {summary.data()?.defaultModel ?? language.t("copilot.page.summary.empty")}
            </div>
            <div class="mt-4 text-12-regular text-text-weak">
              {summary.data()?.project.worktree ?? app()}
            </div>
          </div>
        </div>

        <Tabs defaultValue="build" class="flex flex-col gap-6">
          <Tabs.List class="w-full overflow-x-auto rounded-2xl border border-border-weak-base bg-surface-base p-1">
            <div class="flex min-w-max gap-1">
              <For each={tabs}>
                {(item) => <Tabs.Trigger value={item}>{language.t(`copilot.page.tab.${item}` as const)}</Tabs.Trigger>}
              </For>
            </div>
          </Tabs.List>

          <Tabs.Content value="build">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-18-medium text-text-strong">{language.t("copilot.page.build.title")}</div>
                    <div class="mt-1 text-13-regular text-text-weak">{language.t("copilot.page.build.subtitle")}</div>
                  </div>
                  <div class="rounded-full border border-border-weak-base bg-surface-raised-base px-3 py-1 text-11-medium uppercase tracking-[0.12em] text-text-weak">
                    {language.t("copilot.page.build.status")}
                  </div>
                </div>
                <div class="mt-5">
                  <TextField
                    label={language.t("copilot.page.build.prompt.label")}
                    value={store.prompt}
                    onChange={(value) => setStore("prompt", value)}
                  />
                </div>
              </div>

              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-14-medium text-text-strong">{language.t("copilot.page.build.models")}</div>
                <div class="mt-2 text-13-regular text-text-weak">{language.t("copilot.page.build.modelsSubtitle")}</div>
                <Show
                  when={summary.data()?.models.length}
                  fallback={
                    <div class="mt-4 rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-weak">
                      {summary.data() ? language.t("copilot.page.build.modelsEmpty") : language.t("copilot.page.summary.loading")}
                    </div>
                  }
                >
                  <div class="mt-4 flex flex-col gap-3">
                    <For each={summary.data()?.models.slice(0, 5) ?? []}>
                      {(item) => (
                        <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                          <div class="flex items-center justify-between gap-3">
                            <div class="text-13-medium text-text-strong break-all">{item.name}</div>
                            <Show when={item.default}>
                              <div class="rounded-full border border-border-weak-base bg-surface-base px-2.5 py-0.5 text-10-medium uppercase tracking-[0.12em] text-text-weak">
                                {language.t("copilot.page.metric.default")}
                              </div>
                            </Show>
                          </div>
                          <div class="mt-1 text-12-regular text-text-weak">
                            {item.id} • {item.context?.toLocaleString() ?? "-"} ctx
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
                <div class="mt-5 text-14-medium text-text-strong">{language.t("copilot.page.build.lanes")}</div>
                <div class="mt-4 flex flex-col gap-3">
                  <For each={lanes}>
                    {(item, index) => (
                      <div class="flex items-start gap-3 rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                        <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-base text-11-medium text-text-strong">
                          {index() + 1}
                        </div>
                        <div class="text-13-regular text-text-base">{language.t(item)}</div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="preview">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
              <div class="overflow-hidden rounded-3xl border border-border-weak-base bg-surface-base">
                <div class="flex items-center justify-between border-b border-border-weak-base px-5 py-4">
                  <div>
                    <div class="text-18-medium text-text-strong">{language.t("copilot.page.preview.title")}</div>
                    <div class="mt-1 text-13-regular text-text-weak">{language.t("copilot.page.preview.subtitle")}</div>
                  </div>
                  <div class="text-12-medium text-text-weak">{language.t("copilot.page.preview.live")}</div>
                </div>
                <div class="p-5">
                  <div class="rounded-[24px] border border-dashed border-border-weak-base bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] p-6">
                    <div class="rounded-[20px] border border-border-weak-base bg-background-base p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      <div class="flex items-center justify-between gap-4">
                        <div>
                          <div class="text-12-medium uppercase tracking-[0.14em] text-text-weak">{app()}</div>
                          <div class="mt-2 text-22-medium text-text-strong">{language.t("copilot.page.preview.mockTitle")}</div>
                        </div>
                        <div class="rounded-full bg-surface-raised-base px-3 py-1 text-11-medium text-text-weak">
                          {language.t("copilot.page.preview.label")}
                        </div>
                      </div>
                      <div class="mt-6 grid gap-3 sm:grid-cols-2">
                        <div class="rounded-2xl border border-border-weak-base bg-surface-base p-4">
                          <div class="text-13-medium text-text-strong">{language.t("copilot.page.preview.blockA")}</div>
                          <div class="mt-1 text-12-regular text-text-weak">{language.t("copilot.page.preview.blockABody")}</div>
                        </div>
                        <div class="rounded-2xl border border-border-weak-base bg-surface-base p-4">
                          <div class="text-13-medium text-text-strong">{language.t("copilot.page.preview.blockB")}</div>
                          <div class="mt-1 text-12-regular text-text-weak">{language.t("copilot.page.preview.blockBBody")}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-14-medium text-text-strong">{language.t("copilot.page.preview.annotations")}</div>
                <div class="mt-2 text-13-regular text-text-weak">{language.t("copilot.page.preview.annotationsBody")}</div>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="publish">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-18-medium text-text-strong">{language.t("copilot.page.publish.title")}</div>
                <div class="mt-1 text-13-regular text-text-weak">{language.t("copilot.page.publish.subtitle")}</div>
                <div class="mt-5 rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-medium text-text-strong">
                  {share() || language.t("copilot.page.publish.empty")}
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <Button size="large" variant="secondary" disabled={!latest() || store.publishPending} onClick={share() ? unpublish : publish}>
                    {store.publishPending
                      ? language.t("copilot.page.publish.pending")
                      : share()
                        ? language.t("copilot.page.publish.action.unpublish")
                        : language.t("copilot.page.publish.action.publish")}
                  </Button>
                  <Show when={share()}>
                    <Button size="large" variant="ghost" onClick={() => window.open(share(), "_blank", "noopener,noreferrer")}>{language.t("copilot.page.publish.action.open")}</Button>
                  </Show>
                </div>
                <Show when={latest()}>
                  <div class="mt-4 text-12-regular text-text-weak">
                    {language.t("copilot.page.publish.session")}: {latest()!.title}
                  </div>
                </Show>
              </div>
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-14-medium text-text-strong">{language.t("copilot.page.publish.list")}</div>
                <div class="mt-4 flex flex-col gap-3">
                  <Show when={summary.data()?.usage.topModels.length}>
                    <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                      <div class="text-12-medium uppercase tracking-[0.12em] text-text-weak">{language.t("copilot.page.metric.topModel")}</div>
                      <div class="mt-2 text-13-medium text-text-strong">
                        {summary.data()?.usage.topModels[0]?.name ?? language.t("copilot.page.summary.empty")}
                      </div>
                    </div>
                  </Show>
                  <For each={publishItems}>
                    {(item) => (
                      <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-base">
                        {language.t(item)}
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="deploy">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-18-medium text-text-strong">{language.t("copilot.page.deploy.title")}</div>
                <div class="mt-1 text-13-regular text-text-weak">{language.t("copilot.page.deploy.subtitle")}</div>
                <div class="mt-5 grid gap-4 sm:grid-cols-2">
                  <TextField label={language.t("copilot.page.deploy.host")} value={store.host} onChange={(value) => setStore("host", value)} />
                  <TextField label={language.t("copilot.page.deploy.publicPort")} value={store.publicPort} onChange={(value) => setStore("publicPort", value)} />
                  <TextField label={language.t("copilot.page.deploy.user")} value={store.user} onChange={(value) => setStore("user", value)} />
                  <TextField label={language.t("copilot.page.deploy.password")} type="password" value={store.password} onChange={(value) => setStore("password", value)} />
                  <TextField label={language.t("copilot.page.deploy.path")} value={store.path} onChange={(value) => setStore("path", value)} />
                </div>
                <div class="mt-4 text-12-regular text-text-weak">{language.t("copilot.page.deploy.note")}</div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <Button size="large" variant="secondary" disabled={store.deployPending || !store.host || !store.user || !store.password || !store.path} onClick={deployRun}>
                    {store.deployPending ? language.t("copilot.page.deploy.pending") : language.t("copilot.page.deploy.action.run")}
                  </Button>
                  <Show when={store.deployURL}>
                    <Button size="large" variant="ghost" onClick={() => window.open(store.deployURL, "_blank", "noopener,noreferrer")}>
                      {language.t("copilot.page.deploy.action.open")}
                    </Button>
                  </Show>
                </div>
                <Show when={store.deployURL}>
                  <div class="mt-4 rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-medium text-text-strong">
                    {store.deployURL}
                  </div>
                </Show>
              </div>
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-14-medium text-text-strong">{language.t("copilot.page.deploy.list")}</div>
                <div class="mt-4 flex flex-col gap-3">
                  <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-base">
                    {language.t("copilot.page.deploy.connected", { status: connected() ? language.t("common.connected") : language.t("common.disconnected") })}
                  </div>
                  <Show when={store.deployLogs.length}>
                    <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                      <div class="text-12-medium uppercase tracking-[0.12em] text-text-weak">{language.t("copilot.page.deploy.logs")}</div>
                      <div class="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-12-regular text-text-base">
                        {store.deployLogs.join("\n")}
                      </div>
                    </div>
                  </Show>
                  <For each={deploy}>
                    {(item) => (
                      <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-base">
                        {language.t(item)}
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    </main>
  )
}