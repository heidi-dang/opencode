import { createSignal, onMount, onCleanup, For } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import * as fs from "fs"
import * as path from "path"
import { useKeyboard } from "@opentui/solid"

export function Infinity() {
  const { theme } = useTheme()
  const { navigate } = useRoute()
  const [logs, setLogs] = createSignal<string[]>([])
  const [status, setStatus] = createSignal<string>("Idle")
  const [queue, setQueue] = createSignal<any[]>([])

  const root = process.cwd()
  const logPath = path.join(root, ".opencode", "infinity.log")
  const queuePath = path.join(root, ".opencode", "queue.json")

  const update = () => {
    try {
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, "utf-8")
        setLogs(content.split("\n").filter(Boolean).slice(-20).reverse())
      }
      if (fs.existsSync(queuePath)) {
        const q = JSON.parse(fs.readFileSync(queuePath, "utf-8"))
        if (Array.isArray(q)) setQueue(q)
      }
      const lastLine = logs()[0]
      if (lastLine) {
        const match = lastLine.match(/stage=(\w+)/)
        if (match) setStatus(match[1])
      }
    } catch (e) {}
  }

  onMount(() => {
    update()
    const interval = setInterval(update, 2000)
    onCleanup(() => clearInterval(interval))
  })

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      navigate({ type: "home" })
    }
  })

  return (
    <box flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
        <text fg={theme.primary}>Infinity Loop Monitor</text>
        <text fg={theme.text}>Status: {status()}</text>
      </box>

      <box flexDirection="row" gap={4} flexGrow={1}>
        <box width={30} flexShrink={0}>
          <text fg={theme.primary}>Queue</text>
          <box height={1} />
          <For each={queue()} fallback={<text fg={theme.textMuted}>Empty</text>}>
            {(task: any) => (
              <text fg={task.status === "in_progress" ? theme.primary : theme.text}>
                {task.status === "in_progress" ? ">" : " "} {task.title.slice(0, 25)}
              </text>
            )}
          </For>
        </box>

        <box flexGrow={1}>
          <text fg={theme.primary}>Logs</text>
          <box height={1} />
          <For each={logs()}>
            {(line) => (
              <text fg={theme.text}>{line.slice(0, 100)}</text>
            )}
          </For>
        </box>
      </box>

      <box height={1} />
      <text fg={theme.textMuted}>Press Esc to return</text>
    </box>
  )
}
