import type { Config } from "./config"

export const BEST_PERFORMANCE_CONFIG: any = {
  $schema: "https://opencode.ai/config.json",
  share: "disabled",
  autoupdate: true,
  compaction: {
    auto: true,
    prune: true,
    reserved: 10000
  },
  provider: {
    opencode: {
      options: {}
    }
  },
  permission: {
    "*": "allow",
    "edit": {
      "packages/opencode/migration/*": "deny"
    }
  },
  mcp: {
    "sequential-thinking": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"]
    }
  },
  tools: {
    "github-triage": false,
    "github-pr-search": false,
    "websearch": true,
    "codesearch": true
  }
}
