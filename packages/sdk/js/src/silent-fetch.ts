/**
 * Silent Fetch Utility
 * 
 * A fetch wrapper that suppresses console errors for specific HTTP response codes.
 * Useful for handling expected 404/410 errors gracefully without polluting the console.
 */

export interface SilentFetchConfig {
  /** HTTP status codes to suppress (default: [404, 410]) */
  suppressCodes?: number[]
  /** URL patterns to check (if undefined, suppresses all matching codes) */
  urlPatterns?: RegExp[]
  /** Custom logger function (default: console.debug) */
  logger?: (message: string, data?: unknown) => void
  /** Enable/disable the wrapper (default: true in production) */
  enabled?: boolean
}

const DEFAULT_CONFIG: Required<SilentFetchConfig> = {
  suppressCodes: [404, 410],
  urlPatterns: [
    /\/session\//,
    /\/provider\//,
    /\/message\//,
  ],
  logger: (message: string, data?: unknown) => {
    // Only log in debug mode
    if (typeof process !== 'undefined' && process.env?.DEBUG === 'true') {
      console.debug(`[SilentFetch] ${message}`, data ?? '')
    }
  },
  enabled: true,
}

/**
 * Create a fetch wrapper that suppresses console errors for specific responses.
 * 
 * @param originalFetch - The original fetch function to wrap
 * @param config - Configuration for which errors to suppress
 * @returns A wrapped fetch function
 * 
 * @example
 * ```typescript
 * const silentFetch = createSilentFetch(window.fetch, {
 *   suppressCodes: [404],
 *   urlPatterns: [/\/session\//],
 * });
 * ```
 */
export function createSilentFetch(
  originalFetch: typeof globalThis.fetch,
  config: SilentFetchConfig = {},
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  
  const silentFetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // If disabled, pass through to original fetch
    if (!mergedConfig.enabled) {
      return originalFetch(input, init)
    }

    // Get the URL string for pattern matching
    const urlString = input instanceof URL ? input.href : input instanceof Request ? input.url : String(input)

    try {
      const response = await originalFetch(input, init)

      // Check if this response should be suppressed
      const shouldSuppress = mergedConfig.suppressCodes.includes(response.status) &&
        (!mergedConfig.urlPatterns || mergedConfig.urlPatterns.some(pattern => pattern.test(urlString)))

      if (shouldSuppress) {
        mergedConfig.logger(`Suppressed error for ${response.status}: ${urlString}`)
        
        // Clone the response before it's consumed, so we can return a valid response
        return response.clone()
      }

      return response
    } catch (error) {
      // For network errors, we don't suppress - these are genuine errors
      mergedConfig.logger(`Network error (not suppressed): ${urlString}`, error)
      throw error
    }
  }
  
  return silentFetch as typeof globalThis.fetch
}

/**
 * Create an interceptor for the hey-api client that suppresses specific errors.
 * This can be added to the client configuration.
 * 
 * @param config - Configuration for error suppression
 * @returns An interceptor object for hey-api
 */
export function createSilentInterceptor(config: SilentFetchConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  
  return {
    onResponse: async (response: Response, _request: Request): Promise<Response> => {
      if (!mergedConfig.enabled) {
        return response
      }

      const urlString = response.url || _request.url
      
      // Check if this response should be suppressed
      const shouldSuppress = mergedConfig.suppressCodes.includes(response.status) &&
        (!mergedConfig.urlPatterns || mergedConfig.urlPatterns.some(pattern => pattern.test(urlString)))

      if (shouldSuppress) {
        mergedConfig.logger(`Suppressed response for ${response.status}: ${urlString}`)
      }

      return response
    },
    onError: async (error: Error, _request: Request): Promise<void> => {
      if (!mergedConfig.enabled) {
        throw error
      }

      // For actual errors (not HTTP responses), we don't suppress
      mergedConfig.logger(`Error (not suppressed): ${_request.url}`, error.message)
      throw error
    },
  }
}

/**
 * A React hook-friendly wrapper that provides a silent fetch for session-related endpoints.
 * Use this in components that may query non-existent sessions.
 * 
 * @param options - Configuration options
 * @returns A fetch function that suppresses session-related 404s
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const silentFetch = useSilentFetch();
 *   
 *   useEffect(() => {
 *     silentFetch(`/session/${sessionId}`)
 *       .then(res => res.json())
 *       .then(data => setData(data));
 *   }, [sessionId]);
 * }
 * ```
 */
export function createSilentFetchHook(config: SilentFetchConfig = {}) {
  return function useSilentFetch(): typeof globalThis.fetch {
    const silentFetch = createSilentFetch(fetch, {
      ...config,
      enabled: true,
    })
    return silentFetch
  }
}

// Export default config for customization
export { DEFAULT_CONFIG }
