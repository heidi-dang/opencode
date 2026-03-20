// Thinking scenes — humanized abstractions of what Heidi is working on
// These rotate every ~5s to show forward motion

export const THINKING_SCENES = [
  "Heidi is mapping the problem",
  "Heidi is Comparing possible fix paths",
  "Heidi is Checking whether the patch actually holds",
  "Heidi is Looking for the cleanest next move",
  "Heidi is Following the logic trail",
  "Heidi is Tracing the root cause",
  "Heidi is Weighing the trade-offs",
  "Heidi is Connecting the pieces",
  "Heidi is Building a mental model",
]

export const PLANNING_SCENES = [
  "Heidi is Drafting the approach",
  "Heidi is Sketching the implementation path",
  "Heidi is Outlining the safest change set",
  "Heidi is Deciding what to touch and what to leave",
  "Heidi is Mapping dependencies",
  "Heidi is Checking the blast radius",
]

export const EDITING_SCENES = [
  "Heidi is Preparing the patch",
  "Heidi is Finalizing the cleanest edit path",
  "Heidi is Writing the change",
  "Heidi is Applying the fix",
  "Heidi is Crafting the implementation",
]

export const VERIFYING_SCENES = [
  "Heidi is Running the truth check",
  "Heidi is Making sure this doesn't come back later",
  "Heidi is Checking if the fix is actually clean",
  "Heidi is Validating the result",
  "Heidi is Double-checking the evidence",
]

// Subtexts — cycle every 3-4s beneath the main scene
export const SUBTEXTS = [
  "Heidi is Tracing related files",
  "Heidi is Cross-checking assumptions",
  "Heidi is Reviewing the current evidence",
  "Heidi is Preparing the next action",
  "Heidi is Scanning for side effects",
  "Heidi is Reading the surrounding context",
  "Heidi is Linking to previous work",
  "Heidi is Checking for hidden dependencies",
]

// Thought chips — short concept pills that pop in and dissolve
export const THOUGHT_CHIPS = [
  "State flow",
  "Dependency path",
  "Risk check",
  "Verification plan",
  "Edge cases",
  "Type safety",
  "Test coverage",
  "Code path",
  "Side effects",
  "Rollback plan",
]

export type Phase = "thinking" | "planning" | "editing" | "testing" | "verifying" | "success" | "blocked" | "idle"

export function scenes(phase: Phase) {
  if (phase === "planning") return PLANNING_SCENES
  if (phase === "editing") return EDITING_SCENES
  if (phase === "verifying" || phase === "testing") return VERIFYING_SCENES
  return THINKING_SCENES
}
