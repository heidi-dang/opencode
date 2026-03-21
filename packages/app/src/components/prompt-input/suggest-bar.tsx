import { Component, Show, createMemo } from "solid-js"
import { usePrompt } from "@/context/prompt"
import { useLocal } from "@/context/local"
import { useModels } from "@/context/models"
import { suggestModel } from "@/utils/suggest"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"

export const SuggestBar: Component = () => {
  const prompt = usePrompt()
  const local = useLocal()
  const models = useModels()

  const currentSuggestion = createMemo(() => {
    const currentPrompt = prompt.current()
    const currentContext = prompt.context.items()
    const available = models.list()
    const suggestion = suggestModel(currentPrompt, currentContext, available)

    // Only suggest if it's different from the CURRENTLY selected model
    const currentModel = local.model.current()
    if (!suggestion || (currentModel?.provider.id === suggestion.key.providerID && currentModel?.id === suggestion.key.modelID)) {
      return null
    }

    return suggestion
  })

  const applySuggestion = () => {
    const suggestion = currentSuggestion()
    if (!suggestion) return
    local.model.set(suggestion.key)
  }

  return (
    <Show when={currentSuggestion()}>
      {(suggestion: ModelSuggestion) => (
        <div class="px-3 py-1.5 flex items-center gap-2 bg-surface-raised-stronger border-b border-white/5 animate-in fade-in slide-in-from-bottom-1 duration-200">
          <div class="flex items-center gap-1.5 text-12-medium text-text-weak shrink-0">
            <Icon name="models" size="small" class="text-icon-info-base" />
            <span>AI Suggestion:</span>
          </div>
          <Button
            variant="ghost"
            size="small"
            class="h-6 px-2 text-12-medium text-text-strong hover:bg-white/5 border border-white/10 shrink-0"
            onClick={applySuggestion}
          >
            Switch to {suggestion.label}
          </Button>
          <span class="truncate text-11-regular text-text-weak opacity-60">
            {suggestion.reason}
          </span>
        </div>
      )}
    </Show>
  )
}
