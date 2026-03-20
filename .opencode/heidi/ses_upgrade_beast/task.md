# Upgrade Beast Mode Agent

## Objective
Upgrade beast_mode agent to use GPT 4.1 model with new configuration.

## Changes Required
1. Update name to "4.1 Beast Mode v3.1"
2. Update description to "GPT 4.1 as a top-notch coding agent."
3. Add GPT 4.1 model configuration (openai provider, gpt-4.1 model ID)
4. Update prompt to reference GPT 4.1

## Files
- packages/opencode/src/agent/agent.ts

## Verification
- Typecheck passes
- Benchmark test passes
