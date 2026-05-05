import { createSignal, onMount, For } from "solid-js"
import { CinemaSession, SessionData } from "@/components/cinema/session"

export default function MissionControl() {
  const [tasks, setTasks] = createSignal<{ id: string; objective: string; state: string; events?: any[] }[]>([])
  const [cinema, setCinema] = createSignal<SessionData | null>(null)

  onMount(async () => {
    // Basic setup for mission control state
  })

  const openCinema = (task: { id: string; objective: string; events?: any[] }) => {
    setCinema({
      id: task.id,
      events: task.events || [
        { id: "1", time: Date.now(), type: "step" as const, label: "Start" },
        { id: "2", time: Date.now(), type: "tool" as const, label: "Run tests" },
      ],
    })
  }

  return (
    <div class="h-full w-full bg-gradient-to-br from-slate-900 to-slate-800 text-white flex flex-col p-6 overflow-hidden">
      <header class="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
        <h1 class="text-2xl font-bold text-white">Heidi Mission Control</h1>
        <div class="flex gap-4">
          <button
            class="px-4 py-2 bg-blue-600/80 backdrop-blur-md rounded-md hover:bg-blue-700/90 transition-colors"
            onClick={() => {
              setTasks([
                ...tasks(),
                { id: `task-${tasks().length + 1}`, objective: "New task", state: "queued" },
              ])
            }}
          >
            New Task
          </button>
        </div>
      </header>

      <div class="flex-1 overflow-x-auto">
        <div class="flex gap-6 h-full min-w-max">
          <Column title="Queued" tasks={tasks().filter(t => t.state === "queued")} onCinema={openCinema} />
          <Column title="Planning" tasks={tasks().filter(t => t.state === "planning")} onCinema={openCinema} />
          <Column title="Running" tasks={tasks().filter(t => t.state === "running")} onCinema={openCinema} />
          <Column title="Verifying" tasks={tasks().filter(t => t.state === "verifying")} onCinema={openCinema} />
          <Column title="Done" tasks={tasks().filter(t => t.state === "done")} onCinema={openCinema} />
          <Column title="Blocked" tasks={tasks().filter(t => t.state === "blocked")} onCinema={openCinema} />
        </div>
      </div>

      {cinema() && (
        <CinemaSession
          session={cinema()!}
          onClose={() => setCinema(null)}
        />
      )}
    </div>
  )
}

function Column(props: {
  title: string
  tasks: any[]
  onCinema: (task: any) => void
}) {
  return (
    <div class="w-80 flex flex-col glass-card border-white/20">
      <div class="p-3 border-b border-white/10 font-semibold flex items-center justify-between">
        <span class="text-white">{props.title}</span>
        <span class="text-white/60 text-sm bg-white/10 px-2 py-0.5 rounded-full">
          {props.tasks.length}
        </span>
      </div>
      <div class="flex-1 p-3 overflow-y-auto flex flex-col gap-3">
        {props.tasks.length === 0 ? (
          <div class="text-sm text-white/40 text-center mt-4">No tasks</div>
        ) : (
          <For each={props.tasks}>
            {(task) => (
              <div class="glass-card p-3 rounded shadow-sm border-white/10">
                <div class="font-medium text-white text-sm mb-1">{task.id}</div>
                <div class="text-xs text-white/80">{task.objective}</div>
                <button
                  class="mt-2 text-xs text-blue-400 hover:underline"
                  onClick={() => props.onCinema(task)}
                >
                  ▶ Cinema
                </button>
              </div>
            )}
          </For>
        )}
      </div>
    </div>
  )
}
