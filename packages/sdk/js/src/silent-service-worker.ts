/**
 * Silent Service Worker
 * 
 * A service worker that intercepts requests and suppresses 404 errors
 * for session/provider endpoints to prevent browser console noise.
 * 
 * Usage:
 * ```javascript
 * import { registerSilentServiceWorker } from 'opencode/sdk'
 * 
 * if ('serviceWorker' in navigator) {
 *   registerSilentServiceWorker()
 *     .then(registration => {
 *       console.log('Silent service worker registered')
 *     })
 *     .catch(err => {
 *       console.warn('Failed to register service worker:', err)
 *     })
 * }
 * ```
 */

// Patterns that should have suppressed 404s
const SILENT_PATTERNS = [
  /\/session\//,
  /\/provider\//,
  /\/message\//,
]

/**
 * Check if a URL matches silent patterns
 */
function shouldSuppressError(url: string): boolean {
  return SILENT_PATTERNS.some(pattern => pattern.test(url))
}

/**
 * Service worker script content
 * This is injected as a string so it can be registered dynamically
 */
export const SERVICE_WORKER_SCRIPT = `
'use strict'

const SILENT_PATTERNS = [
  /\\/session\\//,
  /\\/provider\\//,
  /\\/message\\//,
]

function shouldSuppressError(url) {
  return SILENT_PATTERNS.some(pattern => pattern.test(url))
}

// Intercept fetch events
self.addEventListener('fetch', (event) => {
  const url = event.request.url
  
  // Only process non-GET requests or requests to our API
  if (!url.includes('/session/') && !url.includes('/provider/') && !url.includes('/message/')) {
    return
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If it's a 404 and we should suppress it, return a 200 with the error body
        if (response.status === 404 && shouldSuppressError(url)) {
          // Create a new response with 200 status but preserve the body
          return response.clone().text().then(body => {
            const headers = new Headers(response.headers)
            headers.set('X-Silent-404', 'true')
            
            return new Response(body, {
              status: 200,
              statusText: 'OK',
              headers: headers,
            })
          })
        }
        return response
      })
      .catch(error => {
        // For network errors, just pass them through
        throw error
      })
  )
})
`

/**
 * Register the silent service worker to suppress 404 console errors.
 * 
 * @param scope - Optional scope for the service worker
 * @returns Promise<ServiceWorkerRegistration | undefined>
 */
export async function registerSilentServiceWorker(
  scope?: string,
): Promise<ServiceWorkerRegistration | undefined> {
  // Only run in browser environment
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.debug('[SilentFetch] Service workers not supported in this environment')
    return undefined
  }

  try {
    // Create a blob URL for the service worker script
    const blob = new Blob([SERVICE_WORKER_SCRIPT], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)

    // Register with optional scope
    const registration = await navigator.serviceWorker.register(workerUrl, {
      scope: scope || '/',
      type: 'module',
    })

    console.debug('[SilentFetch] Service worker registered successfully')
    return registration
  } catch (error) {
    console.debug('[SilentFetch] Failed to register service worker:', error)
    return undefined
  }
}

/**
 * Unregister all silent service workers
 */
export async function unregisterSilentServiceWorkers(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const registrations = await navigator.serviceWorker.getRegistrations()
  for (const registration of registrations) {
    await registration.unregister()
  }
  console.debug('[SilentFetch] All service workers unregistered')
}

/**
 * Check if a silent service worker is active
 */
export async function isSilentServiceWorkerActive(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  const registrations = await navigator.serviceWorker.getRegistrations()
  return registrations.some(reg => reg.active?.scriptURL.includes('blob:'))
}
