import type { ModelKey } from "@/context/local"
import type { Prompt, ContextItem } from "@/context/prompt"

export interface ModelSuggestion {
  key: ModelKey
  label: string
  reason: string
}

const PREMIUM_KEYWORDS = [
  "architect",
  "refactor",
  "complex",
  "structural",
  "deep dive",
  "audit",
  "security",
  "performance",
  "bottleneck",
  "migration",
]

const FAST_KEYWORDS = ["quick", "explain", "trivial", "simple", "summarize", "fix typo", "format"]

const MINIMAX_KEYWORDS = ["go", "economical", "efficient", "fastest", "zero cost"]

/**
 * Heuristically suggests a model based on the current prompt and context.
 * This version avoids hardcoding and relies on model capabilities/metadata.
 */
export function suggestModel(
  prompt: Prompt, 
  context: ContextItem[], 
  availableModels: any[]
): ModelSuggestion | null {
  const text = prompt
    .filter((p) => p.type === "text")
    .map((p) => p.content.toLowerCase())
    .join(" ")

  if (!text.trim() && context.length === 0) return null

  // 1. Analyze Task Requirements
  const isVisual = prompt.some((p) => p.type === "image") || /screenshot|ui|visual|look at/.test(text)
  const isPremium = PREMIUM_KEYWORDS.some((kw) => text.includes(kw)) || context.length > 5
  const isMinimaxTask = MINIMAX_KEYWORDS.some((kw) => text.includes(kw))
  const isFastTask = FAST_KEYWORDS.some((kw) => text.includes(kw)) || (text.length < 150 && context.length <= 1)

  // 2. Find Candidates dynamically
  const findModel = (predicate: (m: any) => boolean) => {
    return availableModels.find(predicate)
  }

  // REASONING / PREMIUM
  if (isPremium || isVisual) {
    const model = findModel(m => (m.reasoning || m.id.includes("pro") || m.id.includes("5.4")) && (isVisual ? m.modalities?.input?.includes("image") : true))
    if (model) {
      return {
        key: { providerID: model.provider.id, modelID: model.id },
        label: model.name,
        reason: isVisual ? `Best for visual analysis.` : `Recommended for complex reasoning.`,
      }
    }
  }

  // MINIMAX
  if (isMinimaxTask) {
    const model = findModel(m => m.id.toLowerCase().includes("minimax"))
    if (model) {
      return {
        key: { providerID: model.provider.id, modelID: model.id },
        label: model.name,
        reason: "Cost-efficient specialist for high-speed coding.",
      }
    }
  }

  // FLASH / FAST
  if (isFastTask || !isPremium) {
    const model = findModel(m => m.id.toLowerCase().includes("flash") || m.id.toLowerCase().includes("mini") || m.id.toLowerCase().includes("4o-mini"))
    if (model) {
      return {
        key: { providerID: model.provider.id, modelID: model.id },
        label: model.name,
        reason: "Fast and cost-effective for lightweight tasks.",
      }
    }
  }

  return null
}
