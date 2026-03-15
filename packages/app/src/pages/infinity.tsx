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

  const [mobileTab, setMobileTab] = createSignal("dashboard")

  const stages = [
    { name: "Suggester", id: "suggester", icon: "magnifying-glass" },
    { name: "Planner", id: "planner", icon: "checklist" },
    { name: "Dev", id: "dev", icon: "code" },
    { name: "Havoc", id: "havoc", icon: "warning" },
    { name: "Reporter", id: "reporter", icon: "review" },
    { name: "Librarian", id: "librarian", icon: "archive" },
    { name: "Rearm", id: "rearm", icon: "reset" }
  ]

  const activeRun = createMemo(() => {
    const logs = data()?.logs || []
    let runId = null, taskId = null, stage = "None", message = "Waiting for tasks..."
    for (let i = logs.length - 1; i >= 0; i--) {
      const line = logs[i]
      if (line) {
         const stageMatch = line.match(/stage=(\w+)/)
         const runMatch = line.match(/run_id=([^\s]+)/)
         const taskMatch = line.match(/task_id=([^\s]+)/)
         
         if (stageMatch && stageMatch[1] !== "none") {
           stage = stageMatch[1]
           if (runMatch && runMatch[1] !== "none") runId = runMatch[1]
           if (taskMatch && taskMatch[1] !== "none") taskId = taskMatch[1]
           
           const msgMatch = line.match(/stage=\w+\s+(.*)/)
           if (msgMatch) message = msgMatch[1]
           break
         }
      }
    }
    return { runId, taskId, stage, message, active: stage !== "None" && status() !== "Idle" }
  })

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
               Live Stream
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

      {/* Mobile Tab Switcher */}
      <div class="lg:hidden flex items-center border-b border-border-weak-base shrink-0">
        <button
          onClick={() => setMobileTab("dashboard")}
          class={`flex-1 py-3 text-12-medium transition-colors border-b-2 ${
            mobileTab() === "dashboard" ? "border-primary-base text-text-strong" : "border-transparent text-text-weak hover:text-text-base"
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setMobileTab("logs")}
          class={`flex-1 py-3 text-12-medium transition-colors border-b-2 ${
            mobileTab() === "logs" ? "border-primary-base text-text-strong" : "border-transparent text-text-weak hover:text-text-base"
          }`}
        >
          Live Stream
        </button>
      </div>

      <div class="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left Column: Metrics, Pipeline, Queue */}
        <aside class={`w-full lg:w-[400px] shrink-0 border-r border-border-weak-base bg-surface-base flex-col p-4 lg:p-6 gap-6 lg:gap-8 overflow-y-auto no-scrollbar ${mobileTab() === 'dashboard' ? 'flex' : 'hidden lg:flex'}`}>
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
        <main class={`flex-1 min-w-0 flex-col bg-background-base overflow-hidden ${mobileTab() === 'logs' ? 'flex' : 'hidden lg:flex'}`}>
          <Switch>
            <Match when={activeTab() === 'monitor'}>
              <div class="flex-1 flex flex-col items-center justify-center p-6 lg:p-8 text-center animate-in fade-in duration-500 overflow-y-auto">
                 <Show when={activeRun().active} fallback={
                   <div class="flex flex-col items-center gap-4 opacity-40">
                     <Icon name="code" size="large" class="size-12 lg:size-16 mb-2" />
                     <div class="text-13-medium lg:text-14-medium text-text-weak">Infinity Loop is idle. Waiting for tasks...</div>
                   </div>
                 }>
                   <div class="bg-surface-raised-base border border-border-base rounded-2xl lg:rounded-3xl p-6 lg:p-10 max-w-xl w-full flex flex-col items-center shadow-lg relative overflow-hidden group">
                     <div class="absolute inset-0 bg-gradient-to-b from-primary-base/[0.03] to-transparent pointer-events-none" />
                     
                     <div class="size-16 lg:size-20 rounded-2xl bg-primary-base/10 text-primary-base flex items-center justify-center mb-6 lg:mb-8 shadow-inner-border">
                        <Icon name={stages.find(s => s.id === activeRun().stage)?.icon as any || "code"} class="size-8 lg:size-10" />
                     </div>
                     
                     <div class="text-11-bold lg:text-12-bold text-primary-base uppercase tracking-widest mb-3">{activeRun().stage} Stage</div>
                     <div class="text-16-semibold lg:text-20-semibold text-text-strong mb-3 lg:mb-4 px-4 leading-snug">{activeRun().message}</div>
                     
                     <div class="flex items-center gap-2 mb-8 lg:mb-10 px-3 py-1 bg-surface-base rounded-full border border-border-weak-base">
                        <div class="size-2 rounded-full bg-icon-success-base animate-pulse" />
                        <span class="text-11-medium text-text-weak">Task: {activeRun().taskId || "Unknown"}</span>
                     </div>
                     
                     <button 
                       onClick={() => project() && navigate(`/${base64Encode(project()!.worktree)}/session`)}
                       class="w-full sm:w-auto bg-primary-base text-white hover:bg-primary-hover px-6 lg:px-8 py-3 lg:py-4 rounded-xl lg:rounded-full text-13-semibold lg:text-14-semibold transition-all shadow-md shadow-primary-base/20 flex flex-row items-center justify-center gap-2 group-hover:-translate-y-0.5"
                     >
                       Real coding stuff
                       <Icon name="arrow-right" size="small" />
                     </button>
                   </div>
                 </Show>
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
