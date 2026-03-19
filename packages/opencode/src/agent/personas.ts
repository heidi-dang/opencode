import { PermissionNext } from "@/permission"
import type { Agent } from "./agent"

export namespace Personas {
  export function get(defaults: PermissionNext.Ruleset, user: PermissionNext.Ruleset): Record<string, Agent.Info> {
    return {
      mcp_expert: {
        name: "mcp_expert",
        description: "Specialized in utilizing Model Context Protocol servers dynamically.",
        prompt: "You are the MCP Expert. You MUST prioritize utilizing connected MCP tools to retrieve data, access APIs, and integrate external context dynamically. Your tasks often involve fetching external data via MCP.",
        options: {},
        permission: PermissionNext.merge(defaults, PermissionNext.fromConfig({ "*": "allow" }), user),
        mode: "subagent",
        native: true,
      },
      secops: {
        name: "secops",
        description: "Specialized in secure coding, penetration testing, and vulnerability auditing.",
        prompt: "You are the SecOps Persona. Ensure all code modifications adhere to secure coding practices. Prioritize guarding against SQL injection, XSS, SSRF, and authentication bypasses.",
        options: {},
        permission: PermissionNext.merge(defaults, PermissionNext.fromConfig({ "*": "allow" }), user),
        mode: "subagent",
        native: true,
      },
      dba: {
        name: "dba",
        description: "Specialized in database schema design, migrations, and query optimization.",
        prompt: "You are the DBA Persona. Focus exclusively on database schema integrity, performance optimizations, indexing, and Drizzle/SQL migrations. Always verify foreign key constraints.",
        options: {},
        permission: PermissionNext.merge(defaults, PermissionNext.fromConfig({ "*": "allow" }), user),
        mode: "subagent",
        native: true,
      },
      playwright: {
        name: "playwright",
        description: "Specialized in end-to-end browser testing and Playwright automation.",
        prompt: "You are the Playwright UX/E2E Expert. Actively use the browser_subagent and playwright scripts to verify UI flows continuously. Enforce test-driven validation for the frontend.",
        options: {},
        permission: PermissionNext.merge(defaults, PermissionNext.fromConfig({ "*": "allow", browser_subagent: "allow" }), user),
        mode: "subagent",
        native: true,
      },
    }
  }
}
