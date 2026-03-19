import { Component, createSignal } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"

interface DialogEnvironmentProps {
  onDeploy: (credentials: {
    host: string
    port: number
    user: string
    password?: string
    path: string
    publicPort: number
  }) => Promise<void>
  defaultHost?: string
  defaultPath?: string
  defaultPublicPort?: number
}

export const DialogEnvironment: Component<DialogEnvironmentProps> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()

  const [host, setHost] = createSignal(props.defaultHost || "")
  const [port, setPort] = createSignal(22)
  const [user, setUser] = createSignal("root")
  const [password, setPassword] = createSignal("")
  const [path, setPath] = createSignal(props.defaultPath || "/var/www/html")
  const [publicPort, setPublicPort] = createSignal(props.defaultPublicPort || 8080)

  const [busy, setBusy] = createSignal(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!host() || !user()) return

    setBusy(true)
    try {
      await props.onDeploy({
        host: host(),
        port: port(),
        user: user(),
        password: password(),
        path: path(),
        publicPort: publicPort(),
      })
      dialog.close()
    } catch (err) {
      // Error is handled in the callback
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Configure Deployment Environment">
      <form onSubmit={handleSubmit} class="flex flex-col gap-4 p-4">
        <div class="grid grid-cols-2 gap-4">
          <TextField
            label="Host / IP"
            value={host()}
            onChange={setHost}
            placeholder="e.g. 203.0.113.0"
            required
            autoFocus
          />
          <TextField
            label="Port (SSH)"
            type="number"
            value={port().toString()}
            onChange={(v) => setPort(parseInt(v) || 22)}
            required
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <TextField
            label="SSH User"
            value={user()}
            onChange={setUser}
            required
          />
          <TextField
            label="SSH Password"
            type="password"
            value={password()}
            onChange={setPassword}
            placeholder="Leave empty if using key"
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <TextField
            label="Target Path"
            value={path()}
            onChange={setPath}
            required
            placeholder="/var/www/my-app"
          />
          <TextField
            label="Public Port"
            type="number"
            value={publicPort().toString()}
            onChange={(v) => setPublicPort(parseInt(v) || 8080)}
            required
          />
        </div>

        <div class="mt-2 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => dialog.close()} disabled={busy()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy() || !host() || !user()}>
            {busy() ? "Deploying..." : "Deploy"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
