import { useParams } from "@solidjs/router"
import { createMemo, createResource } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { decode64 } from "@/utils/base64"

export function useBuilder() {
  const globalSDK = useGlobalSDK()
  const params = useParams()
  const dir = createMemo(() => decode64(params.dir) ?? "")
  const sdk = createMemo(() => (dir() ? globalSDK.createClient({ directory: dir(), throwOnError: true }) : undefined))

  const [data, actions] = createResource(dir, async (value) => {
    if (!value) return
    return sdk()!
      .builder.get(undefined, { throwOnError: true })
      .then((x) => x.data)
  })

  const [agents] = createResource(dir, async (value) => {
    if (!value) return []
    return sdk()!
      .app.agents(undefined, { throwOnError: true })
      .then((x) => (x.data ?? []).filter((item) => !item.hidden && item.mode !== "all"))
  })

  return {
    dir,
    sdk,
    data,
    agents,
    refetch: actions.refetch,
  }
}