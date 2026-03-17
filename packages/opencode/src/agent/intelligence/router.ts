import { Log } from "../../util/log"
import type { TaskObject } from "../../session/task"
import type { ProjectPatterns } from "./scout"

export type ExecutionLane = "frontend" | "backend" | "systems" | "fullstack" | "unknown"

export interface LanePolicy {
  lane: ExecutionLane
  description: string
  toolPolicy: string
  contextPolicy: string
}

const LANES: Record<ExecutionLane, LanePolicy> = {
  frontend: {
    lane: "frontend",
    description: "UI and Client-Side development",
    toolPolicy: "Prefer browser testing tools and DOM inspection. Do not run heavy backend database migrations unless strictly required.",
    contextPolicy: "Focus on React/Solid/Vue components, CSS/Tailwind files, and client-side state.",
  },
  backend: {
    lane: "backend",
    description: "Server-side logic, APIs, and Database",
    toolPolicy: "Use database inspection tools, curl/http clients for APIs. Focus on unit and integration tests.",
    contextPolicy: "Focus on Prisma/Drizzle schemas, routing logic, and server middleware.",
  },
  systems: {
    lane: "systems",
    description: "DevOps, CI/CD, and Build tooling",
    toolPolicy: "Use shell commands, Docker, and process inspection tools. Respect production safety constraints.",
    contextPolicy: "Focus on Dockerfiles, GitHub Actions, bash scripts, and turbo/build configs.",
  },
  fullstack: {
    lane: "fullstack",
    description: "End-to-end feature development",
    toolPolicy: "Switch between frontend and backend tools as needed. Coordinate API and UI changes.",
    contextPolicy: "Load cross-stack context including both schema definitions and UI components.",
  },
  unknown: {
    lane: "unknown",
    description: "General execution lane",
    toolPolicy: "Use standard tool discovery.",
    contextPolicy: "Use standard context loading.",
  }
}

/**
 * SpecialistRouter: P3 — Lane-based routing with explicit tool/context policies.
 * Analyzes the user task and project tech stack to put the agent into a specific "lane"
 * with customized operational rules.
 */
export class SpecialistRouter {
  private static log = Log.create({ service: "specialist-router" })

  static route(task: TaskObject | null, patterns: ProjectPatterns): LanePolicy {
    if (!task) return LANES.unknown

    const txt = `${task.goal} ${task.constraints.join(" ")}`.toLowerCase()
    
    // Explicit hints from the task object
    if (txt.includes("ui ") || txt.includes("react") || txt.includes("frontend") || txt.includes("component")) {
      if (txt.includes("api") || txt.includes("database") || txt.includes("backend")) {
        return LANES.fullstack
      }
      return LANES.frontend
    }

    if (txt.includes("api ") || txt.includes("database") || txt.includes("backend") || txt.includes("schema") || txt.includes("sql")) {
      return LANES.backend
    }

    if (txt.includes("docker") || txt.includes("pipeline") || txt.includes("ci/cd") || txt.includes("build") || txt.includes("deploy")) {
      return LANES.systems
    }

    // Fallback to tech stack assumptions
    const stack = patterns.stack.join(" ")
    if (stack.includes("nextjs") || stack.includes("solidjs")) {
      // In a fullstack framework, check if they mentioned UI or backend concepts
      return LANES.fullstack
    }

    this.log.info("task routed to unknown lane", { goal: task.goal })
    return LANES.unknown
  }

  static format(policy: LanePolicy): string {
    if (policy.lane === "unknown") return ""
    return [
      `<lane_policy>`,
      `  Lane: ${policy.lane} (${policy.description})`,
      `  Tool Policy: ${policy.toolPolicy}`,
      `  Context Policy: ${policy.contextPolicy}`,
      `</lane_policy>`
    ].join("\n")
  }
}
