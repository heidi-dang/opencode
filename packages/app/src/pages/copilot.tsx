import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Tabs } from "@opencode-ai/ui/tabs"
import { TextField } from "@opencode-ai/ui/text-field"
import { Select } from "@opencode-ai/ui/select"
import { showToast } from "@opencode-ai/ui/toast"
import { batch, createEffect, createMemo, createResource, For, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useParams } from "@solidjs/router"
import { DialogConnectProvider } from "@/components/dialog-connect-provider"
import { Terminal } from "@/components/terminal"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { useBuilder } from "@/hooks/use-builder"
import { useCopilotSummary } from "@/hooks/use-copilot-summary"

const tabs = ["build", "preview", "publish", "deploy"] as const

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

type EnvItem = {
  id: string
  name: string
  host?: string
  url?: string
  vars?: Record<string, { source: "env" | "file" | "external" | "local"; redacted: string }>
}

type SecretItem = {
  id: string
  redacted: string
  updatedAt: number
}

function EnvSelect(props: {
  environments: EnvItem[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <Select
      options={props.environments}
      current={props.environments.find((item) => item.id === props.value)}
      value={(item) => item.id}
      label={(item) => item.name}
      onSelect={(item) => item && props.onChange(item.id)}
      variant="secondary"
      size="small"
    />
  )
}

function DeployHistory(props: {
  deploys: Array<{
    id: string
    host: string
    path: string
    url: string
    status: "running" | "ready" | "failed"
    environmentID?: string
    releaseID?: string
    createdAt: number
  }>
  onRollback: (deployID: string, environmentID?: string) => void
  environments: Record<string, string>
}) {
  return (
    <div class="mt-4 flex max-h-[420px] flex-col gap-3 overflow-y-auto">
      <Show
        when={props.deploys.length}
        fallback={<div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-weak">No deploys recorded yet.</div>}
      >
        <For each={props.deploys}>
          {(item) => (
            <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-13-medium text-text-strong">{item.host}</div>
                  <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{props.environments[item.environmentID ?? ""] || item.environmentID || "manual"}</div>
                </div>
                <Button size="small" variant="ghost" onClick={() => props.onRollback(item.id, item.environmentID)} disabled={item.status === "running"}>
                  Rollback
                </Button>
              </div>
              <div class="mt-1 break-all text-12-regular text-text-weak">{item.url}</div>
              <div class="mt-1 break-all text-12-regular text-text-weak">{item.path}</div>
              <div class="mt-2 text-11-regular text-text-weak">{item.releaseID || "No release"}</div>
              <div class="mt-2 text-11-regular text-text-weak">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}

function ReleaseHistory(props: {
  releases: Array<{
    id: string
    title: string
    shareURL?: string
    environmentID?: string
    createdAt: number
  }>
  onRollback: (releaseID: string, environmentID?: string) => void
  environments: Record<string, string>
}) {
  return (
    <div class="mt-4 flex max-h-[420px] flex-col gap-3 overflow-y-auto">
      <Show
        when={props.releases.length}
        fallback={<div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-weak">No releases recorded yet.</div>}
      >
        <For each={props.releases}>
          {(item) => (
            <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-13-medium text-text-strong">{item.title}</div>
                  <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">{props.environments[item.environmentID ?? ""] || item.environmentID || "shared"}</div>
                </div>
                <Button size="small" variant="ghost" onClick={() => props.onRollback(item.id, item.environmentID)}>
                  Rollback
                </Button>
              </div>
              <div class="mt-1 break-all text-12-regular text-text-weak">{item.shareURL || "Private release"}</div>
              <div class="mt-2 text-11-regular text-text-weak">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}

function EnvVarsSecrets(props: {
  vars: Record<string, { source: "env" | "file" | "external" | "local"; redacted: string }>
  secrets: SecretItem[]
}) {
  return (
    <div class="grid gap-4 lg:grid-cols-2">
      <div>
        <div class="mb-2 text-12-medium uppercase tracking-[0.12em] text-text-weak">Environment references</div>
        <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
          <Show when={Object.keys(props.vars).length} fallback={<div class="text-13-regular text-text-weak">No environment variables configured.</div>}>
            <For each={Object.entries(props.vars)}>
              {([key, value]) => (
                <div class="flex items-start justify-between gap-3 py-1.5">
                  <div class="min-w-0">
                    <div class="text-13-medium text-text-strong">{key}</div>
                    <div class="text-11-regular uppercase tracking-[0.12em] text-text-weak">{value.source}</div>
                  </div>
                  <div class="text-right text-12-regular text-text-weak">{value.redacted}</div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
      <div>
        <div class="mb-2 text-12-medium uppercase tracking-[0.12em] text-text-weak">Stored secrets</div>
        <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
          <Show when={props.secrets.length} fallback={<div class="text-13-regular text-text-weak">No stored secrets found.</div>}>
            <For each={props.secrets}>
              {(item) => (
                <div class="flex items-start justify-between gap-3 py-1.5">
                  <div class="min-w-0">
                    <div class="break-all text-13-medium text-text-strong">{item.id}</div>
                    <div class="text-11-regular text-text-weak">Updated {new Date(item.updatedAt).toLocaleString()}</div>
                  </div>
                  <div class="text-right text-12-regular text-text-weak">{item.redacted}</div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  )
}

export default function CopilotPage() {
  const dialog = useDialog()
  const language = useLanguage()
  const navigate = useNavigate()
  const params = useParams()
  const sync = useSync()
  const summary = useCopilotSummary()
  const builder = useBuilder()
  const app = createMemo(() => builder.dir().split("/").filter(Boolean).at(-1) ?? "app")
  const connected = createMemo(() => summary.data()?.connected ?? false)
  const total = createMemo(() => {
    const usage = summary.data()?.usage.totalTokens
    if (!usage) return 0
    return usage.input + usage.output + usage.reasoning + usage.cache.read + usage.cache.write
  })
  const sessionID = createMemo(() => builder.data()?.sessionID)
  const status = createMemo(() => {
    const id = sessionID()
    if (!id) return "idle"
    return sync.data.session_status[id]?.type ?? "idle"
  })
  const session = createMemo(() => {
    const id = sessionID()
    if (!id) return
    return sync.session.get(id)
  })
  const diff = createMemo(() => {
    const id = sessionID()
    if (!id) return []
    return sync.data.session_diff[id] ?? []
  })
  const messages = createMemo(() => {
    const id = sessionID()
    if (!id) return []
    return sync.data.message[id] ?? []
  })
  const feed = createMemo(() =>
    messages()
      .slice(-8)
      .map((msg) => ({
        id: msg.id,
        role: msg.role,
        text: (sync.data.part[msg.id] ?? [])
          .filter((part) => part.type === "text")
          .map((part) => text("text" in part ? part.text : ""))
          .join("\n")
          .trim(),
        time: new Date(msg.time.created).toLocaleTimeString(),
      })),
  )
  const share = createMemo(() => builder.data()?.releases?.[0]?.shareURL || session()?.share?.url)
  const preview = createMemo(() => builder.data()?.preview)
  const previewPty = createMemo(() => {
    const info = preview()?.info
    if (!info) return
    return {
      id: info.id,
      title: info.title,
      titleNumber: 1,
    }
  })
  const [store, setStore] = createStore({
    prompt: "",
    modelID: "",
    agent: "build",
    previewCommand: "",
    previewURL: "",
    annotationFile: "",
    annotationNote: "",
    environment: "",
    buildPending: false,
    previewPending: false,
    publishPending: false,
    deployPending: false,
    deployURL: "",
    deployLogs: [] as string[],
  })
  const environments = createMemo(() => builder.data()?.environments ?? [])
  const releases = createMemo(() => builder.data()?.releases ?? [])
  const deploys = createMemo(() => builder.data()?.deploys ?? [])
  const annotations = createMemo(() => builder.data()?.annotations ?? [])
  const selectedEnv = createMemo(() => environments().find((item) => item.id === store.environment))
  const environmentMap = createMemo(() => Object.fromEntries(environments().map((item) => [item.id, item.name])))
  const [secrets] = createResource(
    () => builder.dir(),
    async (dir) => {
      if (!dir || !builder.sdk()) return [] as SecretItem[]
      const out = await builder.sdk()!.builder.secret.list(undefined, { throwOnError: true })
      return (out.data ?? []) as SecretItem[]
    },
  )

  createEffect(
    on(
      () => builder.data()?.sessionID,
      (id) => {
        if (!id) return
        void sync.session.sync(id, { force: true })
        void sync.session.diff(id, { force: true })
      },
    ),
  )

  createEffect(() => {
    const current = summary.data()?.defaultModel
    const item = builder.data()
    const nextModel = item?.modelID ?? current ?? ""
    const nextAgent = item?.agent ?? "build"
    const nextCommand = item?.preview.shell ?? ""
    const nextURL = item?.preview.url ?? ""
    batch(() => {
      if (!store.modelID && nextModel) setStore("modelID", nextModel)
      if (store.agent === "build" && nextAgent) setStore("agent", nextAgent)
      if (!store.previewCommand && nextCommand) setStore("previewCommand", nextCommand)
      if (!store.previewURL && nextURL) setStore("previewURL", nextURL)
    })
  })

  createEffect(() => {
    const next = builder.data()?.environmentID ?? environments()[0]?.id
    if (!store.environment && next) setStore("environment", next)
  })

  async function ensureSession() {
    if (!builder.sdk()) return
    try {
      await builder.sdk()!.builder.session(
        {
          providerID: "github-copilot",
          modelID: store.modelID || summary.data()?.defaultModel,
          agent: store.agent,
        },
        { throwOnError: true },
      )
      await builder.refetch()
    } catch (error) {
      showToast({
        variant: "error",
        title: "Failed to create builder session",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    }
  }

  async function buildRun() {
    if (!builder.sdk() || !store.prompt.trim() || !store.modelID) return
    setStore("buildPending", true)
    try {
      await builder.sdk()!.builder.build(
        {
          prompt: store.prompt.trim(),
          providerID: "github-copilot",
          modelID: store.modelID,
          agent: store.agent,
        },
        { throwOnError: true },
      )
      await builder.refetch()
      await summary.refetch()
      showToast({
        variant: "success",
        title: "Builder run started",
        description: "Streaming into the dedicated builder session.",
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: "Builder run failed",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("buildPending", false)
    }
  }

  async function previewStart() {
    if (!builder.sdk()) return
    setStore("previewPending", true)
    try {
      await builder.sdk()!.builder.preview.start(
        {
          command: store.previewCommand || undefined,
          url: store.previewURL || undefined,
        },
        { throwOnError: true },
      )
      await builder.refetch()
    } catch (error) {
      showToast({
        variant: "error",
        title: "Failed to start preview",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("previewPending", false)
    }
  }

  async function previewStop() {
    if (!builder.sdk()) return
    setStore("previewPending", true)
    try {
      await builder.sdk()!.builder.preview.stop(undefined, { throwOnError: true })
      await builder.refetch()
    } catch (error) {
      showToast({
        variant: "error",
        title: "Failed to stop preview",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("previewPending", false)
    }
  }

  async function publish() {
    const id = sessionID()
    if (!summary.sdk() || !id) return
    setStore("publishPending", true)
    try {
      const result = await summary.sdk()!.provider.publish(
        {
          providerID: "github-copilot",
          sessionID: id,
        },
        { throwOnError: true },
      )
      await summary.sdk()!.builder.release(
        {
          sessionID: id,
          title: builder.data()?.title ?? `${app()} release`,
          shareURL: result.data!.shareURL,
        },
        { throwOnError: true },
      )
      await Promise.all([builder.refetch(), summary.refetch()])
      showToast({
        variant: "success",
        title: "Release published",
        description: result.data!.shareURL,
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: "Release publish failed",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("publishPending", false)
    }
  }

  async function unpublish() {
    const id = sessionID()
    if (!summary.sdk() || !id) return
    setStore("publishPending", true)
    try {
      await summary.sdk()!.provider.unpublish(
        {
          providerID: "github-copilot",
          sessionID: id,
        },
        { throwOnError: true },
      )
      await Promise.all([builder.refetch(), summary.refetch()])
    } catch (error) {
      showToast({
        variant: "error",
        title: "Release unpublish failed",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("publishPending", false)
    }
  }

  async function deployRun() {
    const id = sessionID()
    const releaseID = releases()[0]?.id
    if (!builder.sdk() || !store.environment || (!id && !releaseID)) return
    setStore("deployPending", true)
    try {
      const result = await builder.sdk()!.builder.deploy(
        {
          environmentID: store.environment,
          releaseID,
          sessionID: id || undefined,
        },
        { throwOnError: true },
      )
      setStore("deployURL", result.data!.url)
      setStore("deployLogs", result.data!.logs)
      await Promise.all([builder.refetch(), summary.refetch()])
      showToast({
        variant: "success",
        title: "Deployment finished",
        description: result.data!.url,
      })
    } catch (error) {
      setStore("deployLogs", [error instanceof Error ? error.message : language.t("common.requestFailed")])
      showToast({
        variant: "error",
        title: "Deployment failed",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("deployPending", false)
    }
  }

  async function rollbackDeploy(deployID: string, environmentID?: string) {
    if (!builder.sdk()) return
    setStore("deployPending", true)
    try {
      await builder.sdk()!.builder.rollback(
        {
          deployID,
          environmentID,
        },
        { throwOnError: true },
      )
      await Promise.all([builder.refetch(), summary.refetch()])
      showToast({
        variant: "success",
        title: "Rollback started",
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: "Rollback failed",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("deployPending", false)
    }
  }

  async function rollbackRelease(releaseID: string, environmentID?: string) {
    if (!builder.sdk()) return
    setStore("publishPending", true)
    try {
      await builder.sdk()!.builder.rollback(
        {
          releaseID,
          environmentID,
        },
        { throwOnError: true },
      )
      await Promise.all([builder.refetch(), summary.refetch()])
      showToast({
        variant: "success",
        title: "Rollback started",
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: "Rollback failed",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setStore("publishPending", false)
    }
  }

  async function addAnnotation() {
    if (!builder.sdk() || !store.annotationFile.trim() || !store.annotationNote.trim()) return
    try {
      await builder.sdk()!.builder.annotation(
        {
          file: store.annotationFile.trim(),
          note: store.annotationNote.trim(),
        },
        { throwOnError: true },
      )
      setStore("annotationNote", "")
      await builder.refetch()
    } catch (error) {
      showToast({
        variant: "error",
        title: "Failed to save annotation",
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    }
  }

  return (
    <main data-page="copilot-builder" class="h-full overflow-y-auto">
      <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8">
        <section class="overflow-hidden rounded-[28px] border border-border-weak-base bg-[radial-gradient(circle_at_top_left,rgba(86,156,214,0.22),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(135,206,235,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-6 sm:p-8">
          <div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div class="max-w-3xl">
              <div class="text-11-medium uppercase tracking-[0.16em] text-text-weak">GitHub Copilot Builder Runtime</div>
              <h1 class="mt-3 max-w-2xl text-28-medium leading-tight text-text-strong sm:text-[34px]">{builder.data()?.title ?? app()}</h1>
              <p class="mt-3 max-w-2xl text-14-regular leading-6 text-text-base sm:text-15-regular">
                This page now owns a real builder session, preview process, release history, deploy history, and annotation log for this workspace.
              </p>
              <div class="mt-6 flex flex-wrap gap-3">
                <Button size="large" variant="secondary" onClick={() => dialog.show(() => <DialogConnectProvider provider="github-copilot" />)}>
                  {connected() ? language.t("settings.copilot.cta.reconnect") : "Connect provider"}
                </Button>
                <Button size="large" variant="ghost" onClick={() => navigate(`/${params.dir}/session/${sessionID() ?? ""}`)} disabled={!sessionID()}>
                  Open builder session
                </Button>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-4 lg:min-w-[460px] lg:max-w-[560px]">
              <div class="rounded-2xl border border-border-weak-base bg-surface-base/80 p-4 backdrop-blur">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Connection</div>
                <div class="mt-2 text-14-medium text-text-strong">{connected() ? "Connected" : "Disconnected"}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-base/80 p-4 backdrop-blur">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Session</div>
                <div class="mt-2 truncate text-14-medium text-text-strong">{sessionID() ?? "Not created"}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-base/80 p-4 backdrop-blur">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Status</div>
                <div class="mt-2 truncate text-14-medium text-text-strong">{status()}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-base/80 p-4 backdrop-blur">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Tokens</div>
                <div class="mt-2 truncate text-14-medium text-text-strong">{total().toLocaleString()}</div>
              </div>
            </div>
          </div>
        </section>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="text-14-medium text-text-strong">Workspace summary</div>
                <div class="mt-1 text-13-regular text-text-weak">Provider stats are still live, but builder state now comes from the dedicated builder API.</div>
              </div>
              <div class="text-12-regular text-text-weak">{summary.data()?.project.worktree ?? builder.dir()}</div>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-4">
              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-4">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Models</div>
                <div class="mt-2 text-18-medium text-text-strong">{summary.data()?.models.length.toLocaleString() ?? "0"}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-4">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Messages</div>
                <div class="mt-2 text-18-medium text-text-strong">{summary.data()?.usage.totalMessages.toLocaleString() ?? "0"}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-4">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Releases</div>
                <div class="mt-2 text-18-medium text-text-strong">{releases().length.toLocaleString()}</div>
              </div>
              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-4">
                <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Deploys</div>
                <div class="mt-2 text-18-medium text-text-strong">{deploys().length.toLocaleString()}</div>
              </div>
            </div>
          </div>
          <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
            <div class="text-14-medium text-text-strong">Active defaults</div>
            <div class="mt-3 text-13-regular text-text-weak">Model</div>
            <div class="mt-1 break-all text-16-medium text-text-strong">{store.modelID || summary.data()?.defaultModel || "Not selected"}</div>
            <div class="mt-4 text-13-regular text-text-weak">Agent</div>
            <div class="mt-1 break-all text-16-medium text-text-strong">{store.agent}</div>
            <div class="mt-4 text-13-regular text-text-weak">Preview</div>
            <div class="mt-1 break-all text-16-medium text-text-strong">{preview()?.url || "Not running"}</div>
          </div>
        </div>

        <Tabs defaultValue="build" class="flex flex-col gap-6">
          <Tabs.List class="w-full overflow-x-auto rounded-2xl border border-border-weak-base bg-surface-base p-1">
            <div class="flex min-w-max gap-1">
              <For each={tabs}>{(item) => <Tabs.Trigger value={item}>{item}</Tabs.Trigger>}</For>
            </div>
          </Tabs.List>

          <Tabs.Content value="build">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-18-medium text-text-strong">Build runtime</div>
                    <div class="mt-1 text-13-regular text-text-weak">Prompt the real session engine. Output streams through the normal session and diff channels.</div>
                  </div>
                  <div class="rounded-full border border-border-weak-base bg-surface-raised-base px-3 py-1 text-11-medium uppercase tracking-[0.12em] text-text-weak">
                    {status()}
                  </div>
                </div>

                <div class="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div class="mb-2 text-12-medium uppercase tracking-[0.12em] text-text-weak">Model</div>
                    <Select
                      options={summary.data()?.models ?? []}
                      current={(summary.data()?.models ?? []).find((item) => item.id === store.modelID)}
                      value={(item) => item.id}
                      label={(item) => item.name}
                      onSelect={(item) => item && setStore("modelID", item.id)}
                      variant="secondary"
                      size="small"
                    />
                  </div>
                  <div>
                    <div class="mb-2 text-12-medium uppercase tracking-[0.12em] text-text-weak">Agent</div>
                    <Select
                      options={builder.agents() ?? []}
                      current={(builder.agents() ?? []).find((item) => item.name === store.agent)}
                      value={(item) => item.name}
                      label={(item) => item.name}
                      onSelect={(item) => item && setStore("agent", item.name)}
                      variant="secondary"
                      size="small"
                    />
                  </div>
                </div>

                <div class="mt-5">
                  <div class="mb-2 text-12-medium uppercase tracking-[0.12em] text-text-weak">Prompt</div>
                  <textarea
                    class="min-h-40 w-full rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-14-regular text-text-strong outline-none transition focus:border-border-strong-base"
                    value={store.prompt}
                    onInput={(event) => setStore("prompt", event.currentTarget.value)}
                    placeholder="Describe the feature, change, or app you want the builder to make."
                  />
                </div>

                <div class="mt-4 flex flex-wrap gap-2">
                  <Button size="large" variant="ghost" onClick={ensureSession}>Ensure session</Button>
                  <Button size="large" variant="secondary" disabled={!connected() || !store.prompt.trim() || !store.modelID || store.buildPending} onClick={buildRun}>
                    {store.buildPending ? "Starting build..." : "Run build"}
                  </Button>
                  <Button size="large" variant="ghost" disabled={!sessionID()} onClick={() => navigate(`/${params.dir}/session/${sessionID()}`)}>
                    Open thread
                  </Button>
                </div>
              </div>

              <div class="flex flex-col gap-4">
                <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                  <div class="text-14-medium text-text-strong">Recent activity</div>
                  <div class="mt-3 flex max-h-96 flex-col gap-3 overflow-y-auto">
                    <Show when={feed().length} fallback={<div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-weak">No builder messages yet.</div>}>
                      <For each={feed()}>
                        {(item) => (
                          <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                            <div class="flex items-center justify-between gap-3">
                              <div class="text-12-medium uppercase tracking-[0.12em] text-text-weak">{item.role}</div>
                              <div class="text-11-regular text-text-weak">{item.time}</div>
                            </div>
                            <div class="mt-2 whitespace-pre-wrap break-words text-13-regular text-text-base">{item.text || "Streaming..."}</div>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>

                <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                  <div class="text-14-medium text-text-strong">Changed files</div>
                  <div class="mt-3 flex flex-col gap-3">
                    <Show when={diff().length} fallback={<div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-weak">No file diffs yet.</div>}>
                      <For each={diff().slice(0, 8)}>
                        {(item) => (
                          <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                            <div class="text-13-medium text-text-strong break-all">{item.file}</div>
                            <div class="mt-1 text-12-regular text-text-weak">+{item.additions} / -{item.deletions}</div>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="preview">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
              <div class="flex flex-col gap-4">
                <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <div class="text-18-medium text-text-strong">Live preview</div>
                      <div class="mt-1 text-13-regular text-text-weak">Start the workspace preview command in a PTY and point the iframe at the served URL.</div>
                    </div>
                    <div class="rounded-full border border-border-weak-base bg-surface-raised-base px-3 py-1 text-11-medium uppercase tracking-[0.12em] text-text-weak">
                      {preview()?.status ?? "idle"}
                    </div>
                  </div>

                  <div class="mt-5 grid gap-4 sm:grid-cols-2">
                    <TextField label="Preview command" value={store.previewCommand} onChange={(value) => setStore("previewCommand", value)} />
                    <TextField label="Preview URL" value={store.previewURL} onChange={(value) => setStore("previewURL", value)} />
                  </div>

                  <div class="mt-4 flex flex-wrap gap-2">
                    <Button size="large" variant="secondary" disabled={store.previewPending} onClick={preview()?.ptyID ? previewStop : previewStart}>
                      {store.previewPending ? "Updating preview..." : preview()?.ptyID ? "Stop preview" : "Start preview"}
                    </Button>
                    <Button size="large" variant="ghost" disabled={!preview()?.url} onClick={() => preview()?.url && window.open(preview()!.url!, "_blank", "noopener,noreferrer")}>
                      Open in browser
                    </Button>
                  </div>
                </div>

                <div class="overflow-hidden rounded-3xl border border-border-weak-base bg-surface-base">
                  <div class="border-b border-border-weak-base px-5 py-4 text-14-medium text-text-strong">Preview frame</div>
                  <Show
                    when={preview()?.url}
                    fallback={<div class="p-8 text-13-regular text-text-weak">Start a preview process to render a live iframe here.</div>}
                  >
                    <iframe title="builder-preview" src={preview()?.url} class="h-[560px] w-full bg-white" />
                  </Show>
                </div>
              </div>

              <div class="flex flex-col gap-4">
                <div class="overflow-hidden rounded-3xl border border-border-weak-base bg-surface-base">
                  <div class="border-b border-border-weak-base px-5 py-4 text-14-medium text-text-strong">Preview terminal</div>
                  <div class="h-[360px] min-h-[360px]">
                    <Show when={previewPty()} fallback={<div class="p-8 text-13-regular text-text-weak">No preview PTY attached yet.</div>}>
                      {(pty) => <Terminal pty={pty()} class="h-full" autoFocus={false} />}
                    </Show>
                  </div>
                </div>

                <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                  <div class="text-14-medium text-text-strong">Annotations</div>
                  <div class="mt-2 text-13-regular text-text-weak">Capture file-focused notes that you want to feed back into the next build iteration.</div>
                  <div class="mt-4 grid gap-3">
                    <TextField label="File" value={store.annotationFile} onChange={(value) => setStore("annotationFile", value)} />
                    <textarea
                      class="min-h-28 w-full rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-14-regular text-text-strong outline-none transition focus:border-border-strong-base"
                      value={store.annotationNote}
                      onInput={(event) => setStore("annotationNote", event.currentTarget.value)}
                      placeholder="Describe what to change in that file or region."
                    />
                  </div>
                  <div class="mt-4 flex flex-wrap gap-2">
                    <Button size="large" variant="secondary" onClick={addAnnotation} disabled={!store.annotationFile.trim() || !store.annotationNote.trim()}>
                      Save annotation
                    </Button>
                  </div>
                  <div class="mt-4 flex max-h-56 flex-col gap-3 overflow-y-auto">
                    <Show when={annotations().length} fallback={<div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-weak">No annotations yet.</div>}>
                      <For each={annotations()}>
                        {(item) => (
                          <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                            <div class="text-13-medium text-text-strong break-all">{item.file}</div>
                            <div class="mt-1 whitespace-pre-wrap break-words text-12-regular text-text-base">{item.note}</div>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="publish">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-18-medium text-text-strong">Releases</div>
                <div class="mt-1 text-13-regular text-text-weak">Publishing now records release history against the builder project instead of only exposing a transient session share.</div>
                <div class="mt-5 rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-medium text-text-strong">{share() || "No published release yet."}</div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <Button size="large" variant="secondary" disabled={!sessionID() || store.publishPending} onClick={share() ? unpublish : publish}>
                    {store.publishPending ? "Updating release..." : share() ? "Unpublish" : "Publish release"}
                  </Button>
                  <Button size="large" variant="ghost" disabled={!share()} onClick={() => share() && window.open(share(), "_blank", "noopener,noreferrer")}>
                    Open release
                  </Button>
                </div>
              </div>

              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-14-medium text-text-strong">Release history</div>
                <div class="mt-4 flex max-h-[420px] flex-col gap-3 overflow-y-auto">
                  <Show when={releases().length} fallback={<div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-weak">No releases recorded yet.</div>}>
                    <For each={releases()}>
                      {(item) => (
                        <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                          <div class="text-13-medium text-text-strong">{item.title}</div>
                          <div class="mt-1 break-all text-12-regular text-text-weak">{item.shareURL || "Private release"}</div>
                          <div class="mt-2 text-11-regular text-text-weak">{new Date(item.createdAt).toLocaleString()}</div>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="deploy">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-18-medium text-text-strong">Deploy</div>
                <div class="mt-1 text-13-regular text-text-weak">Deploy the local builder release through the selected environment. Secrets stay in the builder secret store and are only exposed here as redacted references.</div>
                <Show when={environments().length}>
                  <div class="mt-5">
                    <div class="mb-2 text-12-medium uppercase tracking-[0.12em] text-text-weak">Environment</div>
                    <EnvSelect
                      environments={environments()}
                      value={store.environment}
                      onChange={(id) => setStore("environment", id)}
                    />
                  </div>
                </Show>
                <div class="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="large"
                    variant="secondary"
                    disabled={store.deployPending || !store.environment || (!sessionID() && !releases()[0]?.id)}
                    onClick={deployRun}
                  >
                    {store.deployPending ? "Deploying..." : "Run deploy"}
                  </Button>
                  <Button size="large" variant="ghost" disabled={!store.deployURL} onClick={() => store.deployURL && window.open(store.deployURL, "_blank", "noopener,noreferrer")}> 
                    Open deploy
                  </Button>
                </div>
                <Show when={store.deployURL}>
                  <div class="mt-4 rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-medium text-text-strong">{store.deployURL}</div>
                </Show>
                <Show when={store.deployLogs.length}>
                  <div class="mt-4 rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                    <div class="text-12-medium uppercase tracking-[0.12em] text-text-weak">Latest deploy logs</div>
                    <div class="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-12-regular text-text-base">{store.deployLogs.join("\n")}</div>
                  </div>
                </Show>
                <Show when={store.environment}>
                  <div class="mt-6">
                    <EnvVarsSecrets
                      vars={selectedEnv()?.vars ?? {}}
                      secrets={secrets() ?? []}
                    />
                  </div>
                </Show>
              </div>
              <div class="rounded-3xl border border-border-weak-base bg-surface-base p-5 sm:p-6">
                <div class="text-14-medium text-text-strong">Deploy history</div>
                <DeployHistory
                  deploys={deploys()}
                  onRollback={rollbackDeploy}
                  environments={environmentMap()}
                />
              </div>
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    </main>
  )
}
