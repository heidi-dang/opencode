import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Select } from "@opencode-ai/ui/select"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { batch, createEffect, createMemo, createResource, createSignal, For, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useParams } from "@solidjs/router"
import { DialogConnectProvider } from "@/components/dialog-connect-provider"
import { Terminal } from "@/components/terminal"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { useBuilder } from "@/hooks/use-builder"
import { useCopilotSummary } from "@/hooks/use-copilot-summary"

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

type Tab = "chat" | "preview"

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

function Metric(props: { label: string; value: string }) {
  return (
    <div class="rounded-[24px] border border-border-weak-base bg-surface-base/80 px-4 py-3 backdrop-blur">
      <div class="text-11-medium uppercase tracking-[0.14em] text-text-weak">{props.label}</div>
      <div class="mt-2 text-14-medium text-text-strong">{props.value}</div>
    </div>
  )
}

function Empty(props: { title: string; copy: string; action?: string; onAction?: () => void; disabled?: boolean }) {
  return (
    <div class="flex h-full min-h-56 flex-col items-center justify-center rounded-[28px] border border-dashed border-border-weak-base bg-surface-base/60 px-6 py-8 text-center">
      <div class="text-16-medium text-text-strong">{props.title}</div>
      <div class="mt-2 max-w-md text-13-regular leading-6 text-text-weak">{props.copy}</div>
      <Show when={props.action && props.onAction}>
        <Button class="mt-5" size="large" variant="secondary" onClick={() => props.onAction?.()} disabled={props.disabled}>
          {props.action}
        </Button>
      </Show>
    </div>
  )
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
    <div class="mt-4 flex max-h-[320px] flex-col gap-3 overflow-y-auto">
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
    <div class="mt-4 flex max-h-[320px] flex-col gap-3 overflow-y-auto">
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
  const [tab, setTab] = createSignal<Tab>("chat")
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
  const thread = createMemo(() =>
    messages().map((msg) => {
      const parts = sync.data.part[msg.id] ?? []
      const body = parts
        .filter((part) => part.type === "text")
        .map((part) => text("text" in part ? part.text : ""))
        .join("\n")
        .trim()

      return {
        id: msg.id,
        role: msg.role,
        body,
        busy: msg.role === "assistant" && typeof msg.time.completed !== "number",
        time: new Date(msg.time.created).toLocaleTimeString(),
      }
    }),
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
      setStore("prompt", "")
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
    if (!summary.sdk() || !id || !builder.sdk()) return
    setStore("publishPending", true)
    try {
      const result = await summary.sdk()!.provider.publish(
        {
          providerID: "github-copilot",
          sessionID: id,
        },
        { throwOnError: true },
      )
      await builder.sdk()!.builder.release(
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
      setStore("annotationFile", "")
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

  const promptReady = createMemo(() => !!store.prompt.trim() && !!store.modelID)
  const previewReady = createMemo(() => !!preview()?.url)

  return (
    <main data-page="copilot-builder" class="flex h-full min-h-0 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(86,156,214,0.12),transparent_24%),radial-gradient(circle_at_top,rgba(86,156,214,0.18),transparent_36%),linear-gradient(180deg,rgba(10,14,22,0.96),rgba(10,14,22,0.98))]">
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
        <section class="shrink-0 rounded-[30px] border border-border-weak-base bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:px-6 sm:py-5">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div class="max-w-3xl">
              <div class="text-11-medium uppercase tracking-[0.18em] text-text-weak">GitHub Copilot Builder Studio</div>
              <h1 class="mt-2 text-24-medium leading-tight text-text-strong sm:text-[30px]">{builder.data()?.title ?? app()}</h1>
              <div class="mt-2 max-w-2xl text-13-regular leading-6 text-text-base sm:text-14-regular">
                A builder-first Copilot workspace with a focused session thread and a live preview surface on the same route.
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                <Button size="large" variant="secondary" onClick={() => dialog.show(() => <DialogConnectProvider provider="github-copilot" />)}>
                  {connected() ? language.t("settings.copilot.cta.reconnect") : "Connect provider"}
                </Button>
                <Button size="large" variant="ghost" onClick={ensureSession} disabled={!connected() || !!sessionID()}>
                  {sessionID() ? "Builder session ready" : "Create builder session"}
                </Button>
                <Button size="large" variant="ghost" onClick={() => navigate(`/${params.dir}/session/${sessionID() ?? ""}`)} disabled={!sessionID()}>
                  Open full session
                </Button>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:min-w-[560px]">
              <Metric label="Connection" value={connected() ? "Connected" : "Disconnected"} />
              <Metric label="Session" value={sessionID() ?? "Not created"} />
              <Metric label="Status" value={status()} />
              <Metric label="Tokens" value={total().toLocaleString()} />
            </div>
          </div>
        </section>

        <div class="mt-3 flex min-h-0 flex-1 overflow-hidden rounded-[32px] border border-border-weak-base bg-black/20 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur">
          <Show when={tab() === "chat"}>
            <div class="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border-weak-base lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
              <section class="flex min-h-0 flex-col bg-background-base/90">
                <div class="shrink-0 border-b border-border-weak-base px-4 py-4 sm:px-6">
                  <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div class="text-18-medium text-text-strong">Chat</div>
                      <div class="mt-1 text-13-regular text-text-weak">The builder session stream stays live here, with the current model, agent, prompt composer, and file diffs tied to the active session ID.</div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <Button size="small" variant="ghost" onClick={() => share() ? unpublish() : publish()} disabled={!sessionID() || store.publishPending}>
                        {store.publishPending ? "Updating release..." : share() ? "Unpublish release" : "Publish release"}
                      </Button>
                      <Button size="small" variant="ghost" onClick={deployRun} disabled={store.deployPending || !store.environment || (!sessionID() && !releases()[0]?.id)}>
                        {store.deployPending ? "Deploying..." : "Deploy"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                  <Show
                    when={sessionID()}
                    fallback={
                      <Empty
                        title="No builder session yet"
                        copy="Create the builder session first, then prompts and assistant output will stream into this workspace instead of the old dashboard layout."
                        action="Create session"
                        onAction={ensureSession}
                        disabled={!connected()}
                      />
                    }
                  >
                    <Show
                      when={thread().length}
                      fallback={
                        <Empty
                          title="The workspace is ready for the first prompt"
                          copy="Use the composer below to kick off a builder run. Messages from the dedicated session will appear here as they stream."
                        />
                      }
                    >
                      <div class="flex flex-col gap-4 pb-4">
                        <For each={thread()}>
                          {(item) => (
                            <div classList={{ "ml-auto max-w-[92%] sm:max-w-[80%]": item.role === "user", "max-w-[94%] sm:max-w-[82%]": item.role !== "user" }}>
                              <div
                                classList={{
                                  "rounded-[28px] border px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.12)]": true,
                                  "border-sky-400/30 bg-[linear-gradient(180deg,rgba(86,156,214,0.26),rgba(24,36,56,0.92))] text-white": item.role === "user",
                                  "border-border-weak-base bg-surface-base text-text-base": item.role !== "user",
                                }}
                              >
                                <div class="flex items-center justify-between gap-3 text-11-medium uppercase tracking-[0.12em]">
                                  <span classList={{ "text-white/70": item.role === "user", "text-text-weak": item.role !== "user" }}>{item.role}</span>
                                  <span classList={{ "text-white/60": item.role === "user", "text-text-weak": item.role !== "user" }}>{item.time}</span>
                                </div>
                                <div class="mt-2 whitespace-pre-wrap break-words text-14-regular leading-6">
                                  {item.body || (item.busy ? "Working..." : "No text content captured for this message.")}
                                </div>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </div>

                <div class="shrink-0 border-t border-border-weak-base bg-background-base/95 px-4 py-4 sm:px-6 sm:py-5">
                  <div class="rounded-[28px] border border-border-weak-base bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
                    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.42fr)_minmax(220px,0.38fr)]">
                      <div>
                        <div class="mb-2 text-12-medium uppercase tracking-[0.12em] text-text-weak">Prompt</div>
                        <textarea
                          class="min-h-32 w-full rounded-[22px] border border-border-weak-base bg-surface-raised-base px-4 py-3 text-14-regular text-text-strong outline-none transition focus:border-border-strong-base"
                          value={store.prompt}
                          onInput={(event) => setStore("prompt", event.currentTarget.value)}
                          placeholder="Describe the feature, fix, or UI change you want the builder to make next."
                        />
                      </div>
                      <div class="grid gap-4">
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
                      <div class="flex flex-col gap-3">
                        <div class="rounded-[22px] border border-border-weak-base bg-surface-raised-base px-4 py-3">
                          <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Session link</div>
                          <div class="mt-2 break-all text-13-medium text-text-strong">{sessionID() ?? "Not created"}</div>
                        </div>
                        <div class="grid gap-2">
                          <Button size="large" variant="secondary" disabled={!connected() || !promptReady() || store.buildPending} onClick={buildRun}>
                            {store.buildPending ? "Starting build..." : "Send prompt"}
                          </Button>
                          <Button size="large" variant="ghost" onClick={() => navigate(`/${params.dir}/session/${sessionID() ?? ""}`)} disabled={!sessionID()}>
                            Open full thread
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <aside class="flex min-h-0 flex-col bg-background-stronger/95">
                <div class="shrink-0 border-b border-border-weak-base px-4 py-4 sm:px-5">
                  <div class="text-16-medium text-text-strong">Builder state</div>
                  <div class="mt-1 text-13-regular text-text-weak">Live metadata, recent changes, and release readiness for the same builder session.</div>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  <div class="flex flex-col gap-4">
                    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                        <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Preview</div>
                        <div class="mt-2 break-all text-14-medium text-text-strong">{preview()?.url || "Not running"}</div>
                      </div>
                      <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                        <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Release</div>
                        <div class="mt-2 break-all text-14-medium text-text-strong">{share() || "Unpublished"}</div>
                      </div>
                    </div>

                    <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                      <div class="flex items-center justify-between gap-3">
                        <div class="text-14-medium text-text-strong">Changed files</div>
                        <div class="text-12-regular text-text-weak">{diff().length}</div>
                      </div>
                      <div class="mt-3 flex max-h-72 flex-col gap-3 overflow-y-auto">
                        <Show when={diff().length} fallback={<div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-weak">No file diffs yet.</div>}>
                          <For each={diff().slice(0, 10)}>
                            {(item) => (
                              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                                <div class="break-all text-13-medium text-text-strong">{item.file}</div>
                                <div class="mt-1 text-12-regular text-text-weak">+{item.additions} / -{item.deletions}</div>
                              </div>
                            )}
                          </For>
                        </Show>
                      </div>
                    </div>

                    <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                      <div class="text-14-medium text-text-strong">Release history</div>
                      <ReleaseHistory releases={releases()} onRollback={rollbackRelease} environments={environmentMap()} />
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </Show>

          <Show when={tab() === "preview"}>
            <div class="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border-weak-base xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.85fr)]">
              <section class="flex min-h-0 flex-col bg-background-base/90">
                <div class="shrink-0 border-b border-border-weak-base px-4 py-4 sm:px-6">
                  <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div class="text-18-medium text-text-strong">Preview</div>
                      <div class="mt-1 text-13-regular text-text-weak">The builder preview process, current URL, and live surface stay front and center here.</div>
                    </div>
                    <div class="flex flex-wrap gap-2 text-12-regular text-text-weak">
                      <span class="rounded-full border border-border-weak-base bg-surface-base px-3 py-1">{preview()?.status ?? "idle"}</span>
                      <span class="rounded-full border border-border-weak-base bg-surface-base px-3 py-1">{preview()?.url || "No URL"}</span>
                    </div>
                  </div>
                </div>

                <div class="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
                  <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border-weak-base bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
                    <div class="flex items-center justify-between gap-3 border-b border-border-weak-base px-4 py-3">
                      <div class="min-w-0">
                        <div class="truncate text-13-medium text-text-strong">{preview()?.url || "Preview surface"}</div>
                        <div class="mt-1 text-12-regular text-text-weak">{preview()?.shell || store.previewCommand || "No active preview command"}</div>
                      </div>
                      <div class="flex gap-2">
                        <Button size="small" variant="secondary" disabled={store.previewPending} onClick={preview()?.ptyID ? previewStop : previewStart}>
                          {store.previewPending ? "Updating..." : preview()?.ptyID ? "Stop" : "Start"}
                        </Button>
                        <Button size="small" variant="ghost" disabled={!previewReady()} onClick={() => preview()?.url && window.open(preview()!.url!, "_blank", "noopener,noreferrer")}>
                          Open
                        </Button>
                      </div>
                    </div>
                    <div class="min-h-0 flex-1 overflow-hidden bg-white">
                      <Show
                        when={preview()?.url}
                        fallback={
                          <div class="flex h-full items-center justify-center p-6">
                            <Empty
                              title="No live preview yet"
                              copy="Start the workspace preview process to render the builder app here. The current URL and terminal status will update alongside it."
                              action="Start preview"
                              onAction={previewStart}
                              disabled={store.previewPending}
                            />
                          </div>
                        }
                      >
                        <iframe title="builder-preview" src={preview()?.url} class="h-full min-h-0 w-full bg-white" />
                      </Show>
                    </div>
                  </div>
                </div>
              </section>

              <aside class="flex min-h-0 flex-col bg-background-stronger/95">
                <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  <div class="flex flex-col gap-4">
                    <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                      <div class="text-14-medium text-text-strong">Preview controls</div>
                      <div class="mt-3 grid gap-3">
                        <TextField label="Preview command" value={store.previewCommand} onChange={(value) => setStore("previewCommand", value)} />
                        <TextField label="Preview URL" value={store.previewURL} onChange={(value) => setStore("previewURL", value)} />
                      </div>
                    </div>

                    <div class="overflow-hidden rounded-[24px] border border-border-weak-base bg-surface-base">
                      <div class="border-b border-border-weak-base px-4 py-3 text-14-medium text-text-strong">Preview terminal</div>
                      <div class="h-[300px] min-h-[300px]">
                        <Show when={previewPty()} fallback={<div class="flex h-full items-center justify-center px-6 text-center text-13-regular text-text-weak">No preview PTY attached yet.</div>}>
                          {(pty) => <Terminal pty={pty()} class="h-full" autoFocus={false} />}
                        </Show>
                      </div>
                    </div>

                    <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                      <div class="text-14-medium text-text-strong">Release and deploy</div>
                      <div class="mt-3 flex flex-col gap-3">
                        <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                          <div class="text-11-medium uppercase tracking-[0.12em] text-text-weak">Share URL</div>
                          <div class="mt-2 break-all text-13-medium text-text-strong">{share() || "No published release yet."}</div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <Button size="small" variant="secondary" disabled={!sessionID() || store.publishPending} onClick={() => share() ? unpublish() : publish()}>
                            {store.publishPending ? "Updating release..." : share() ? "Unpublish" : "Publish"}
                          </Button>
                          <Button size="small" variant="ghost" disabled={!share()} onClick={() => share() && window.open(share(), "_blank", "noopener,noreferrer")}>
                            Open release
                          </Button>
                        </div>
                        <Show when={environments().length}>
                          <div>
                            <div class="mb-2 text-12-medium uppercase tracking-[0.12em] text-text-weak">Environment</div>
                            <EnvSelect environments={environments()} value={store.environment} onChange={(id) => setStore("environment", id)} />
                          </div>
                        </Show>
                        <div class="flex flex-wrap gap-2">
                          <Button size="small" variant="secondary" disabled={store.deployPending || !store.environment || (!sessionID() && !releases()[0]?.id)} onClick={deployRun}>
                            {store.deployPending ? "Deploying..." : "Run deploy"}
                          </Button>
                          <Button size="small" variant="ghost" disabled={!store.deployURL} onClick={() => store.deployURL && window.open(store.deployURL, "_blank", "noopener,noreferrer")}>
                            Open deploy
                          </Button>
                        </div>
                        <Show when={store.deployURL}>
                          <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-medium text-text-strong">{store.deployURL}</div>
                        </Show>
                        <Show when={store.deployLogs.length}>
                          <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                            <div class="text-12-medium uppercase tracking-[0.12em] text-text-weak">Latest deploy logs</div>
                            <div class="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-12-regular text-text-base">{store.deployLogs.join("\n")}</div>
                          </div>
                        </Show>
                      </div>
                    </div>

                    <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                      <div class="text-14-medium text-text-strong">Annotations</div>
                      <div class="mt-2 text-13-regular text-text-weak">Capture preview findings or implementation notes for the next builder run.</div>
                      <div class="mt-3 grid gap-3">
                        <TextField label="File" value={store.annotationFile} onChange={(value) => setStore("annotationFile", value)} />
                        <textarea
                          class="min-h-28 w-full rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-14-regular text-text-strong outline-none transition focus:border-border-strong-base"
                          value={store.annotationNote}
                          onInput={(event) => setStore("annotationNote", event.currentTarget.value)}
                          placeholder="Describe what should change in that file or region."
                        />
                        <Button size="small" variant="secondary" onClick={addAnnotation} disabled={!store.annotationFile.trim() || !store.annotationNote.trim()}>
                          Save annotation
                        </Button>
                      </div>
                      <div class="mt-4 flex max-h-56 flex-col gap-3 overflow-y-auto">
                        <Show when={annotations().length} fallback={<div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-13-regular text-text-weak">No annotations yet.</div>}>
                          <For each={annotations()}>
                            {(item) => (
                              <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base px-4 py-3">
                                <div class="break-all text-13-medium text-text-strong">{item.file}</div>
                                <div class="mt-1 whitespace-pre-wrap break-words text-12-regular text-text-base">{item.note}</div>
                              </div>
                            )}
                          </For>
                        </Show>
                      </div>
                    </div>

                    <Show when={store.environment}>
                      <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                        <div class="text-14-medium text-text-strong">Environment state</div>
                        <div class="mt-4">
                          <EnvVarsSecrets vars={selectedEnv()?.vars ?? {}} secrets={secrets() ?? []} />
                        </div>
                      </div>
                    </Show>

                    <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                      <div class="text-14-medium text-text-strong">Release history</div>
                      <ReleaseHistory releases={releases()} onRollback={rollbackRelease} environments={environmentMap()} />
                    </div>

                    <div class="rounded-[24px] border border-border-weak-base bg-surface-base px-4 py-4">
                      <div class="text-14-medium text-text-strong">Deploy history</div>
                      <DeployHistory deploys={deploys()} onRollback={rollbackDeploy} environments={environmentMap()} />
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </Show>
        </div>
      </div>

      <div class="shrink-0 border-t border-border-weak-base bg-background-base/95 px-3 py-3 backdrop-blur sm:px-5 sm:py-4">
        <div class="mx-auto flex w-full max-w-xl items-center rounded-full border border-border-weak-base bg-surface-base p-1 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
          <For each={["chat", "preview"] as const}>
            {(item) => (
              <button
                type="button"
                classList={{
                  "flex-1 rounded-full px-4 py-3 text-14-medium transition": true,
                  "bg-[linear-gradient(180deg,rgba(86,156,214,0.28),rgba(86,156,214,0.14))] text-text-strong shadow-[0_10px_24px_rgba(86,156,214,0.16)]": tab() === item,
                  "text-text-weak hover:text-text-strong": tab() !== item,
                }}
                onClick={() => setTab(item)}
              >
                {item === "chat" ? "Chat" : "Preview"}
              </button>
            )}
          </For>
        </div>
      </div>
    </main>
  )
}
