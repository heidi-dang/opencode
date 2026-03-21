# DynamicRegistry

## Summary
- Community skill hot-load works for `pydantic-ai`; the installer reported a successful install and context refresh.
- `packages/opencode/src/tool/dynamic_skill.ts` passed `vibe_audit` with no floating promises or unhandled async-boundary findings.
- Semantic search found no AST-resolved invocations for `ToolRegistry.register` under the current query, suggesting registration may occur through alternate identifiers, wrappers, or dynamically resolved paths.
- Global `.ts` variant analysis found zero remaining `process.cwd()` usages, supporting `Instance.directory` compliance.

## Mermaid
```mermaid
flowchart TD
    A[install_community_skill: pydantic-ai] --> B[dynamic_skill.ts audit]
    B --> C[vibe_audit pass]
    C --> D[vexor_search ToolRegistry.register]
    D --> E[No semantic matches]
    E --> F[variant_analysis process.cwd()]
    F --> G[Zero .ts variants]
    G --> H[DynamicRegistry status]
    H --> I[Hot-load validated]
    H --> J[Async boundaries clean]
    H --> K[No direct ToolRegistry.register map found]
    H --> L[Instance.directory compliance supported]
```