---
name: context-manager
description: Mathematically prevents ContextOverflowError by actively managing and pruning prompt budgets using token-weight calculations.
---

# Context Manager Integration

This skill governs how Heidi processes and prunes the memory array during state synchronizations. By calculating estimated AST node token weights, Heidi can safely discard older context items instead of hitting unrecoverable prompt bounds errors.

Never disable mathematical pruning unless debugging core state ingestion.
