export function getDisplayVersion(): string {
  try {
    if (typeof process !== "undefined" && process?.env) {
      return (process.env.OPENCODE_VERSION || process.env.npm_package_version || "dev")
    }
  } catch {}

  try {
    // expose a global on the window if build injects it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = typeof window !== "undefined" ? (window as any) : undefined
    if (w?.__OPENCODE_VERSION__) return w.__OPENCODE_VERSION
  } catch {}

  return "dev"
}
