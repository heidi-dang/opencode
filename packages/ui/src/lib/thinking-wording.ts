// Premium thinking copy pack for Heidi
// Goals:
// - humanized, lively, premium
// - no repetitive "Heidi is ..." on every line
// - sentence case only
// - phase-aware
// - safe abstractions only, never hidden reasoning
// - mobile-friendly lengths
// - deterministic fallback support

export type Phase =
  | "thinking"
  | "planning"
  | "editing"
  | "testing"
  | "focused"
  | "verifying"
  | "success"
  | "blocked"
  | "warning"
  | "idle"

export type ToneMode = "plain" | "friendly" | "fun"

export type ThinkingCopyPack = {
  title: string[]
  subtitle: string[]
  chips: string[]
}

const THINKING_TITLES = [
  "Mapping the problem",
  "Comparing possible fix paths",
  "Checking whether the patch really holds",
  "Looking for the cleanest next move",
  "Following the logic trail",
  "Tracing the root cause",
  "Weighing the trade-offs",
  "Connecting the pieces",
  "Building a working mental model",
  "Reading the shape of the issue",
  "Narrowing down the likely cause",
  "Sorting signal from noise",
]

const PLANNING_TITLES = [
  "Drafting the approach",
  "Sketching the implementation path",
  "Outlining the safest change set",
  "Deciding what to touch and what to leave alone",
  "Mapping dependencies",
  "Checking the blast radius",
  "Breaking the work into clean steps",
  "Lining up the next move",
]

const EDITING_TITLES = [
  "Preparing the patch",
  "Finalizing the cleanest edit path",
  "Writing the change",
  "Applying the fix",
  "Crafting the implementation",
  "Tightening the moving parts",
  "Shaping the patch",
  "Cleaning up the rough edges",
]

const TESTING_TITLES = [
  "Putting the fix on trial",
  "Running the truth check",
  "Checking whether this holds under pressure",
  "Looking for anything that still slips through",
  "Making sure the change behaves properly",
  "Pushing on the weak spots",
]

const FOCUSED_TITLES = [
  "Keeping eyes on the target",
  "Drilling into the detail",
  "Locking in the fix",
  "Zeroing in on the root",
  "Sharpening the approach",
]

const VERIFYING_TITLES = [
  "Validating the result",
  "Double-checking the evidence",
  "Making sure this does not come back later",
  "Checking if the fix is actually clean",
  "Reviewing the final proof",
  "Confirming the outcome",
]

const SUCCESS_TITLES = [
  "That landed cleanly",
  "The result looks solid",
  "This step is wrapped up",
  "The proof came back clean",
]

const BLOCKED_TITLES = [
  "Something needs a closer look",
  "A blocker showed up",
  "This path needs another pass",
  "The current route is not clean enough",
]

const WARNING_TITLES = [
  "Something needs attention",
  "Checking for trouble ahead",
  "Weighing a risky path",
  "Hedging against a problem",
]

const IDLE_TITLES = ["Ready for the next move", "Standing by", "Waiting for the next task"]

const THINKING_SUBTITLES = [
  "Tracing related files and linking the useful clues",
  "Reviewing the current evidence before committing to a path",
  "Scanning for side effects that could hide nearby",
  "Reading the surrounding context to avoid a shallow fix",
  "Linking the current issue to earlier work in the session",
  "Checking for hidden dependencies before moving forward",
  "Comparing signals from multiple code paths",
  "Looking for the smallest change that actually solves it",
]

const PLANNING_SUBTITLES = [
  "Laying out the sequence before touching anything important",
  "Checking which parts are safe to move and which should stay steady",
  "Keeping the change set focused and easy to verify",
  "Planning around dependencies, tests, and rollback points",
  "Choosing the cleanest route with the least mess",
]

const EDITING_SUBTITLES = [
  "Preparing the exact change before it lands",
  "Keeping the patch tight, readable, and easy to verify",
  "Applying the fix without disturbing unrelated paths",
  "Adjusting the moving parts with a clean handoff in mind",
  "Shaping the implementation so the next proof step is straightforward",
]

