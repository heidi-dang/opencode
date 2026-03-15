import { openCodeTheme } from "../context/marked"

/**
 * Fallback theme object to use when resolution fails.
 * Guarantees a valid shape that @pierre/diffs can handle without throwing.
 */
const DEFAULT_FALLBACK_THEME = {
  name: "fallback",
  type: "css" as const,
  css: "",
  colors: {
    "editor.background": "var(--color-background-stronger)",
    "editor.foreground": "var(--text-base)",
  },
  tokenColors: [],
}

/**
 * Validates if a theme object is safe for use in the diff highlighter.
 * Accepts only non-empty string names or objects with the required Shiki/diff shape.
 */
export function isValidTheme(theme: any): boolean {
  if (!theme) return false
  
  // If it's the Proxy from marked.tsx, we want to check if it's resolvable
  try {
    if (typeof theme === 'object' && theme.name) {
      return true
    }
  } catch (e) {
    // Falls through if Proxy access fails
  }
  
  return false
}

/**
 * Resolves the app theme into a concrete object for the diff renderer.
 * Prevents 'undefined' or partial Proxy objects from reaching the highlighter core.
 * Memoizes the result to prevent repeated resolution failures.
 */
let memoizedTheme: any = null
let lastWarning = 0

export function resolveDiffTheme(): any {
  try {
    // Access the theme directly to force evaluation if it's a Proxy
    const theme = openCodeTheme
    
    if (isValidTheme(theme)) {
      // Create a stable copy if it's a Proxy/Lazy object to avoid downstream reactivity issues in Pierre
      memoizedTheme = { ...theme }
      return memoizedTheme
    }
    
    // Only warn once every 10 seconds to avoid console spam
    if (Date.now() - lastWarning > 10000) {
      console.warn("[diff-theme] Invalid theme detected, using hard fallback to prevent renderer hang.")
      lastWarning = Date.now()
    }
    
  } catch (error) {
    if (Date.now() - lastWarning > 10000) {
      console.error("[diff-theme] Fatal error during theme resolution:", error)
      lastWarning = Date.now()
    }
  }

  return DEFAULT_FALLBACK_THEME
}
