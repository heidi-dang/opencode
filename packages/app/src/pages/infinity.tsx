import { createResource, createSignal, For, onCleanup, onMount, Switch, Match, createMemo, Show } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { Logo } from "@opencode-ai/ui/logo"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLayout } from "@/context/layout"
import { useParams, useNavigate } from "@solidjs/router"
import { decode64 } from "@/utils/base64"
import { base64Encode } from "@opencode-ai/util/encode"
import { getFilename } from "@opencode-ai/util/path"
import { BrowserViewer } from "@/components/browser/BrowserViewer"

export default function InfinityPage() {
  const globalSDK = useGlobalSDK()
  const layout = useLayout()
  const params = useParams()
  const navigate = useNavigate()
  onMount(() => {
    console.log("InfinityPage mounted", { params, directory: directory() })
  })
  const [status, setStatus] = createSignal("Idle")
  const [activeTab, setActiveTab] = createSignal("monitor")
  const directory = () => decode64(params.dir) || ""
  
  const project = createMemo(() => {
    const dir = directory()
    if (!dir) return
    return layout.projects.list().find((p) => p.worktree === dir || p.sandboxes?.includes(dir))
  })

  const projectName = createMemo(() => {
    const current = project()
    if (current) return current.name || getFilename(current.worktree)
    return getFilename(directory())
  })

  const fetchInfinityData = async () => {
    const dir = directory()
    if (!dir) return { logs: [], queue: [], report: null }
    try {
      const logRes = await globalSDK.client.file.read({ 
        path: ".opencode/infinity.log",
        directory: dir
      })
      const queueRes = await globalSDK.client.file.read({ 
        path: ".opencode/queue.json",
        directory: dir
      })
      const reportRes = await globalSDK.client.file.read({
        path: ".opencode/report.json",
        directory: dir
      }).catch(() => ({}))
      
      const logContent = logRes.data?.content || ""
      const queueContent = queueRes.data?.content || "[]"
      const reportContent = (reportRes as any)?.data?.content
      
      const logs = logContent.split("\n").filter(Boolean).slice(-100).reverse()
      let queue = []
      let report = null
      
      try {
        queue = JSON.parse(queueContent)
      } catch (e) {
        console.error("Failed to parse queue.json", e)
      }

      if (reportContent) {
        try {
          report = JSON.parse(reportContent)
        } catch (e) {
          console.error("Failed to parse report.json", e)
        }
      }
      
      const lastLine = logs[0]
      if (lastLine) {
        const match = lastLine.match(/stage=(\w+)/)
        if (match) {
          const s = match[1].toLowerCase()
          setStatus(s === "none" ? "Idle" : s)
        }
      }
      
      return { logs, queue, report }
    } catch (e) {
      console.error("Failed to fetch infinity data", e)
      return { logs: [], queue: [], report: null }
    }
  }

  const [data, { refetch }] = createResource(fetchInfinityData)

  onMount(() => {
    const interval = setInterval(refetch, 3000)
    onCleanup(() => clearInterval(interval))
  })

  const stages = [
    { name: "Suggester", id: "suggester", icon: "magnifying-glass" },
    { name: "Planner", id: "planner", icon: "checklist" },
    { name: "Dev", id: "dev", icon: "code" },
    { name: "Havoc", id: "havoc", icon: "warning" },
    { name: "Reporter", id: "reporter", icon: "review" },
    { name: "Librarian", id: "librarian", icon: "archive" },
    { name: "Rearm", id: "rearm", icon: "reset" }
  ]

  return (
    <div class="h-full flex flex-col bg-background-base overflow-hidden">
      {/* Session Header Emulation */}
      <header class="h-14 lg:h-14 shrink-0 border-b border-border-weak-base bg-background-base flex items-center justify-between px-4 lg:px-6 z-10 shadow-sm overflow-x-auto no-scrollbar">
        <div class="flex items-center gap-2 lg:gap-3 min-w-0">
          <div class="flex items-center gap-1.5 lg:gap-2 text-12-medium lg:text-13-medium text-text-weak truncate mr-1 lg:mr-2">
            <Icon name="folder" size="small" class="opacity-70 shrink-0" />
            <span 
              class="hover:text-text-base cursor-pointer transition-colors shrink-0 hidden sm:inline"
              onClick={() => navigate("/")}
            >
              Projects
            </span>
            <Icon name="chevron-right" size="small" class="opacity-30 shrink-0 hidden sm:inline" />
            <span 
              class="text-text-strong truncate hover:text-primary-base cursor-pointer transition-colors"
              onClick={() => project() && navigate(`/${base64Encode(project()!.worktree)}/session`)}
            >
              {projectName()}
            </span>
          </div>
          
          <div class="h-4 w-px bg-border-weak-base mx-0.5 lg:mx-1 shrink-0" />
          
          <div class="flex items-center gap-2 lg:gap-3 px-2 lg:px-3 py-0.5 lg:py-1 bg-surface-raised-base rounded-full shadow-inner-border shrink-0">
            <div class="size-1.5 lg:size-2 rounded-full bg-primary-base animate-pulse shadow-[0_0_8px_rgba(var(--primary-base-rgb),0.6)]" />
            <span class="text-10-bold lg:text-11-bold text-text-strong uppercase tracking-widest">{status()}</span>
          </div>
        </div>

        <div class="flex items-center gap-2 lg:gap-6 shrink-0 ml-4">
          <nav class="flex items-center gap-1">
             <button 
               onClick={() => setActiveTab("monitor")}
               class={`px-2 lg:px-4 py-1.5 rounded-md text-12-medium lg:text-13-medium transition-all ${activeTab() === 'monitor' ? 'bg-surface-base text-text-strong shadow-xs-border-strong' : 'text-text-weak hover:text-text-base hover:bg-surface-raised-base'}`}
             >
               Monitor
             </button>
             <button 
               onClick={() => setActiveTab("score")}
               class={`px-2 lg:px-4 py-1.5 rounded-md text-12-medium lg:text-13-medium transition-all ${activeTab() === 'score' ? 'bg-surface-base text-text-strong shadow-xs-border-strong' : 'text-text-weak hover:text-text-base hover:bg-surface-raised-base'}`}
             >
               Score Dashboard
             </button>
          </nav>
          
          <div class="h-6 w-px bg-border-weak-base mx-1 lg:mx-2 hidden sm:block" />
          
          <div class="hidden sm:flex items-center gap-1 lg:gap-2">
            <IconButton icon="settings-gear" variant="ghost" size="normal" class="text-icon-weak hover:text-icon-base" />
            <IconButton icon="help" variant="ghost" size="normal" class="text-icon-weak hover:text-icon-base" />
          </div>
        </div>
      </header>

      <div class="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left Column: Metrics, Pipeline, Queue */}
        <aside class="w-full lg:w-[400px] shrink-0 border-r border-border-weak-base bg-surface-base flex flex-col p-4 lg:p-6 gap-6 lg:gap-8 overflow-y-auto no-scrollbar">
          <BrowserViewer />
          
          <section>
            <h2 class="text-11-bold lg:text-12-bold text-text-strong uppercase tracking-widest mb-4">Autonomous Pipeline</h2>
            <div class="grid grid-cols-1 gap-3 lg:gap-4">
              <For each={stages}>
                {(stage) => {
                  const active = createMemo(() => status().toLowerCase() === stage.id)
                  return (
                    <div class={`flex items-center gap-2 lg:gap-4 group p-2 rounded-xl transition-all ${active() ? 'bg-primary-base/[0.03]' : ''}`}>
                      <div class={`size-8 lg:size-10 rounded-lg lg:rounded-xl flex items-center justify-center transition-all ${
                        active() ? 'bg-primary-base text-white shadow-lg shadow-primary-base/20 scale-105 lg:scale-110' : 'bg-surface-raised-base text-icon-weak'
                      }`}>
                        <Icon name={stage.icon as any} size="normal" />
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class={`text-11-medium lg:text-13-medium transition-colors truncate ${active() ? 'text-primary-base' : 'text-text-base'}`}>{stage.name}</div>
                        <Show when={active()}>
                          <div class="text-10-regular text-primary-base opacity-70 hidden lg:block">Processing...</div>
                        </Show>
                      </div>
                      <Show when={active()}>
                         <div class="size-1.5 lg:size-2 rounded-full bg-primary-base animate-ping shrink-0" />
                      </Show>
                    </div>
                  )
                }}
              </For>
            </div>
          </section>

          <div class="h-px bg-border-weak-base opacity-50" />

          <section class="flex-grow flex flex-col min-h-0">
             <div class="flex items-center justify-between mb-4">
               <h2 class="text-11-bold lg:text-12-bold text-text-strong uppercase tracking-widest">Task Queue</h2>
               <div class="px-1.5 py-0.5 bg-surface-raised-base rounded-md text-10-bold lg:text-11-bold text-text-weak">{data()?.queue?.length ?? 0}</div>
             </div>
             
             <div class="space-y-2 lg:space-y-3 pr-1 lg:pr-2">
                <For each={data()?.queue} fallback={
                  <div class="flex flex-col items-center justify-center py-6 lg:py-12 text-center opacity-30 grayscale grayscale-100">
                    <Icon name="checklist" size="large" class="mb-2" />
                    <div class="text-11-medium lg:text-12-medium text-text-weak italic">Queue is empty</div>
                  </div>
                }>
                  {(task: any) => (
                    <div class="p-3 lg:p-4 bg-surface-raised-base border border-border-weak-base rounded-xl lg:rounded-2xl flex flex-col gap-2 lg:gap-3 group hover:border-border-base transition-colors shadow-sm">
                      <div class="text-12-semibold lg:text-13-semibold text-text-strong line-clamp-2 leading-relaxed">
                        {task.title}
                      </div>
                      <div class="flex items-center justify-between mt-0.5 lg:mt-1">
                        <div class="flex items-center gap-1.5 lg:gap-2">
                           <div class={`size-1.5 lg:size-2 rounded-full ${task.status === 'in_progress' ? 'bg-primary-base animate-pulse shadow-[0_0_4px_rgba(var(--primary-base-rgb),0.5)]' : 'bg-text-weak'}`} />
                           <span class={`text-9-bold lg:text-10-bold uppercase tracking-widest ${task.status === 'in_progress' ? 'text-primary-base' : 'text-text-weak'}`}>{task.status.replace('_', ' ')}</span>
                        </div>
                        <div class="text-9-medium lg:text-10-medium text-text-weak opacity-0 group-hover:opacity-100 transition-opacity">ID: {task.id?.slice(-4)}</div>
                      </div>
                    </div>
                  )}
                </For>
             </div>
          </section>
        </aside>

        {/* Right Column: Monitors / Reports */}
        <main class="flex-1 min-w-0 flex flex-col bg-background-base overflow-hidden">
          <Switch>
            <Match when={activeTab() === 'monitor'}>
              <div class="flex-1 flex flex-col overflow-hidden">
                <div class="px-6 py-4 border-b border-border-base flex items-center justify-between bg-surface-raised-base/30">
                  <h2 class="text-14-bold text-text-strong uppercase tracking-widest flex items-center gap-2">
                    <div class="size-1.5 bg-icon-success-base rounded-full" />
                    System Events
                  </h2>
                  <div class="text-11-medium text-text-weak uppercase tracking-widest">Live Stream</div>
                </div>
                <div class="flex-1 overflow-y-auto p-4 lg:p-6 pt-2 font-mono text-12-regular lg:text-13-regular space-y-2 selection:bg-primary-base/20 scrollbar-thin">
                  <For each={data()?.logs} fallback={<div class="flex flex-col items-center justify-center h-full gap-4 text-text-weak opacity-40 italic">
                    <Spinner class="size-8" />
                    Connecting to infinity stream...
                  </div>}>
                    {(line) => {
                      const isError = line.toLowerCase().includes("error")
                      const isWarn = line.toLowerCase().includes("warn")
                      const isInfo = line.toLowerCase().includes("info")
                      return (
                        <div class="group flex gap-4 pr-12 hover:bg-surface-raised-base/30 rounded-lg p-1 transition-colors">
                          <div class="shrink-0 text-text-weak opacity-30 select-none text-10-regular pt-1">
                            {new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div class={`whitespace-pre-wrap leading-relaxed border-l-2 pl-4 transition-colors ${
                            isError ? 'border-icon-critical-base text-icon-critical-base bg-icon-critical-base/5 rounded-r-md' : 
                            isWarn ? 'border-icon-warning-base text-icon-warning-base' : 
                            isInfo ? 'border-primary-base/40 text-text-base' :
                            'border-transparent text-text-base/80 hover:text-text-strong'
                          }`}>
                            {line}
                          </div>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Match>
            
            <Match when={activeTab() === 'score'}>
              <div class="flex-1 overflow-y-auto p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div class="max-w-4xl mx-auto space-y-12">
                   {/* Main Score Hero */}
                   <div class="bg-surface-base border border-border-base rounded-3xl p-12 flex flex-col items-center text-center shadow-md relative overflow-hidden group">
                      <div class="absolute inset-0 bg-gradient-to-br from-primary-base/[0.02] to-transparent pointer-events-none" />
                      <div class="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                         <Logo class="w-48 h-auto" />
                      </div>
                      <h3 class="text-14-bold text-primary-base uppercase tracking-[0.2em] mb-4">Autonomous Intelligence Report</h3>
                      <div class={`text-120-bold leading-none mb-6 font-display ${data()?.report?.score >= 80 ? 'text-icon-success-base' : data()?.report?.score >= 50 ? 'text-icon-warning-base' : 'text-icon-critical-base'}`}>
                        {data()?.report?.score ?? 0}<span class="text-40-medium opacity-20 italic">/100</span>
                      </div>
                      <div class="w-full max-w-lg h-3 bg-surface-raised-base rounded-full overflow-hidden mb-8 shadow-inner">
                         <div 
                           class={`h-full transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(var(--color-rgb),0.5)] ${data()?.report?.score >= 80 ? 'bg-icon-success-base' : data()?.report?.score >= 50 ? 'bg-icon-warning-base' : 'bg-icon-critical-base'}`}
                           style={{ width: `${data()?.report?.score ?? 0}%`, '--color-rgb': data()?.report?.score >= 80 ? '34, 197, 94' : '234, 179, 8' }}
                         />
                      </div>
                      <p class="text-16-regular text-text-weak max-w-lg">
                        This score reflects the collective verification results of the Suggester, Planner, and Reporter agents across all active innovation branches.
                      </p>
                   </div>

                   {/* Sub-metrics */}
                   <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <For each={[
                        { label: 'Stability', value: data()?.report?.metrics?.stability, color: 'text-primary-base' },
                        { label: 'Performance', value: data()?.report?.metrics?.performance, color: 'text-icon-success-base' },
                        { label: 'Security', value: data()?.report?.metrics?.security, color: 'text-icon-critical-base' },
                        { label: 'Coverage', value: data()?.report?.metrics?.coverage, color: 'text-icon-warning-base' }
                      ]}>
                        {(metric) => (
                          <div class="bg-surface-base border border-border-base rounded-2xl p-6 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
                             <div class="text-11-bold text-text-weak uppercase tracking-widest mb-3">{metric.label}</div>
                             <div class={`text-32-bold ${metric.color} mb-4`}>{metric.value ?? 0}%</div>
                             <div class="w-full h-1.5 bg-surface-raised-base rounded-full overflow-hidden">
                                <div class={`h-full ${metric.color.replace('text-', 'bg-')}`} style={{ width: `${metric.value ?? 0}%` }} />
                             </div>
                          </div>
                        )}
                      </For>
                   </div>
                </div>
              </div>
            </Match>
          </Switch>
        </main>
      </div>
    </div>
  )
}