const TESTING_SUBTITLES = [
  "Pressing on the change to see whether it actually holds",
  "Checking edge cases before calling this stable",
  "Running proof checks instead of trusting the first result",
  "Trying to catch anything brittle before it escapes",
  "Testing the result where regressions usually hide",
]

const FOCUSED_SUBTITLES = [
  "Zeroing in on the exact problem spot",
  "Checking the critical path carefully",
  "Keeping attention locked on what matters most",
  "Following the tightest loop until it holds",
]

const VERIFYING_SUBTITLES = [
  "Reviewing the evidence one more time before sign-off",
  "Confirming the outcome matches the intended fix",
  "Checking the final state for loose ends",
  "Making sure the result is clean, not just lucky",
  "Verifying the patch and the proof agree with each other",
]

const SUCCESS_SUBTITLES = [
  "The latest check came back clean",
  "This step passed with solid evidence",
  "The result is consistent with the intended change",
  "Nothing suspicious showed up in the final pass",
]

const BLOCKED_SUBTITLES = [
  "The current evidence is not strong enough to move on yet",
  "A conflict, failure, or missing piece needs attention first",
  "This path needs another pass before it is safe to trust",
  "The result needs a cleaner route or better proof",
]

const WARNING_SUBTITLES = [
  "Weighing whether the risk is worth taking",
  "Looking for a safer path forward",
  "Checking whether this approach could cause trouble",
]

const IDLE_SUBTITLES = ["No active work is running right now", "Waiting for the next instruction or task update"]

const THINKING_CHIPS = [
  "State flow",
  "Dependency path",
  "Risk check",
  "Code path",
  "Edge cases",
  "Type safety",
  "Side effects",
  "Context scan",
  "Signal check",
  "Root cause",
]

const PLANNING_CHIPS = [
  "Change set",
  "Blast radius",
  "Dependencies",
  "Verification plan",
  "Rollback plan",
  "Task split",
  "Scope check",
  "Next move",
]

const EDITING_CHIPS = [
  "Patch prep",
  "Implementation",
  "Clean diff",
  "Code path",
  "Safe change",
  "Refine logic",
  "Touch points",
  "Consistency",
]

const TESTING_CHIPS = [
  "Truth check",
  "Edge cases",
  "Regression scan",
  "Test coverage",
  "Failure path",
  "Stress pass",
  "Output check",
  "Guard rails",
]

const FOCUSED_CHIPS = ["Target lock", "Critical path", "Depth check", "Root cause", "Fix precision", "Tight loop"]

const VERIFYING_CHIPS = [
  "Evidence",
  "Validation",
  "Final pass",
  "Proof check",
  "Consistency",
  "Result check",
  "Sign-off",
  "Clean finish",
]

const SUCCESS_CHIPS = ["Complete", "Verified", "Clean result"]

const BLOCKED_CHIPS = ["Blocked", "Needs review", "Retry path"]

const WARNING_CHIPS = ["Caution", "Risk check", "Hedge path"]

const IDLE_CHIPS = ["Ready"]

const COPY_BY_PHASE: Record<Phase, ThinkingCopyPack> = {
  thinking: { title: THINKING_TITLES, subtitle: THINKING_SUBTITLES, chips: THINKING_CHIPS },
  planning: { title: PLANNING_TITLES, subtitle: PLANNING_SUBTITLES, chips: PLANNING_CHIPS },
  editing: { title: EDITING_TITLES, subtitle: EDITING_SUBTITLES, chips: EDITING_CHIPS },
  testing: { title: TESTING_TITLES, subtitle: TESTING_SUBTITLES, chips: TESTING_CHIPS },
  focused: { title: FOCUSED_TITLES, subtitle: FOCUSED_SUBTITLES, chips: FOCUSED_CHIPS },
  verifying: { title: VERIFYING_TITLES, subtitle: VERIFYING_SUBTITLES, chips: VERIFYING_CHIPS },
  success: { title: SUCCESS_TITLES, subtitle: SUCCESS_SUBTITLES, chips: SUCCESS_CHIPS },
  blocked: { title: BLOCKED_TITLES, subtitle: BLOCKED_SUBTITLES, chips: BLOCKED_CHIPS },
  warning: { title: WARNING_TITLES, subtitle: WARNING_SUBTITLES, chips: WARNING_CHIPS },
  idle: { title: IDLE_TITLES, subtitle: IDLE_SUBTITLES, chips: IDLE_CHIPS },
}

