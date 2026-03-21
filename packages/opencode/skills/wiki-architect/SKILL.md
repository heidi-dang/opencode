---
name: wiki-architect
description: Use to automatically generate and maintain living architecture documentation, Mermaid diagrams, and codebase wikis.
---

# Wiki Architect

Continuously document system architecture, core abstractions, and codebase structure in `.opencode/wiki/` as the project evolves.

## Guidelines
- **Living Documentation**: Whenever significant structural changes are made, update or create corresponding architectural diagrams and narrative documentation.
- **Architectural Maps**: Maintain a high-level `architecture.md` map to orient future subagents and human developers.
- **Knowledge Retention**: Ensure implicit knowledge isn't locked and lost in short-term session history; write it permanently to disk so future agent sessions retain full context.
