# Heidi Agent Improvement Plan

## Phase 1: Context System Enhancement (Priority: HIGH)

### 1.1 Auto-Discovery ContextScout
```
.opencode/
├── context/
│   ├── scout.ts           # NEW: Auto-detect tech stack, patterns
│   ├── patterns/          # Project-specific patterns
│   │   ├── tech-stack.md  # Auto-detected: React, Drizzle, etc.
│   │   ├── conventions.md # Naming, file structure
│   │   └── workflows.md  # Development workflows
│   └── knowledge/         # Existing knowledge items
```

### 1.2 Lazy Context Loading
- Only load context relevant to current task
- <100 lines per context file by default
- Smart caching with TTL

### 1.3 Team Shared Context
- `.opencode/context/shared/` for team patterns
- Git-syncable context files

## Phase 2: Approval Workflow (Priority: HIGH)

### 2.1 Checkpoint Commands
```bash
opencode > "refactor auth --checkpoint=architecture"
opencode > "add feature --checkpoint=implementation"  
opencode > "fix bug --checkpoint=testing"
```

### 2.2 Approval Modes
- `--approve=all` - Full approval for each step
- `--approve=critical` - Only security/critical
- `--approve=auto` - No approval (current behavior)

### 2.3 Rollback Support
- Snapshot before each checkpoint
- Quick rollback command

## Phase 3: Enhanced Sub-Agents (Priority: MEDIUM)

### 3.1 ContextScout Agent
- Auto-detect project tech stack
- Discover patterns from code
- Generate context files

### 3.2 TestEngineer Agent
- Generate tests from code analysis
- Coverage reporting
- Integration with Vortex

### 3.3 SecurityAuditor Agent (enhanced)
- Auto-fix vulnerabilities
- Dependency scanning
- Compliance checking

## Phase 4: Team Features (Priority: MEDIUM)

### 4.1 Shared Pattern Library
- Team workspace context
- Version-controlled patterns
- Template workflows

### 4.2 Onboarding Assistant
- Auto-generate context for new projects
- Tech stack detection
- Convention auto-discovery

## Phase 5: Performance (Priority: LOW)

### 5.1 Token Optimization
- Context compression
- Duplicate removal
- Smart summarization

### 5.2 Caching
- Cache discovered patterns
- Cache context loading
- Incremental context updates

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| HIGH | ContextScout auto-detect | Medium | High |
| HIGH | Approval checkpoint commands | Low | High |
| MEDIUM | Team shared context | Medium | Medium |
| MEDIUM | Enhanced TestEngineer | Medium | Medium |
| LOW | Token optimization | High | Low |
| LOW | Advanced caching | Medium | Low |