function withTone(text: string, mode: ToneMode, phase: Phase, kind: "title" | "subtitle"): string {
  if (mode === "plain") return text
  if (mode === "friendly") {
    if (kind === "title") return `Heidi is ${text.charAt(0).toLowerCase()}${text.slice(1)}`
    return text
  }
  // fun
  if (kind === "title") {
    if (phase === "success" || phase === "blocked" || phase === "idle" || phase === "warning") return text
    return `Heidi is ${text.charAt(0).toLowerCase()}${text.slice(1)}`
  }
  switch (phase) {
    case "thinking":
      return `${text} Quietly connecting the dots.`
    case "planning":
      return `${text} Lining up a clean route before the next move.`
    case "editing":
      return `${text} Keeping the patch tight and tidy.`
    case "testing":
      return `${text} Giving the change a proper workout.`
    case "focused":
      return `${text} Keeping eyes on the prize.`
    case "verifying":
      return `${text} Making sure the evidence actually agrees.`
    case "success":
      return `${text} Nice and clean.`
    case "blocked":
      return `${text} Time for a cleaner path.`
    case "warning":
      return `${text} Proceeding with caution.`
    case "idle":
      return text
  }
}

function safeModulo(index: number, length: number): number {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

// Backward-compatible scene list accessor (used by theater signal rotation)
export function scenes(phase: Phase): string[] {
  return COPY_BY_PHASE[phase]?.title ?? THINKING_TITLES
}

// Backward-compatible subtext list accessor
export function subtexts(phase: Phase): string[] {
  return COPY_BY_PHASE[phase]?.subtitle ?? THINKING_SUBTITLES
}

// Deterministic chip selection
export function chipSet(phase: Phase, seed: number, max = 3): string[] {
  const items = [...(COPY_BY_PHASE[phase]?.chips ?? THINKING_CHIPS)]
  if (items.length <= max) return items
  const out: string[] = []
  let cursor = safeModulo(seed, items.length)
  while (out.length < max && items.length > 0) {
    const pick = items[cursor % items.length]
    out.push(pick)
    items.splice(cursor % items.length, 1)
    cursor += 2
  }
  return out
}

// Toned title at tick index
export function sceneAt(phase: Phase, tick: number, mode: ToneMode = "friendly"): string {
  const items = COPY_BY_PHASE[phase]?.title ?? THINKING_TITLES
  const text = items[safeModulo(tick, items.length)] ?? THINKING_TITLES[0]
  return withTone(text, mode, phase, "title")
}

// Toned subtext at tick index
export function subtextAt(phase: Phase, tick: number, mode: ToneMode = "friendly"): string {
  const items = COPY_BY_PHASE[phase]?.subtitle ?? THINKING_SUBTITLES
  const text = items[safeModulo(tick, items.length)] ?? THINKING_SUBTITLES[0]
  return withTone(text, mode, phase, "subtitle")
}

// Convenience bundle for the UI layer
export function thinkingState(input: {
  phase: Phase
  sceneTick: number
  subtextTick: number
  chipSeed: number
  tone?: ToneMode
  maxChips?: number
}) {
  const tone = input.tone ?? "friendly"
  return {
    title: sceneAt(input.phase, input.sceneTick, tone),
    subtitle: subtextAt(input.phase, input.subtextTick, tone),
    chips: chipSet(input.phase, input.chipSeed, input.maxChips ?? 3),
  }
}
