import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Select } from "@opencode-ai/ui/select"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { batch, createEffect, createMemo, createResource, createSignal, For, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useParams } from "@solidjs/router"
import { DialogConnectProvider } from "@/components/dialog-connect-provider"
import { DialogEnvironment } from "@/components/dialog-environment"
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

/* ── tiny helpers ────────────────────────── */

function Pill(props: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      classList={{
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-12-medium backdrop-blur-sm transition-all duration-200": true,
        "border-sky-400/30 bg-sky-400/10 text-sky-300": !!props.accent,
        "border-white/8 bg-white/5 text-white/60": !props.accent,
      }}
    >
      <span class="text-[10px] uppercase tracking-[0.16em] opacity-60">{props.label}</span>
      <span>{props.value}</span>
    </div>
  )
}

function Empty(props: { title: string; copy: string; action?: string; onAction?: () => void; disabled?: boolean }) {
  return (
    <div class="flex h-full min-h-32 flex-col items-center justify-center px-4 py-6 text-center sm:min-h-48 sm:px-6 sm:py-10">
      <div class="mx-auto h-9 w-9 rounded-xl border border-white/8 bg-white/5 grid place-items-center mb-3 sm:h-12 sm:w-12 sm:rounded-2xl sm:mb-4">
        <svg
          class="h-4 w-4 text-white/30 sm:h-5 sm:w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
      <div class="text-13-medium text-white/80 sm:text-15-medium">{props.title}</div>
      <div class="mt-1 max-w-[260px] text-12-regular leading-[1.5] text-white/40 sm:mt-1.5 sm:max-w-sm sm:text-13-regular">
        {props.copy}
      </div>
      <Show when={props.action && props.onAction}>
        <button
          type="button"
          class="mt-4 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1.5 text-12-medium text-sky-300 transition-all duration-200 hover:bg-sky-400/20 disabled:opacity-40 sm:mt-5 sm:px-5 sm:py-2 sm:text-13-medium"
          onClick={() => props.onAction?.()}
          disabled={props.disabled}
        >
          {props.action}
        </button>
      </Show>
    </div>
  )
}

