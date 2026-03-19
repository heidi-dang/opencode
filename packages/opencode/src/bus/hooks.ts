import { Bus } from "./index"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { SessionPrompt } from "../session/prompt"
import { Log } from "../util/log"
import { MessageID, PartID } from "../session/schema"

export namespace HookManager {
  const log = Log.create({ service: "hooks" })

  export function start() {
    log.info("Starting Event-Driven Hooks Manager")
    
    Bus.subscribeAll(async (event) => {
      try {
        const sessionGen = Session.list({ limit: 1 })
        const latestSessionResult = sessionGen.next()
        const latestSession = latestSessionResult.value
        
        if (!latestSession) return

        let hookMessage = ""
        
        // Hook: onBuildFail (Terminal/Pty process exited with error)
        if (event.type === "pty.exited") {
          const exitCode = event.properties?.exitCode
          if (exitCode !== undefined && exitCode !== 0) {
            hookMessage = `[Hook: onBuildFail] A background terminal process just exited with error code ${exitCode}. Please investigate the workspace for broken builds or failing tests.`
          }
        }
        
        // We can add more hooks here like "file.edited" if we want Heidi to review user saves
        // if (event.type === "file.edited") ...

        if (hookMessage) {
          log.info(`Triggering hook for session ${latestSession.id}: ${event.type}`)
          
          const { Config } = await import("../config/config")
          const cfg = await Config.get()
          const [providerID, modelID] = (cfg.model || "anthropic:claude-3-7-sonnet-latest").split(":")

          const msgId = MessageID.ascending()
          
          await Session.updateMessage({
            id: msgId,
            sessionID: latestSession.id,
            role: "user",
            agent: "heidi",
            model: {
              providerID: providerID as any,
              modelID: modelID as any,
            },
            time: { created: Date.now() }
          })

          await Session.updatePart({
            id: PartID.ascending(),
            messageID: msgId,
            sessionID: latestSession.id,
            type: "text",
            text: hookMessage,
            time: { start: Date.now(), end: Date.now() }
          })
          
          // Trigger the AI loop to respond to the hook
          await SessionPrompt.loop({ sessionID: latestSession.id })
        }
      } catch (err) {
        log.error("Failed to process event hook", err as any)
      }
    })
  }
}
