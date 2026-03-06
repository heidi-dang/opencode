import { createResource } from "solid-js"
import { useGlobalSDK } from "./global-sdk"

export function useCopilotUsage() {
  const globalSDK = useGlobalSDK()
  return createResource(async () => {
    const res = await globalSDK.client.provider.copilot.usage()
    return res.data
  })
}
