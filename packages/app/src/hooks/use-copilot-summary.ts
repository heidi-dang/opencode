import type { ProviderSummaryResponse } from "@opencode-ai/sdk/v2/client"
import { useParams } from "@solidjs/router"
import { createMemo, createResource } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { decode64 } from "@/utils/base64"

export function useCopilotSummary() {
  const globalSDK = useGlobalSDK()
  const params = useParams()
  const dir = createMemo(() => decode64(params.dir) ?? "")
  const sdk = createMemo(() => (dir() ? globalSDK.createClient({ directory: dir(), throwOnError: true }) : undefined))

  const [data, actions] = createResource<ProviderSummaryResponse | undefined, string>(dir, async (value) => {
    if (!value) return
    return sdk()!
      .provider.summary({ providerID: "github-copilot" }, { throwOnError: true })
      .then((x) => x.data)
  })

  return {
    dir,
    sdk,
    data,
    refetch: actions.refetch,
  }
}