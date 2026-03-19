export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"
import { createSilentFetch } from "./silent-fetch.js"
export { type SilentFetchConfig } from "./silent-fetch.js"
export type { Config as OpencodeClientConfig, OpencodeClient }

/**
 * Create an OpenCode client with optional silent error suppression.
 * 
 * @param config - Client configuration
 * @param options - Options for error suppression
 * 
 * @example
 * ```typescript
 * // Default behavior - suppress 404/410 for session/provider endpoints
 * const client = createOpencodeClient({ directory: "/path/to/project" })
 * 
 * // Custom suppression behavior
 * const client = createOpencodeClient({
 *   directory: "/path/to/project",
 * }, {
 *   suppressCodes: [404, 410, 500],
 *   enabled: true,
 * })
 * ```
 */
export function createOpencodeClient(
  config?: Config & { directory?: string },
  options?: {
    /** Enable silent error suppression for expected 404s (default: true) */
    silent?: boolean
    /** Custom silent fetch configuration */
    silentConfig?: {
      suppressCodes?: number[]
      urlPatterns?: RegExp[]
    }
  },
): OpencodeClient {
  const silent = options?.silent ?? true

  // Create base fetch function
  let fetchImpl: typeof globalThis.fetch
  if (config?.fetch) {
    fetchImpl = config.fetch as typeof globalThis.fetch
  } else {
    fetchImpl = globalThis.fetch
  }

  // Wrap with silent fetch if enabled
  if (silent) {
    fetchImpl = createSilentFetch(fetchImpl, {
      suppressCodes: options?.silentConfig?.suppressCodes ?? [404, 410],
      urlPatterns: options?.silentConfig?.urlPatterns ?? [
        /\/session\//,
        /\/provider\//,
        /\/message\//,
      ],
      enabled: true,
    })
  }

  // Create the underlying client with the fetch implementation
  const client = createClient({
    ...config,
    fetch: fetchImpl,
  } as Config)

  // Wrap in OpencodeClient to add SDK methods
  return new OpencodeClient({ client })
}