function EnvSelect(props: { environments: EnvItem[]; value: string; onChange: (id: string) => void }) {
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
    <div class="mt-3 flex max-h-60 flex-col gap-2 overflow-y-auto">
      <Show
        when={props.deploys.length}
        fallback={
          <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 text-12-regular text-white/40">
            No deploys recorded.
          </div>
        }
      >
        <For each={props.deploys}>
          {(item) => (
            <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="truncate text-12-medium text-white/70">{item.host}</div>
                  <div class="text-[10px] uppercase tracking-[0.1em] text-white/30">
                    {props.environments[item.environmentID ?? ""] || "manual"}
                  </div>
                </div>
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() => props.onRollback(item.id, item.environmentID)}
                  disabled={item.status === "running"}
                >
                  Rollback
                </Button>
              </div>
              <div class="mt-1 break-all text-11-regular text-white/30">{item.url}</div>
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
    <div class="mt-3 flex max-h-60 flex-col gap-2 overflow-y-auto">
      <Show
        when={props.releases.length}
        fallback={
          <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 text-12-regular text-white/40">
            No releases recorded.
          </div>
        }
      >
        <For each={props.releases}>
          {(item) => (
            <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="truncate text-12-medium text-white/70">{item.title}</div>
                  <div class="text-[10px] uppercase tracking-[0.1em] text-white/30">
                    {props.environments[item.environmentID ?? ""] || "shared"}
                  </div>
                </div>
                <Button size="small" variant="ghost" onClick={() => props.onRollback(item.id, item.environmentID)}>
                  Rollback
                </Button>
              </div>
              <div class="mt-1 break-all text-11-regular text-white/30">{item.shareURL || "Private"}</div>
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
    <div class="grid gap-3 lg:grid-cols-2">
      <div>
        <div class="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/40">Env vars</div>
        <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
          <Show when={Object.keys(props.vars).length} fallback={<div class="text-12-regular text-white/30">None</div>}>
            <For each={Object.entries(props.vars)}>
              {([key, value]) => (
                <div class="flex items-start justify-between gap-2 py-1">
                  <div class="min-w-0">
                    <div class="text-12-medium text-white/70">{key}</div>
                    <div class="text-[10px] uppercase tracking-[0.1em] text-white/30">{value.source}</div>
                  </div>
                  <div class="text-right text-11-regular text-white/30">{value.redacted}</div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
      <div>
        <div class="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/40">Secrets</div>
        <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
          <Show when={props.secrets.length} fallback={<div class="text-12-regular text-white/30">None</div>}>
            <For each={props.secrets}>
              {(item) => (
                <div class="flex items-start justify-between gap-2 py-1">
                  <div class="min-w-0">
                    <div class="break-all text-12-medium text-white/70">{item.id}</div>
                    <div class="text-[10px] text-white/30">{new Date(item.updatedAt).toLocaleString()}</div>
                  </div>
                  <div class="text-right text-11-regular text-white/30">{item.redacted}</div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  )
}

/* ── page ────────────────────────────────── */

export default function CopilotPage() {
  const dialog = useDialog()
  const language = useLanguage()
  const navigate = useNavigate()
  const params = useParams()
  const sync = useSync()
  const summary = useCopilotSummary()
  const builder = useBuilder()
  const [tab, setTab] = createSignal<Tab>("chat")
  const [sidebar, setSidebar] = createSignal(true)
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
    systemInstruction: "",
    temperature: 0.7,
    topK: 40,
    topP: 0.9,
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

  /* ── actions ─────────────────────────── */

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
          variant: store.systemInstruction ? store.systemInstruction : undefined,
          temperature: store.temperature,
          topK: store.topK,
          topP: store.topP,
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
    if (!builder.sdk() || (!id && !releaseID)) return

    dialog.show(() => (
      <DialogEnvironment
        defaultHost={selectedEnv()?.host}
        onDeploy={async (credentials) => {
          setStore("deployPending", true)
          try {
            const result = await builder.sdk()!.builder.deploy(
              {
                environmentID: store.environment || undefined,
                releaseID,
                sessionID: id || undefined,
                host: credentials.host,
                port: credentials.port,
                user: credentials.user,
                password: credentials.password || "",
                path: credentials.path,
                publicPort: credentials.publicPort,
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
            throw error // ensures dialog spinner stops if handled internally
          } finally {
            setStore("deployPending", false)
          }
        }}
      />
    ))
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
      showToast({ variant: "success", title: "Rollback started" })
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
      showToast({ variant: "success", title: "Rollback started" })
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

  /* ── render ──────────────────────────── */

  return (
    <main
      data-page="copilot-builder"
      class="flex h-full min-h-0 w-full self-stretch flex-col overflow-hidden bg-[#0a0e16]"
    >
      {/* ─── top bar ─────────────────────── */}
      <header class="z-20 shrink-0 border-b border-white/6 bg-[#0d1117]/95 backdrop-blur-lg">
        <div class="flex h-11 items-center justify-between gap-2 px-2 sm:h-14 sm:gap-3 sm:px-5">
          {/* left: back + title */}
          <div class="flex items-center gap-1.5 min-w-0 sm:gap-2.5">
            <button
              type="button"
              class="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/5 text-white/50 transition-all duration-200 hover:bg-white/10 sm:hidden"
              onClick={() => navigate(-1)}
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <div
                  class="h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2"
                  classList={{
                    "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]": connected(),
                    "bg-white/20": !connected(),
                  }}
                />
                <h1 class="truncate text-12-medium text-white/90 sm:text-15-medium">
                  {builder.data()?.title ?? app()}
                </h1>
              </div>
              <div class="hidden text-[10px] uppercase tracking-[0.16em] text-white/30 sm:block sm:text-11-medium">
                Copilot Builder Studio
              </div>
            </div>
          </div>

          {/* center: status pills (hidden below lg) */}
          <div class="hidden items-center gap-2 lg:flex">
            <Pill label="status" value={status()} accent={status() !== "idle"} />
            <Pill label="tokens" value={total().toLocaleString()} />
            <Pill label="files" value={diff().length.toString()} />
          </div>

          {/* right: actions */}
          <div class="flex items-center gap-1">
            <Show when={!sessionID()}>
              <button
                type="button"
                class="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[11px] font-medium text-sky-300 transition-all duration-200 hover:bg-sky-400/20 disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-12-medium"
                onClick={ensureSession}
                disabled={!connected()}
              >
                <span class="sm:hidden">New</span>
                <span class="hidden sm:inline">New session</span>
              </button>
            </Show>
            <button
              type="button"
              class="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 transition-all duration-200 hover:bg-white/10 sm:px-3 sm:py-1.5 sm:text-12-medium"
              onClick={() => dialog.show(() => <DialogConnectProvider provider="github-copilot" />)}
            >
              {connected() ? "Reconnect" : "Connect"}
            </button>
            <button
              type="button"
              class="hidden rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-12-medium text-white/60 transition-all duration-200 hover:bg-white/10 md:block"
              onClick={() => navigate(`/${params.dir}/session/${sessionID() ?? ""}`)}
              disabled={!sessionID()}
            >
              Full session
            </button>
            {/* sidebar toggle desktop */}
            <button
              type="button"
              class="hidden h-8 w-8 place-items-center rounded-xl border border-white/8 bg-white/5 text-white/50 transition-all duration-200 hover:bg-white/10 lg:grid"
              onClick={() => setSidebar(!sidebar())}
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ─── main body ───────────────────── */}
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <Show when={tab() === "chat"}>
          {/* chat main panel */}
          <section class="flex min-h-0 flex-1 flex-col">
            {/* thread */}
            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div class="mx-auto max-w-3xl px-2 py-3 sm:px-6 sm:py-6">
                <Show
                  when={sessionID()}
                  fallback={
                    <Empty
                      title="No builder session"
                      copy="Create a session to start chatting."
                      action="Create session"
                      onAction={ensureSession}
                      disabled={!connected()}
                    />
                  }
                >
                  <Show
                    when={thread().length}
                    fallback={
                      <Empty title="Ready for prompts" copy="Type below to start. Messages stream in real time." />
                    }
                  >
                    <div class="flex flex-col gap-2 sm:gap-3">
                      <For each={thread()}>
                        {(item) => (
                          <div
                            classList={{
                              "group relative": true,
                              "ml-auto max-w-[85%] sm:max-w-[75%]": item.role === "user",
                              "max-w-[90%] sm:max-w-[80%]": item.role !== "user",
                            }}
                          >
                            <div
                              classList={{
                                "rounded-xl px-3 py-2 sm:rounded-2xl sm:px-4 sm:py-3 transition-all duration-200": true,
                                "bg-sky-500/15 border border-sky-400/20 text-white": item.role === "user",
                                "bg-white/[0.04] border border-white/6 text-white/80": item.role !== "user",
                              }}
                            >
                              <div class="flex items-center justify-between gap-1.5 mb-1">
                                <span
                                  classList={{
                                    "text-[9px] font-semibold uppercase tracking-[0.14em] sm:text-[10px]": true,
                                    "text-sky-300/70": item.role === "user",
                                    "text-white/30": item.role !== "user",
                                  }}
                                >
                                  {item.role}
                                </span>
                                <span class="text-[9px] text-white/20 sm:text-[10px]">{item.time}</span>
                              </div>
                              <div class="whitespace-pre-wrap break-words text-12-regular leading-[1.6] sm:text-13-regular sm:leading-[1.7]">
                                {item.body ||
                                  (item.busy ? (
                                    <span class="inline-flex items-center gap-1 text-white/40">
                                      <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                                      Working…
                                    </span>
                                  ) : (
                                    "No text content."
                                  ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>

            {/* floating composer */}
            <div class="shrink-0 border-t border-white/6 bg-[#0d1117]/95 px-2 py-2 backdrop-blur-lg sm:px-6 sm:py-4">
              <div class="mx-auto max-w-3xl">
                <div class="rounded-xl border border-white/8 bg-white/[0.03] p-2 transition-all duration-200 focus-within:border-sky-400/30 sm:rounded-2xl sm:p-3">
                  <textarea
                    class="w-full resize-none bg-transparent text-12-regular text-white/90 outline-none placeholder:text-white/25 sm:text-13-regular"
                    rows={1}
                    value={store.prompt}
                    onInput={(event) => setStore("prompt", event.currentTarget.value)}
                    placeholder="Make changes, ask for anything"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && promptReady()) {
                        event.preventDefault()
                        buildRun()
                      }
                    }}
                  />
                  <div class="mt-1.5 flex items-center justify-between gap-1.5 sm:mt-2 sm:gap-2">
                    <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {/* suggestion chips — hidden on very small screens */}
                      <Show when={!thread().length && sessionID()}>
                        <For each={["✨ AI", "Form", "UI"]}>
                          {(chip) => (
                            <button
                              type="button"
                              class="shrink-0 rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/50 transition-all sm:px-3 sm:py-1 sm:text-11-medium"
                              onClick={() => setStore("prompt", chip)}
                            >
                              {chip}
                            </button>
                          )}
                        </For>
                      </Show>
                    </div>
                    <div class="flex items-center gap-1 shrink-0 sm:gap-1.5">
                      {/* attach button */}
                      <button
                        type="button"
                        class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/40 transition-all duration-200 hover:bg-white/10 hover:text-white/80 sm:h-8 sm:w-8 sm:rounded-xl"
                        onClick={() => {
                          const val = store.prompt
                          setStore("prompt", val + (val.length > 0 && !val.endsWith(" ") ? " " : "") + "`~/`")
                        }}
                        title="Attach context data"
                      >
                        <svg
                          class="h-4 w-4 sm:h-4.5 sm:w-4.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                      {/* model selector — hidden on mobile to save space */}
                      <div class="hidden sm:block">
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
                      {/* send */}
                      <button
                        type="button"
                        class="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all duration-200 disabled:opacity-30 sm:h-8 sm:w-8 sm:rounded-xl"
                        classList={{
                          "bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.3)] hover:bg-sky-400":
                            promptReady() && !store.buildPending,
                          "bg-white/10 text-white/30": !promptReady() || store.buildPending,
                        }}
                        disabled={!connected() || !promptReady() || store.buildPending}
                        onClick={buildRun}
                      >
                        <svg
                          class="h-3.5 w-3.5 sm:h-4 sm:w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* sidebar (desktop only) */}
          <Show when={sidebar()}>
            <aside class="hidden w-80 shrink-0 border-l border-white/6 bg-[#0b0f17] lg:flex lg:flex-col xl:w-96">
              <div class="shrink-0 border-b border-white/6 px-4 py-3">
                <div class="flex items-center justify-between">
                  <div class="text-13-medium text-white/70">Builder state</div>
                  <div class="flex gap-1.5">
                    <Button
                      size="small"
                      variant="ghost"
                      onClick={() => (share() ? unpublish() : publish())}
                      disabled={!sessionID() || store.publishPending}
                    >
                      {store.publishPending ? "…" : share() ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="small"
                      variant="ghost"
                      onClick={deployRun}
                      disabled={store.deployPending || !store.environment || (!sessionID() && !releases()[0]?.id)}
                    >
                      {store.deployPending ? "…" : "Deploy"}
                    </Button>
                  </div>
                </div>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div class="flex flex-col gap-4">
                  {/* system instructions */}
                  <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                    <div class="text-12-medium text-white/60 mb-2">System Instructions</div>
                    <textarea
                      class="min-h-[100px] w-full resize-y rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-12-regular text-white/80 outline-none transition focus:border-sky-400/30 placeholder:text-white/20"
                      value={store.systemInstruction}
                      onInput={(e) => setStore("systemInstruction", e.currentTarget.value)}
                      placeholder="Insert customized agent persona directives here..."
                    />
                  </div>

                  {/* run settings */}
                  <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                    <div class="text-12-medium text-white/60 mb-3">Run Settings</div>
                    <div class="flex flex-col gap-3">
                      <div>
                        <div class="flex items-center justify-between mb-1.5">
                          <label class="text-11-medium text-white/40">Temperature</label>
                          <span class="text-11-medium text-white/70">{store.temperature.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.05"
                          class="w-full accent-sky-400"
                          value={store.temperature}
                          onInput={(e) => setStore("temperature", parseFloat(e.currentTarget.value))}
                        />
                      </div>
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="mb-1.5 block text-11-medium text-white/40">Top K</label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            class="w-full rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-12-regular text-white/80 outline-none transition focus:border-sky-400/30"
                            value={store.topK}
                            onInput={(e) => setStore("topK", parseInt(e.currentTarget.value, 10))}
                          />
                        </div>
                        <div>
                          <label class="mb-1.5 block text-11-medium text-white/40">Top P</label>
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            class="w-full rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-12-regular text-white/80 outline-none transition focus:border-sky-400/30"
                            value={store.topP}
                            onInput={(e) => setStore("topP", parseFloat(e.currentTarget.value))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* quick stats */}
                  <div class="grid grid-cols-2 gap-2">
                    <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
                      <div class="text-[10px] uppercase tracking-[0.14em] text-white/30">Preview</div>
                      <div class="mt-1 break-all text-12-medium text-white/70">{preview()?.url || "Off"}</div>
                    </div>
                    <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
                      <div class="text-[10px] uppercase tracking-[0.14em] text-white/30">Release</div>
                      <div class="mt-1 truncate text-12-medium text-white/70">{share() ? "Published" : "Draft"}</div>
                    </div>
                  </div>

                  {/* changed files */}
                  <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                    <div class="flex items-center justify-between">
                      <div class="text-12-medium text-white/60">Changed files</div>
                      <div class="text-11-regular text-white/30">{diff().length}</div>
                    </div>
                    <div class="mt-2 flex max-h-52 flex-col gap-1.5 overflow-y-auto">
                      <Show
                        when={diff().length}
                        fallback={<div class="text-11-regular text-white/25">No changes yet</div>}
                      >
                        <For each={diff().slice(0, 15)}>
                          {(item) => (
                            <div class="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-2 py-1.5">
                              <div class="min-w-0 truncate text-11-medium text-white/60">
                                {item.file.split("/").at(-1)}
                              </div>
                              <div class="shrink-0 text-[10px] text-white/25">
                                <span class="text-emerald-400/60">+{item.additions}</span>{" "}
                                <span class="text-red-400/60">-{item.deletions}</span>
                              </div>
                            </div>
                          )}
                        </For>
                      </Show>
                    </div>
                  </div>

                  {/* agent selector */}
                  <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                    <div class="text-12-medium text-white/60 mb-2">Agent</div>
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

                  {/* release history */}
                  <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                    <div class="text-12-medium text-white/60">Release history</div>
                    <ReleaseHistory
                      releases={releases()}
                      onRollback={rollbackRelease}
                      environments={environmentMap()}
                    />
                  </div>

                  {/* deploy history */}
                  <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                    <div class="text-12-medium text-white/60">Deploy history</div>
                    <DeployHistory deploys={deploys()} onRollback={rollbackDeploy} environments={environmentMap()} />
                  </div>
                </div>
              </div>
            </aside>
          </Show>
        </Show>

        {/* ─── preview tab ────────────────── */}
        <Show when={tab() === "preview"}>
          <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* preview surface */}
            <section class="flex min-h-0 flex-1 flex-col">
              <div class="shrink-0 border-b border-white/6 px-3 py-2.5 sm:px-5">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <div
                      class="h-2 w-2 shrink-0 rounded-full"
                      classList={{
                        "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]": String(preview()?.status) === "ready",
                        "bg-amber-400 animate-pulse": preview()?.status === "running",
                        "bg-white/15": !preview()?.status || preview()?.status === "idle",
                      }}
                    />
                    <div class="truncate text-12-medium text-white/60">{preview()?.url || "No preview"}</div>
                  </div>
                  <div class="flex gap-1.5">
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={store.previewPending}
                      onClick={preview()?.ptyID ? previewStop : previewStart}
                    >
                      {store.previewPending ? "…" : preview()?.ptyID ? "Stop" : "Start"}
                    </Button>
                    <Button
                      size="small"
                      variant="ghost"
                      disabled={!previewReady()}
                      onClick={() => preview()?.url && window.open(preview()!.url!, "_blank", "noopener,noreferrer")}
                    >
                      Open ↗
                    </Button>
                  </div>
                </div>
              </div>
              <div class="min-h-0 flex-1 overflow-hidden">
                <Show
                  when={preview()?.url}
                  fallback={
                    <Empty
                      title="No live preview"
                      copy="Start the preview process to render your app here."
                      action="Start preview"
                      onAction={previewStart}
                      disabled={store.previewPending}
                    />
                  }
                >
                  <iframe
                    title="builder-preview"
                    src={preview()?.url}
                    class="h-full min-h-0 w-full border-0 bg-white"
                  />
                </Show>
              </div>
            </section>

            {/* preview sidebar (desktop) */}
            <Show when={sidebar()}>
              <aside class="hidden w-80 shrink-0 border-l border-white/6 bg-[#0b0f17] lg:flex lg:flex-col xl:w-96">
                <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div class="flex flex-col gap-4">
                    {/* preview controls */}
                    <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                      <div class="text-12-medium text-white/60 mb-2">Preview controls</div>
                      <div class="grid gap-2">
                        <TextField
                          label="Command"
                          value={store.previewCommand}
                          onChange={(value) => setStore("previewCommand", value)}
                        />
                        <TextField
                          label="URL"
                          value={store.previewURL}
                          onChange={(value) => setStore("previewURL", value)}
                        />
                      </div>
                    </div>

                    {/* terminal */}
                    <div class="overflow-hidden rounded-xl border border-white/6 bg-white/3">
                      <div class="border-b border-white/6 px-3 py-2 text-12-medium text-white/60">Terminal</div>
                      <div class="h-64">
                        <Show
                          when={previewPty()}
                          fallback={
                            <div class="flex h-full items-center justify-center text-12-regular text-white/25">
                              No PTY attached
                            </div>
                          }
                        >
                          {(pty) => <Terminal pty={pty()} class="h-full" autoFocus={false} />}
                        </Show>
                      </div>
                    </div>

                    {/* release + deploy */}
                    <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                      <div class="text-12-medium text-white/60 mb-2">Release & Deploy</div>
                      <div class="flex flex-col gap-2">
                        <div class="rounded-lg bg-white/[0.02] px-2.5 py-2">
                          <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">Share URL</div>
                          <div class="mt-1 break-all text-12-medium text-white/60">{share() || "Unpublished"}</div>
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={!sessionID() || store.publishPending}
                            onClick={() => (share() ? unpublish() : publish())}
                          >
                            {store.publishPending ? "…" : share() ? "Unpublish" : "Publish"}
                          </Button>
                          <Button
                            size="small"
                            variant="ghost"
                            disabled={!share()}
                            onClick={() => share() && window.open(share(), "_blank", "noopener,noreferrer")}
                          >
                            Open ↗
                          </Button>
                        </div>
                        <Show when={environments().length}>
                          <div>
                            <div class="mb-1 text-[10px] uppercase tracking-[0.12em] text-white/30">Environment</div>
                            <EnvSelect
                              environments={environments()}
                              value={store.environment}
                              onChange={(id) => setStore("environment", id)}
                            />
                          </div>
                        </Show>
                        <div class="flex flex-wrap gap-1.5">
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={store.deployPending || !store.environment || (!sessionID() && !releases()[0]?.id)}
                            onClick={deployRun}
                          >
                            {store.deployPending ? "Deploying…" : "Deploy"}
                          </Button>
                          <Button
                            size="small"
                            variant="ghost"
                            disabled={!store.deployURL}
                            onClick={() =>
                              store.deployURL && window.open(store.deployURL, "_blank", "noopener,noreferrer")
                            }
                          >
                            Open ↗
                          </Button>
                        </div>
                        <Show when={store.deployURL}>
                          <div class="rounded-lg bg-white/[0.02] px-2.5 py-2 text-12-medium text-white/60">
                            {store.deployURL}
                          </div>
                        </Show>
                        <Show when={store.deployLogs.length}>
                          <div class="rounded-lg bg-white/[0.02] px-2.5 py-2">
                            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">Logs</div>
                            <div class="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-11-regular text-white/40">
                              {store.deployLogs.join("\n")}
                            </div>
                          </div>
                        </Show>
                      </div>
                    </div>

                    {/* annotations */}
                    <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                      <div class="text-12-medium text-white/60 mb-2">Annotations</div>
                      <div class="grid gap-2">
                        <TextField
                          label="File"
                          value={store.annotationFile}
                          onChange={(value) => setStore("annotationFile", value)}
                        />
                        <textarea
                          class="min-h-20 w-full rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-12-regular text-white/80 outline-none transition focus:border-sky-400/30 placeholder:text-white/20"
                          value={store.annotationNote}
                          onInput={(event) => setStore("annotationNote", event.currentTarget.value)}
                          placeholder="Describe what should change…"
                        />
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={addAnnotation}
                          disabled={!store.annotationFile.trim() || !store.annotationNote.trim()}
                        >
                          Save
                        </Button>
                      </div>
                      <div class="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                        <Show
                          when={annotations().length}
                          fallback={<div class="text-11-regular text-white/25">No annotations</div>}
                        >
                          <For each={annotations()}>
                            {(item) => (
                              <div class="rounded-lg bg-white/[0.02] px-2.5 py-2">
                                <div class="break-all text-11-medium text-white/60">{item.file}</div>
                                <div class="mt-0.5 whitespace-pre-wrap break-words text-11-regular text-white/40">
                                  {item.note}
                                </div>
                              </div>
                            )}
                          </For>
                        </Show>
                      </div>
                    </div>

                    {/* env state */}
                    <Show when={store.environment}>
                      <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                        <div class="text-12-medium text-white/60 mb-2">Environment state</div>
                        <EnvVarsSecrets vars={selectedEnv()?.vars ?? {}} secrets={secrets() ?? []} />
                      </div>
                    </Show>

                    {/* histories */}
                    <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                      <div class="text-12-medium text-white/60">Release history</div>
                      <ReleaseHistory
                        releases={releases()}
                        onRollback={rollbackRelease}
                        environments={environmentMap()}
                      />
                    </div>
                    <div class="rounded-xl border border-white/6 bg-white/3 px-3 py-3">
                      <div class="text-12-medium text-white/60">Deploy history</div>
                      <DeployHistory deploys={deploys()} onRollback={rollbackDeploy} environments={environmentMap()} />
                    </div>
                  </div>
                </div>
              </aside>
            </Show>
          </div>
        </Show>
      </div>

      {/* ─── bottom tab bar ──────────────── */}
      <nav class="z-20 shrink-0 border-t border-white/6 bg-[#0d1117]/95 backdrop-blur-lg safe-area-pb">
        <div class="mx-auto flex h-10 w-full items-center gap-0.5 px-2 sm:h-12 sm:max-w-md sm:gap-1 sm:px-3">
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/40 transition-colors hover:text-white/70"
            onClick={() => navigate(-1)}
          >
            <svg
              class="h-3.5 w-3.5 sm:h-4 sm:w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <For each={["chat", "preview"] as const}>
            {(item) => (
              <button
                type="button"
                classList={{
                  "flex-1 rounded-lg py-1.5 text-12-medium transition-all duration-200 sm:rounded-xl sm:py-2 sm:text-13-medium": true,
                  "bg-sky-500/15 text-sky-300": tab() === item,
                  "text-white/40 active:text-white/60": tab() !== item,
                }}
                onClick={() => setTab(item)}
              >
                {item === "chat" ? "Chat" : "Preview"}
              </button>
            )}
          </For>
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/40 transition-colors hover:text-white/70"
            onClick={() => setSidebar(!sidebar())}
          >
            <svg
              class="h-3.5 w-3.5 sm:h-4 sm:w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
              />
            </svg>
          </button>
        </div>
      </nav>
    </main>
  )
}
