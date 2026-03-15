import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useParams } from "@solidjs/router"
import { decode64 } from "@/utils/base64"
import { Icon } from "@opencode-ai/ui/icon"

export function BrowserViewer() {
  const globalSDK = useGlobalSDK()
  const params = useParams()
  const directory = () => (params.dir ? decode64(params.dir) || "" : "")
  
  const [frame, setFrame] = createSignal<string>("")
  const [lastSessionId, setLastSessionId] = createSignal<string>("")

  onMount(() => {
    const dir = directory()
    
    // Listen to the directory-specific event bus
    const unsub = globalSDK.event.on(dir, (event) => {
      // @ts-ignore Since it's dynamically added it might be caught as any if TS server is out of sync
      if (event.type === "browser.frame") {
        // @ts-ignore
        setFrame(`data:image/jpeg;base64,${event.properties.data}`)
      }
    })

    // Fallback: listen globally just in case
    const unsubGlobal = globalSDK.event.on("global", (event) => {
      // @ts-ignore
      if (event.type === "browser.frame") {
        // @ts-ignore
        setFrame(`data:image/jpeg;base64,${event.properties.data}`)
      }
    })

    onCleanup(() => {
      unsub()
      unsubGlobal()
    })
  })

  return (
    <div class="w-full flex flex-col bg-surface-raised-base border border-border-weak-base rounded-2xl overflow-hidden shadow-sm relative group shrink-0 max-h-[400px]">
      <div class="h-8 lg:h-10 bg-surface-base border-b border-border-weak-base flex items-center justify-between px-3 lg:px-4 shrink-0">
         <div class="flex items-center gap-1.5 lg:gap-2">
            <Icon name="server" size="small" class="text-icon-weak" />
            <span class="text-11-semibold lg:text-12-semibold text-text-strong tracking-wide">Live Browser</span>
         </div>
         <Show when={frame()}>
           <div class="flex items-center gap-1.5 px-2 py-0.5 bg-primary-base/[0.08] rounded-full border border-primary-base/20">
              <div class="size-1.5 lg:size-2 rounded-full bg-primary-base animate-pulse shadow-[0_0_8px_rgba(var(--primary-base-rgb),0.8)]" />
              <span class="text-9-bold lg:text-10-bold text-primary-base uppercase tracking-widest">Live</span>
           </div>
         </Show>
      </div>
      
      <div class="flex-1 flex items-center justify-center bg-black/5 relative overflow-hidden p-2 lg:p-4 min-h-[200px]">
        <Show when={frame()} fallback={
           <div class="flex flex-col items-center justify-center text-text-weak opacity-40">
              <Icon name="server" size="large" class="mb-3 lg:mb-4 animate-pulse opacity-50" />
              <span class="text-11-medium lg:text-12-medium italic">Waiting for browser session...</span>
           </div>
        }>
          <div class="relative max-w-full max-h-full rounded-lg overflow-hidden shadow-md bg-white border border-border-weak-base">
            <img 
              src={frame()} 
              decoding="async"
              loading="eager"
              class="object-contain w-full h-full max-h-full" 
              alt="Browser Stream" 
            />
          </div>
        </Show>
      </div>
    </div>
  )
}
