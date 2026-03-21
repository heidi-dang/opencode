import { Config } from "../config/config"
import { Log } from "../util/log"
import z from "zod"
import { Provider } from "../provider/provider"
import { ModelID, ProviderID } from "../provider/schema"
import { generateObject, streamObject, type ModelMessage } from "ai"
import { SystemPrompt } from "../session/system"
import { Instance } from "../project/instance"
import { Truncate } from "../tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "../provider/transform"

import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import PROMPT_BEAST from "./beast_mode_prompt.txt"
import { Permission as PermissionNext } from "@/permission/service"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Personas } from "./personas"

export namespace Agent {
  const log = Log.create({ service: "agent" })
  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      mode: z.enum(["subagent", "primary", "all"]),
      native: z.boolean().optional(),
      hidden: z.boolean().optional(),
      topP: z.number().optional(),
      temperature: z.number().optional(),
      color: z.string().optional(),
      permission: PermissionNext.Ruleset,
      model: z
        .object({
          modelID: ModelID.zod,
          providerID: ProviderID.zod,
        })
        .optional(),
      variant: z.string().optional(),
      prompt: z.string().optional(),
      options: z.record(z.string(), z.any()),
      steps: z.number().int().positive().optional(),
    })
    .meta({
      ref: "Agent",
    })
  export type Info = z.infer<typeof Info>

  const state = Instance.state(async () => {
    const cfg = await Config.get()

    const skillDirs = await Skill.dirs()
    const whitelistedDirs = [Truncate.GLOB, ...skillDirs.map((dir: string) => path.join(dir, "*"))]
    const defaults = PermissionNext.fromConfig({
      "*": "allow",
      doom_loop: "ask",
      external_directory: {
        "*": "ask",
        ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
      },
      question: "deny",
      plan_enter: "deny",
      plan_exit: "deny",
      // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
      read: {
        "*": "allow",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
    })
    const user = PermissionNext.fromConfig(cfg.permission ?? {})

    const result: Record<string, Info> = {
      build: {
        name: "build",
        description: "The default agent. Executes tools based on configured permissions.",
        options: {},
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_enter: "allow",
          }),
          user,
        ),
        mode: "primary",
        native: true,
      },
      heidi: {
        name: "heidi",
        description:
          "Autonomous orchestrator with 7-Phase architecture: FSM state, Git rollback, multi-agent delegation.",
        prompt: "", // dynamically built below after all agents are registered
        options: {},
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_enter: "allow",
            task_boundary: "allow",
            run_command: "allow",
            browser_subagent: "allow",
            knowledge_subagent: "allow",
            edit: "allow",
            write: "allow",
            read: "allow",
          }),
          user,
        ),
        mode: "primary",
        native: true,
      },
      plan: {
        name: "plan",
        description: "Plan mode. Disallows all edit tools.",
        options: {},
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_exit: "allow",
            external_directory: {
              [path.join(Global.Path.data, "plans", "*")]: "allow",
            },
            edit: {
              "*": "deny",
              [path.join(".opencode", "plans", "*.md")]: "allow",
              [path.relative(Instance.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
            },
          }),
          user,
        ),
        mode: "primary",
        native: true,
      },
      general: {
        name: "general",
        description: `General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.`,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            todoread: "deny",
            todowrite: "deny",
          }),
          user,
        ),
        options: {},
        mode: "subagent",
        native: true,
      },
      explore: {
        name: "explore",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            grep: "allow",
            glob: "allow",
            list: "allow",
            bash: "allow",
            codesearch: "allow",
            read: "allow",
            run_command: "allow",
            external_directory: {
              "*": "ask",
              ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
            },
          }),
          user,
        ),
        description:
          "Fast codebase explorer. Finds files by pattern, searches code by keyword. Specify thoroughness: quick, medium, or very thorough.",
        prompt: PROMPT_EXPLORE,
        options: {},
        mode: "subagent",
        native: true,
      },
      compaction: {
        name: "compaction",
        mode: "primary",
        native: true,
        hidden: true,
        variant: "small",
        prompt: PROMPT_COMPACTION,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
          }),
          user,
        ),
        options: {},
      },
      title: {
        name: "title",
        mode: "primary",
        options: {},
        native: true,
        hidden: true,
        variant: "small",
        temperature: 0.5,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
          }),
          user,
        ),
        prompt: PROMPT_TITLE,
      },
      summary: {
        name: "summary",
        mode: "primary",
        options: {},
        native: true,
        hidden: true,
        variant: "small",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
          }),
          user,
        ),
        prompt: PROMPT_SUMMARY,
      },
      seo: {
        name: "seo",
        description: "SEO/AEO/GEO expert for search, snippets, and AI citation optimization.",
        prompt:
          "SEO Expert. Audit crawlability first. Optimize for Google (SEO), Featured Snippets (AEO), LLM citations (GEO). Use Schema.org markup. Optimize Core Web Vitals. Maintain llms.txt. Apply E-E-A-T.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            webfetch: "allow",
            websearch: "allow",
            bash: "allow",
            run_command: "allow",
            edit: "allow",
            write: "allow",
            read: "allow",
            task_boundary: "allow",
          }),
          user,
        ),
        options: {},
        mode: "subagent",
        native: true,
      },
      playwright: {
        name: "playwright",
        description: "E2E testing expert using Playwright and browser automation.",
        prompt:
          "Playwright Expert. Explore site before coding. Use locators (getByRole/getByText), not CSS. Write TypeScript tests with page objects. Debug flaky tests via race conditions and waits.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            bash: "allow",
            run_command: "allow",
            edit: "allow",
            write: "allow",
            read: "allow",
            browser: "allow",
            task_boundary: "allow",
          }),
          user,
        ),
        options: {},
        mode: "subagent",
        native: true,
      },
      ci_cd: {
        name: "ci_cd",
        description: "CI/CD and GitOps expert for pipeline reliability.",
        prompt:
          "CI/CD Expert. Triage failures (build/env/timeout). Optimize caching. Enforce least-privilege. Create rollback plans. Apply OWASP/Zero Trust.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            bash: "allow",
            run_command: "allow",
            edit: "allow",
          }),
          user,
        ),
        options: {},
        mode: "subagent",
        native: true,
      },
      docs: {
        name: "docs",
        description: "Technical writing and documentation expert.",
        prompt:
          "Docs Expert. Create ADRs from templates. Audit for A11y compliance. Follow strict heading hierarchy. Apply E-E-A-T principles.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            read: "allow",
            write: "allow",
            edit: "allow",
            a11y: "allow",
            adr: "allow",
          }),
          user,
        ),
        options: {},
        mode: "subagent",
        native: true,
      },
      mcp_expert: {
        name: "mcp_expert",
        description: "MCP protocol integration and tool debugging expert.",
        prompt:
          "MCP Expert. Use z.object for params. Use Tool.define for native integrations. Debug via session logs and protocol exchange.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            read: "allow",
            edit: "allow",
            bash: "allow",
          }),
          user,
        ),
        options: {},
        mode: "subagent",
        native: true,
      },
      audio_specialist: {
        name: "audio-specialist",
        description:
          "Sound designer + technical implementer for workflow SFX, soundtrack prompts, audio quality judgment, refinement, and export.",
        prompt: [
          "You are audio-specialist.",
          "Operate like a sound designer paired with a technical implementer, not a generic coder.",
          "Translate user intent into a strict AudioSpec.",
          "Route requests by engine: workflow_sfx, notifications, UI clicks, alerts, combo cues -> audio.generate with mode=sfx. Background tracks, loops, soundtrack, ambience -> audio.generate with mode=music|ambience|loop.",
          "Your standard flow is: spec -> engine route -> generate 2-4 variants -> analyze -> score -> reject weak outputs -> optionally refine with audio.edit -> normalize/package when needed -> update preview with audio.package_preview.",
          "Reject outputs that are too long, harsh, muddy, generic, stock-sounding, or inconsistent with the pack family.",
          "Maintain pack consistency: shared brightness range, transient style, tail behavior, and product identity.",
          "Prefer deterministic procedural generation first for short SFX.",
          "For each accepted result, report the winning score, why it won, and the exact files exported.",
        ].join("\n"),
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            read: "allow",
            write: "allow",
            edit: "allow",
            run_command: "allow",
            "audio.generate": "allow",
            "audio.edit": "allow",
            "audio.layer": "allow",
            "audio.normalize": "allow",
            "audio.analyze": "allow",
            "audio.package_preview": "allow",
          }),
          user,
        ),
        options: {},
        mode: "subagent",
        native: true,
      },

      beast_mode: {
        name: "4.1 Beast Mode v3.1",
        description: "GPT 4.1 as a top-notch coding agent.",
        model: {
          providerID: ProviderID.make("openai"),
          modelID: ModelID.make("gpt-4.1"),
        },
        prompt: PROMPT_BEAST,
        options: {},
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "allow",
            todoread: "deny",
          }),
          user,
        ),
        mode: "subagent",
        native: true,
      },
      ...Personas.get(defaults, user),
    }

    if (result.idea_generator) {
      result.idea_generator.mode = "primary"
    }

    // Weakness 3 fix: dynamically build Heidi prompt from assembled agents
    const subs = Object.values(result)
      .filter((a) => a.mode === "subagent" && !a.hidden)
      .map((a) => `@${a.name}`)
      .join(", ")
    result.heidi.prompt = [
      "You are Heidi, the world-class autonomous software orchestrator powered by OpenCode Native Superpowers.",
      "Your mission is to deliver 100/100 quality code through a rigorous orchestrated agency model.",
      "",
      "### THE HEIDI PROTOCOL (Orchestrated Agency)",
      "You MUST follow these phases for any task involving more than trivial edits:",
      "1. BRAINSTORM: Use @brainstorming skill. Ask questions, explore intent, propose 2-3 approaches.",
      "2. DESIGN: Document the final design in `docs/specs/`. Delegate to @spec_reviewer for audit before planning.",
      "3. PLAN: Use @writing-plans skill. Create a TDD-based implementation_plan.md. Delegate to @plan_reviewer for audit.",
      "4. EXECUTE: Delegate to @implementer. Implementation MUST happen in an isolated Git Worktree.",
      "5. REVIEW: Use @code_quality_reviewer for final audit of the implemented code and passing tests.",
      "6. FINISH: Use @finishing-a-development-branch to merge or create a Pull Request.",
      "",
      "### CORE DIRECTIVES",
      "- TDD (Test-Driven Development): Write the failing test FIRST. No production code without a failing test first.",
      "- ISOLATION: Always use `isolated: true` in the task tool when implementing or refactoring code.",
      "- REVIEWS: Reviews are mandatory gates. Do not bypass them. If a reviewer rejects, fix the issues with the subagent.",
      "- HONESTY: Evidence before claims. Use @verification-before-completion. If you haven't run the proof, don't claim it passes.",
      "- DELEGATION: You are the controller. Do not do the intensive coding yourself — coordinate specialized subagents.",
      "- AUDIO ROUTING: Requests for sound design, workflow cues, alerts, ambience, loops, or soundtrack generation must route to @audio-specialist.",
      "",
      `Available specialized subagents: ${subs}.`,
      "Use `task_boundary` frequently to update the user on your current state (Designing, Planning, Executing, etc.).",
    ].join("\n")

    // Fix 3: strict runtime validation for permission coherence
    for (const [key, agent] of Object.entries(result)) {
      if (agent.mode !== "subagent") continue
      const disabled = PermissionNext.disabled(["run_command", "edit", "write", "bash"], agent.permission)
      const prompt = agent.prompt ?? ""
      if (prompt.includes("sudo") && disabled.has("run_command"))
        log.warn("permission mismatch", { agent: key, issue: "prompt mentions sudo but run_command is denied" })
      if (prompt.includes("edit") && disabled.has("edit"))
        log.warn("permission mismatch", { agent: key, issue: "prompt mentions edit but edit is denied" })
      const q = PermissionNext.evaluate("question", "*", agent.permission)
      if (q.action === "allow")
        log.warn("permission risk", { agent: key, issue: "subagent has question: allow, may stall pipeline" })
    }

    for (const [key, value] of Object.entries(cfg.agent ?? {})) {
      if (value.disable) {
        delete result[key]
        continue
      }
      let item = result[key]
      if (!item)
        item = result[key] = {
          name: key,
          mode: "subagent",
          permission: PermissionNext.merge(defaults, user),
          options: {},
          native: false,
        }
      if (value.model) item.model = Provider.parseModel(value.model)
      item.variant = value.variant ?? item.variant
      item.prompt = value.prompt ?? item.prompt
      item.description = value.description ?? item.description
      item.temperature = value.temperature ?? item.temperature
      item.topP = value.top_p ?? item.topP
      item.mode = value.mode ?? item.mode
      item.color = value.color ?? item.color
      item.hidden = value.hidden ?? item.hidden
      item.name = value.name ?? item.name
      item.steps = value.steps ?? item.steps
      item.options = mergeDeep(item.options, value.options ?? {})
      item.permission = PermissionNext.merge(item.permission, PermissionNext.fromConfig(value.permission ?? {}))
    }

    // Ensure Truncate.GLOB is allowed unless explicitly configured
    for (const name in result) {
      const agent = result[name]
      const explicit = agent.permission.some((r) => {
        if (r.permission !== "external_directory") return false
        if (r.action !== "deny") return false
        return r.pattern === Truncate.GLOB
      })
      if (explicit) continue

      result[name].permission = PermissionNext.merge(
        result[name].permission,
        PermissionNext.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
      )
    }

    return result
  })

  export async function get(agent: string) {
    return state().then((x) => x[agent])
  }

  export async function resolve(agent: string) {
    const items = await state()
    return items[agent] ?? Object.values(items).find((item) => item.name === agent)
  }

  export async function list() {
    const cfg = await Config.get()
    return pipe(
      await state(),
      values(),
      sortBy(
        [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"],
        [(x) => x.name, "asc"],
      ),
    )
  }

  export async function defaultAgent() {
    const cfg = await Config.get()
    const agents = await state()

    if (cfg.default_agent) {
      const agent = agents[cfg.default_agent]
      if (!agent) throw new Error(`default agent "${cfg.default_agent}" not found`)
      if (agent.mode === "subagent") throw new Error(`default agent "${cfg.default_agent}" is a subagent`)
      if (agent.hidden === true) throw new Error(`default agent "${cfg.default_agent}" is hidden`)
      return agent.name
    }

    const primaryVisible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
    if (!primaryVisible) throw new Error("no primary visible agent found")
    return primaryVisible.name
  }

  export async function generate(input: { description: string; model?: { providerID: ProviderID; modelID: ModelID } }) {
    const cfg = await Config.get()
    const defaultModel = input.model ?? (await Provider.defaultModel())
    const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
    const language = await Provider.getLanguage(model)

    const system = [PROMPT_GENERATE]
    await Plugin.trigger("experimental.chat.system.transform", { model }, { system })
    const existing = await list()

    const params = {
      experimental_telemetry: {
        isEnabled: cfg.experimental?.openTelemetry,
        metadata: {
          userId: cfg.username ?? "unknown",
        },
      },
      temperature: 0.3,
      messages: [
        ...system.map(
          (item): ModelMessage => ({
            role: "system",
            content: item,
          }),
        ),
        {
          role: "user",
          content: `Create an agent configuration based on this request: \"${input.description}\".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
        },
      ],
      model: language,
      schema: z.object({
        identifier: z.string(),
        whenToUse: z.string(),
        systemPrompt: z.string(),
      }),
    } satisfies Parameters<typeof generateObject>[0]

    // TODO: clean this up so provider specific logic doesnt bleed over
    if (defaultModel.providerID === "openai" && (await Auth.get(defaultModel.providerID))?.type === "oauth") {
      const result = streamObject({
        ...params,
        providerOptions: ProviderTransform.providerOptions(model, {
          store: false,
        }),
        onError: () => {},
      })
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error
      }
      return result.object
    }

    const result = await generateObject(params)
    return result.object
  }
}
