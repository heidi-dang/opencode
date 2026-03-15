import { createResource, createSignal, For, onCleanup, onMount, Switch, Match, createMemo } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { Logo } from "@opencode-ai/ui/logo"
import { useParams } from "@solidjs/router"
import { decode64 } from "@/utils/base64"

export default function InfinityPage() {
  const globalSDK = useGlobalSDK()
  const params = useParams()
  const [status, setStatus] = createSignal("Idle")
  const [activeTab, setActiveTab] = createSignal("monitor")
  const directory = () => decode64(params.dir) || ""

  const fetchInfinityData = async () => {
    if (!directory()) return { logs: [], queue: [], report: null }
    try {
      const logRes = await globalSDK.client.file.read({ 
        path: ".opencode/infinity.log",
        directory: directory()
      })
      const queueRes = await globalSDK.client.file.read({ 
        path: ".opencode/queue.json",
        directory: directory()
      })
      const reportRes = await globalSDK.client.file.read({
        path: ".opencode/report.json",
        directory: directory()
      }).catch(() => ({}))
      
      const logContent = logRes.data?.content || ""
      const queueContent = queueRes.data?.content || "[]"
      const reportContent = (reportRes as any)?.data?.content
      
      const logs = logContent.split("\n").filter(Boolean).slice(-50).reverse()
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
        if (match) setStatus(match[1])
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
    { name: "Suggester", id: "suggester" },
    { name: "Planner", id: "planner" },
    { name: "Dev", id: "dev" },
    { name: "Havoc", id: "havoc" },
    { name: "Reporter", id: "reporter" },
    { name: "Librarian", id: "librarian" },
    { name: "Rearm", id: "rearm" }
  ]

  return (
    <div class="p-8 max-w-6xl mx-auto h-full overflow-auto">
      <div class="flex items-center justify-between mb-2">
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-3">
            <h1 class="text-28-bold text-text-strong">Infinity Loop</h1>
            <div class={`px-3 py-0.5 rounded-full text-12-medium uppercase tracking-wider ${status() !== 'idle' ? 'bg-primary-base/10 text-primary-base' : 'bg-surface-raised-base text-text-weak'}`}>
              {status()}
            </div>
          </div>
          <div class="text-14-regular text-text-weak truncate max-w-md">
            Monitoring: {directory()}
          </div>
        </div>
      </div>

      <div class="flex items-center gap-6 border-b border-border-base mb-8">
         <button 
           onClick={() => setActiveTab("monitor")}
           class={`pb-3 text-14-medium transition-colors relative ${activeTab() === 'monitor' ? 'text-primary-base' : 'text-text-weak hover:text-text-base'}`}
         >
           Monitor
           {activeTab() === 'monitor' && <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-base" />}
         </button>
         <button 
           onClick={() => setActiveTab("score")}
           class={`pb-3 text-14-medium transition-colors relative ${activeTab() === 'score' ? 'text-primary-base' : 'text-text-weak hover:text-text-base'}`}
         >
           Score Dashboard
           {activeTab() === 'score' && <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-base" />}
         </button>
      </div>

      <Switch>
        <Match when={activeTab() === 'monitor'}>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
            {/* Cycle Progress */}
            <div class="lg:col-span-4 flex flex-col gap-6">
              <div class="bg-surface-base border border-border-base rounded-xl p-6 shadow-sm">
                <h2 class="text-16-semibold text-text-strong mb-5">Autonomous Pipeline</h2>
                <div class="relative pl-4 border-l-2 border-border-weak-base space-y-6">
                  <For each={stages}>
                    {(stage) => {
                      const active = createMemo(() => status().toLowerCase() === stage.id)
                      return (
                        <div class="relative flex items-center gap-4">
                          <div class={`absolute -left-[25px] size-4 rounded-full border-2 border-surface-base transition-colors shadow-sm ${active() ? 'bg-primary-base scale-125' : 'bg-border-strong-base'}`} />
                          <div class={`flex-1 p-3 rounded-lg transition-all ${active() ? 'bg-primary-base/5 border border-primary-base/20' : 'opacity-60'}`}>
                            <div class={`text-14-medium ${active() ? 'text-primary-base' : 'text-text-base'}`}>{stage.name}</div>
                          </div>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </div>

              <div class="bg-surface-base border border-border-base rounded-xl p-6 shadow-sm">
                <h2 class="text-16-semibold text-text-strong mb-4">Task Queue</h2>
                <div class="space-y-2 max-h-[300px] overflow-auto pr-1">
                  <For each={data()?.queue} fallback={<div class="text-14-regular text-text-weak italic py-4 text-center">No active tasks</div>}>
                    {(task: any) => (
                      <div class="p-3 bg-surface-raised-base rounded-lg border border-border-weak-base flex flex-col gap-1">
                        <div class="text-13-medium text-text-strong truncate">{task.title}</div>
                        <div class="flex items-center gap-2">
                           <div class={`size-1.5 rounded-full ${task.status === 'in_progress' ? 'bg-primary-base animate-pulse' : 'bg-text-weak'}`} />
                           <span class="text-11-medium text-text-weak uppercase">{task.status}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>

            {/* Live Logs */}
            <div class="lg:col-span-8 bg-surface-base border border-border-base rounded-xl flex flex-col shadow-sm overflow-hidden min-h-[500px]">
              <div class="px-6 py-4 border-b border-border-base flex items-center justify-between bg-surface-raised-base/30">
                <h2 class="text-16-semibold text-text-strong">System Events</h2>
                <div class="text-11-medium text-text-weak uppercase tracking-widest">Live Stream</div>
              </div>
              <div class="flex-grow bg-background-base p-6 font-mono text-12-regular overflow-auto space-y-1.5 scrollbar-thin">
                <For each={data()?.logs} fallback={<div class="text-text-weak opacity-50">Waiting for logs...</div>}>
                  {(line) => {
                    const isError = line.toLowerCase().includes("error")
                    const isWarn = line.toLowerCase().includes("warn")
                    return (
                      <div class={`whitespace-pre-wrap leading-relaxed py-0.5 border-l-2 pl-3 transition-colors ${isError ? 'border-icon-critical-base text-icon-critical-base bg-icon-critical-base/5' : isWarn ? 'border-icon-warning-base text-icon-warning-base' : 'border-transparent text-text-base/80 hover:text-text-strong'}`}>
                        {line}
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </div>
        </Match>
        
        <Match when={activeTab() === 'score'}>
           <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4 duration-500">
             {/* Main Score Gauge */}
             <div class="md:col-span-2 lg:col-span-2 bg-surface-base border border-border-base rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-md relative overflow-hidden">
                <div class="absolute top-0 right-0 p-4 opacity-10">
                   <Logo class="w-32 h-auto" />
                </div>
                <div class="text-16-medium text-text-weak mb-2 uppercase tracking-widest">Application Health Score</div>
                <div class={`text-80-bold leading-none mb-4 ${data()?.report?.score >= 80 ? 'text-icon-success-base' : data()?.report?.score >= 50 ? 'text-icon-warning-base' : 'text-icon-critical-base'}`}>
                  {data()?.report?.score ?? 0}<span class="text-32-bold opacity-30">/100</span>
                </div>
                <div class="w-full h-2 bg-surface-raised-base rounded-full overflow-hidden mb-6 max-w-md">
                   <div 
                     class={`h-full transition-all duration-1000 ${data()?.report?.score >= 80 ? 'bg-icon-success-base' : data()?.report?.score >= 50 ? 'bg-icon-warning-base' : 'bg-icon-critical-base'}`}
                     style={{ width: `${data()?.report?.score ?? 0}%` }}
                   />
                </div>
                <div class="text-14-regular text-text-weak max-w-xs">
                  Derived from task success rates, CI verification, and sub-agent quality audits.
                </div>
             </div>

             {/* Metric Cards */}
             <div class="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="bg-surface-base border border-border-base rounded-xl p-6 flex flex-col gap-2 shadow-sm">
                   <div class="text-12-medium text-text-weak uppercase tracking-wider">Stability</div>
                   <div class="text-24-bold text-text-strong">{data()?.report?.metrics?.stability ?? 0}%</div>
                   <div class="w-full h-1 bg-surface-raised-base rounded-full overflow-hidden">
                      <div class="h-full bg-primary-base" style={{ width: `${data()?.report?.metrics?.stability ?? 0}%` }} />
                   </div>
                </div>
                <div class="bg-surface-base border border-border-base rounded-xl p-6 flex flex-col gap-2 shadow-sm">
                   <div class="text-12-medium text-text-weak uppercase tracking-wider">Performance</div>
                   <div class="text-24-bold text-text-strong">{data()?.report?.metrics?.performance ?? 0}%</div>
                   <div class="w-full h-1 bg-surface-raised-base rounded-full overflow-hidden">
                      <div class="h-full bg-icon-success-base" style={{ width: `${data()?.report?.metrics?.performance ?? 0}%` }} />
                   </div>
                </div>
                <div class="bg-surface-base border border-border-base rounded-xl p-6 flex flex-col gap-2 shadow-sm">
                   <div class="text-12-medium text-text-weak uppercase tracking-wider">Security</div>
                   <div class="text-24-bold text-text-strong">{data()?.report?.metrics?.security ?? 0}%</div>
                   <div class="w-full h-1 bg-surface-raised-base rounded-full overflow-hidden">
                      <div class="h-full bg-icon-critical-base" style={{ width: `${data()?.report?.metrics?.security ?? 0}%` }} />
                   </div>
                </div>
                <div class="bg-surface-base border border-border-base rounded-xl p-6 flex flex-col gap-2 shadow-sm">
                   <div class="text-12-medium text-text-weak uppercase tracking-wider">Coverage</div>
                   <div class="text-24-bold text-text-strong">{data()?.report?.metrics?.coverage ?? 0}%</div>
                   <div class="w-full h-1 bg-surface-raised-base rounded-full overflow-hidden">
                      <div class="h-full bg-icon-warning-base" style={{ width: `${data()?.report?.metrics?.coverage ?? 0}%` }} />
                   </div>
                </div>
             </div>

             {/* History Table */}
             <div class="md:col-span-2 lg:col-span-4 bg-surface-base border border-border-base rounded-xl shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-border-base">
                   <h2 class="text-16-semibold text-text-strong">Recent Audit History</h2>
                </div>
                <div class="overflow-x-auto">
                   <table class="w-full text-left bg-surface-base">
                      <thead>
                        <tr class="bg-surface-raised-base/50 text-11-medium text-text-weak uppercase tracking-wider">
                          <th class="px-6 py-3">Timestamp</th>
                          <th class="px-6 py-3">Task ID</th>
                          <th class="px-6 py-3 text-right">Impact</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border-base">
                        <For each={data()?.report?.history?.slice(0, 8)} fallback={
                          <tr>
                            <td colspan="3" class="px-6 py-8 text-center text-14-regular text-text-weak italic">No audit history available</td>
                          </tr>
                        }>
                          {(item) => (
                            <tr class="hover:bg-surface-raised-base/30 transition-colors">
                              <td class="px-6 py-4 text-13-regular text-text-base">{new Date(item.timestamp).toLocaleString()}</td>
                              <td class="px-6 py-4 text-13-medium text-text-strong">{item.task_id}</td>
                              <td class="px-6 py-4 text-right">
                                <span class={`px-2 py-0.5 rounded-full text-11-bold ${item.score === 100 ? 'bg-icon-success-base/10 text-icon-success-base' : 'bg-icon-critical-base/10 text-icon-critical-base'}`}>
                                  {item.score === 100 ? '+100' : '0'}
                                </span>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                   </table>
                </div>
             </div>
           </div>
        </Match>
      </Switch>
    </div>
  )
}
