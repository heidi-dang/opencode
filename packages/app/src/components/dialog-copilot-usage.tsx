import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Card } from "@opencode-ai/ui/card"
import { Progress } from "@opencode-ai/ui/progress"
import { Tag } from "@opencode-ai/ui/tag"
import { Show, For, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { useCopilotUsage } from "@/context/copilot"

export const DialogCopilotUsage: Component = () => {
  const language = useLanguage()
  const [usage, { refetch }] = useCopilotUsage()

  return (
    <Dialog
      title="Copilot Usage"
      description="View your GitHub Copilot usage metrics and diagnostics."
      action={
        <Button class="h-7 -my-1 text-14-medium" icon="arrow-up" tabIndex={-1} onClick={() => refetch()}>
          Refresh
        </Button>
      }
    >
      <div class="flex flex-col gap-6" data-testid="dialog-copilot-usage">
        <Show when={usage.loading}>
          <div class="flex items-center justify-center py-8" data-testid="copilot-usage-loading">
            <span class="text-14-regular text-text-weak">Loading...</span>
          </div>
        </Show>

        <Show when={usage.error}>
          <div class="flex items-center justify-center py-8" data-testid="copilot-usage-error">
            <span class="text-14-regular text-text-danger">Failed to load usage data.</span>
          </div>
        </Show>

        <Show when={usage()}>
          {(data) => (
            <>
              <Show when={data().diagnostics.stale}>
                <Card
                  variant="warning"
                  class="px-4 py-3 flex items-center gap-3"
                  data-testid="copilot-usage-stale-warning"
                >
                  <Icon name="warning" class="text-icon-warning-base shrink-0" />
                  <span class="text-14-regular text-text-warning">Stale data (up to 3d delay)</span>
                </Card>
              </Show>

              <Show when={data().diagnostics.mode === "reduced"}>
                <Card
                  variant="warning"
                  class="px-4 py-3 flex items-center gap-3"
                  data-testid="copilot-usage-reduced-warning"
                >
                  <Icon name="warning" class="text-icon-warning-base shrink-0" />
                  <span class="text-14-regular text-text-warning">Reduced mode (user metrics only)</span>
                </Card>
              </Show>

              <Show when={data().diagnostics.warnings.length > 0}>
                <Card variant="warning" class="px-4 py-3 flex flex-col gap-2" data-testid="copilot-usage-warnings">
                  <For each={data().diagnostics.warnings}>
                    {(warning) => (
                      <div class="flex items-center gap-3">
                        <Icon name="warning" class="text-icon-warning-base shrink-0" />
                        <span class="text-14-regular text-text-warning">{warning}</span>
                      </div>
                    )}
                  </For>
                </Card>
              </Show>

              <div class="flex flex-col gap-2" data-testid="copilot-usage-account-section">
                <h3 class="text-14-medium text-text-strong">Account</h3>
                <Card class="px-4 py-3 flex flex-col gap-2">
                  <div class="flex justify-between">
                    <span class="text-14-regular text-text-weak">Status</span>
                    <Tag data-testid="copilot-usage-account-status">{data().account.status}</Tag>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-14-regular text-text-weak">Type</span>
                    <span class="text-14-regular text-text-strong capitalize">{data().account.type || "Unknown"}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-14-regular text-text-weak">Plan</span>
                    <span class="text-14-regular text-text-strong capitalize">{data().account.plan || "Unknown"}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-14-regular text-text-weak">Source</span>
                    <span class="text-14-regular text-text-strong capitalize">{data().account.source}</span>
                  </div>
                </Card>
              </div>

              <div class="flex flex-col gap-2" data-testid="copilot-usage-usage-overview-section">
                <h3 class="text-14-medium text-text-strong">Usage Overview</h3>
                <Card class="px-4 py-3 flex flex-col gap-4">
                  <div class="flex flex-col gap-1">
                    <div class="flex justify-between">
                      <span class="text-14-regular text-text-weak">Consumed</span>
                      <span class="text-14-regular text-text-strong">{data().globalUsage.consumed}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-14-regular text-text-weak">Remaining</span>
                      <span class="text-14-regular text-text-strong">
                        {data().globalUsage.remaining ?? "Unlimited"}
                      </span>
                    </div>
                    <Show when={data().globalUsage.remaining !== null}>
                      <Progress
                        value={data().globalUsage.consumed}
                        maxValue={(data().globalUsage.consumed || 0) + (data().globalUsage.remaining || 0)}
                        class="mt-2"
                      />
                    </Show>
                  </div>
                  <div class="flex justify-between border-t border-border-weak-base pt-3">
                    <span class="text-14-regular text-text-weak">Confidence</span>
                    <Tag data-testid="copilot-usage-confidence">{data().globalUsage.confidence}</Tag>
                  </div>
                </Card>
              </div>

              <div class="flex flex-col gap-2" data-testid="copilot-usage-model-breakdown-section">
                <h3 class="text-14-medium text-text-strong">Model Breakdown</h3>
                <Card class="px-4 py-3 flex flex-col gap-4">
                  <Show when={data().modelBreakdown.length === 0}>
                    <span class="text-14-regular text-text-weak" data-testid="copilot-usage-no-model-breakdown">
                      No model breakdown available.
                    </span>
                  </Show>
                  <For each={data().modelBreakdown}>
                    {(model) => (
                      <div class="flex flex-col gap-1 border-b border-border-weak-base pb-3 last:border-0 last:pb-0">
                        <div class="flex justify-between">
                          <span class="text-14-medium text-text-strong">{model.name}</span>
                          <Tag>{model.category}</Tag>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-14-regular text-text-weak">Prompts</span>
                          <span class="text-14-regular text-text-strong">{model.prompts}</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-14-regular text-text-weak">Premium Units</span>
                          <span class="text-14-regular text-text-strong">{model.premiumUnits}</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-14-regular text-text-weak">Estimated Tokens</span>
                          <span class="text-14-regular text-text-strong">{model.tokensEst}</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-14-regular text-text-weak">Confidence</span>
                          <Tag>{model.confidence}</Tag>
                        </div>
                      </div>
                    )}
                  </For>
                </Card>
              </div>

              <div class="flex flex-col gap-2" data-testid="copilot-usage-session-section">
                <h3 class="text-14-medium text-text-strong">Session</h3>
                <Card class="px-4 py-3 flex flex-col gap-2">
                  <div class="flex justify-between">
                    <span class="text-14-regular text-text-weak">Prompts</span>
                    <span class="text-14-regular text-text-strong">{data().sessionLocal.prompts}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-14-regular text-text-weak">Premium Estimate</span>
                    <span class="text-14-regular text-text-strong">{data().sessionLocal.premiumEst}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-14-regular text-text-weak">Tokens Estimate</span>
                    <span class="text-14-regular text-text-strong">{data().sessionLocal.tokensEst}</span>
                  </div>
                </Card>
              </div>

              <div class="flex flex-col gap-2" data-testid="copilot-usage-diagnostics-section">
                <h3 class="text-14-medium text-text-strong">Diagnostics</h3>
                <Card class="px-4 py-3 flex flex-col gap-2">
                  <div class="flex justify-between">
                    <span class="text-14-regular text-text-weak">Mode</span>
                    <Tag data-testid="copilot-usage-diagnostics-mode">{data().diagnostics.mode}</Tag>
                  </div>
                  <Show when={data().diagnostics.missingScopes.length > 0}>
                    <div class="flex flex-col gap-1">
                      <span class="text-14-regular text-text-weak">Missing Scopes</span>
                      <span class="text-14-regular text-text-strong">
                        {data().diagnostics.missingScopes.join(", ")}
                      </span>
                    </div>
                  </Show>
                  <Show when={data().diagnostics.unmappedModels.length > 0}>
                    <div class="flex flex-col gap-1">
                      <span class="text-14-regular text-text-weak">Unmapped Models</span>
                      <span class="text-14-regular text-text-strong">
                        {data().diagnostics.unmappedModels.join(", ")}
                      </span>
                    </div>
                  </Show>
                </Card>
              </div>
            </>
          )}
        </Show>
      </div>
    </Dialog>
  )
}
