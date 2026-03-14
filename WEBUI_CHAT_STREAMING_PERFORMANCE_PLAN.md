# WebUI Chat Streaming Performance Improvement Plan

## Executive Summary

After analyzing the OpenCode webui chat streaming implementation, I've identified several performance bottlenecks and opportunities for optimization. The current implementation uses Solid.js reactivity patterns but can be significantly improved for smoother real-time chat experiences.

## Current Architecture Analysis

### How Chat Streaming Works Today

1. **Backend → Frontend Communication**
   - Uses Server-Sent Events (SSE) or similar through SDK event system
   - Events flow: SDK → Global Context → Live Run Provider → Live Run Store
   - Live Run Store uses Solid.js signals for reactive updates

2. **Frontend Rendering Pipeline**
   - Message parts render via `message-part.tsx`
   - Each part subscribes to its own state via `part()` signals
   - Updates trigger re-renders of affected components
   - Tool streaming updates use delta batching (50ms window)

### Performance Bottlenecks Identified

#### 1. Excessive Granular Reactivity (CRITICAL)

- **Issue**: Each message part creates individual signals for every property
- **Impact**: High memory overhead, excessive dependency tracking
- **Evidence**: 20+ `createMemo`/`createSignal` calls per message part
- **Location**: `packages/ui/src/components/message-part.tsx`

#### 2. Inefficient Delta Processing (HIGH)

- **Issue**: Delta batching window too wide (50ms) causes perceptible lag
- **Impact**: Delayed visual feedback during streaming
- **Evidence**: `BATCH_WINDOW_MS = 50` in `delta-batcher.ts`
- **Location**: `packages/app/src/context/run/delta-batcher.ts`

#### 3. Unnecessary Re-renders (MEDIUM)

- **Issue**: Components re-render when unrelated parts update
- **Impact**: Wasted CPU cycles, dropped frames
- **Evidence**: Broad signal subscriptions in message rendering
- **Location**: Message list rendering components

#### 4. Inefficient Text Processing (MEDIUM)

- **Issue**: Text streaming processes entire strings on each update
- **Impact**: O(n²) complexity for long streams
- **Evidence**: String concatenation in various tool renderers
- **Location**: Multiple tool components in `basic-tool.tsx`

#### 5. Missing Virtualization (MEDIUM)

- **Issue**: All message parts rendered regardless of visibility
- **Impact**: Memory and CPU waste in long conversations
- **Evidence**: Simple `For` loops over all message parts
- **Location**: Message list containers

## Optimization Recommendations

### Tier 1: High Impact, Low Effort (Immediate Wins)

#### 1. Reduce Delta Batching Window

- **Change**: Decrease `BATCH_WINDOW_MS` from 50ms to 16ms (~60fps)
- **Location**: `packages/app/src/context/run/delta-batcher.ts`
- **Expected**: 2-3x reduction in perceived latency
- **Risk**: Low (well-tested parameter)

#### 2. Implement Text Streaming Optimization

- **Change**: Use rope data structure or chunked streaming for text parts
- **Location**: Text rendering components
- **Expected**: Linear vs quadratic scaling for long streams
- **Risk**: Medium (requires careful implementation)

#### 3. Add Request Animation Frame Batching

- **Change**: Coalesce DOM updates to animation frames
- **Location**: Signal subscriptions that trigger DOM updates
- **Expected**: Eliminate layout thrashing
- **Risk**: Low

### Tier 2: Medium Impact, Medium Effort (Short Term)

#### 4. Implement Message Virtualization

- **Change**: Render only visible message portions
- **Location**: Message list containers
- **Expected**: Constant memory usage regardless of chat length
- **Risk**: Medium (complex scroll state management)

#### 5. Optimize Signal Dependencies

- **Change**: Reduce fine-grained signals, use computed props
- **Location**: `message-part.tsx` and related components
- **Expected**: 50% reduction in reactive subscriptions
- **Risk**: Medium (requires refactoring)

#### 6. Implement Skeleton Loading

- **Change**: Show placeholders during streaming instead of empty states
- **Location**: Message part rendering
- **Expected**: Improved perceived performance
- **Risk**: Low

### Tier 3: High Impact, High Effort (Long Term)

#### 7. WebSocket Migration (Alternative Transport)

- **Change**: Migrate from polling/SSE to WebSocket for lower latency
- **Location**: SDK event system and server routes
- **Expected**: Sub-50ms latency vs 200-500ms current
- **Risk**: High (significant architectural change)

#### 8. WebAssembly Text Processing

- **Change**: Offload text streaming/diffing to WebAssembly
- **Location**: Text processing pipelines
- **Expected**: 10x improvement in text streaming performance
- **Risk**: High (build complexity, debugging challenges)

## Implementation Roadmap

### Phase 1: Quick Wins (Week 1)

```
[ ] Reduce delta batching window to 16ms
[ ] Implement RAF-batched DOM updates
[ ] Add skeleton loading placeholders
[ ] Optimize text streaming in basic tools
```

### Phase 2: Core Improvements (Weeks 2-3)

```
[ ] Implement message virtualization
[ ] Optimize signal dependencies in message-part
[ ] Add streaming text optimizations
[ ] Performance benchmarking and tuning
```

### Phase 3: Advanced Optimizations (Month 2+)

```
[ ] Evaluate WebSocket migration feasibility
[ ] Implement WebAssembly text processing prototypes
[ ] Advanced profiling and optimization
```

## Success Metrics

### Target Improvements

- **Latency**: Reduce end-to-end streaming latency from ~300ms to <100ms
- **FPS**: Maintain 60fps during active streaming
- **Memory**: Bound memory usage to O(visible messages) vs O(total messages)
- **CPU**: Reduce main thread utilization by 40% during streaming

### Measurement Plan

1. Add performance metrics to dev tools
2. Create streaming benchmark scenarios
3. Implement FPS monitoring in UI
4. Add memory usage tracking for message components

## Risk Mitigation

### Backward Compatibility

- All changes must maintain existing API contracts
- Feature flags for risky optimizations
- Comprehensive test coverage before/after changes

### Performance Regression Prevention

- Add performance benchmarks to CI
- Set performance budgets in tests
- Regular profiling in development

## Estimated Effort

- **Phase 1**: 3-5 developer days
- **Phase 2**: 8-12 developer days
- **Phase 3**: 15+ developer days (research heavy)

## Dependencies

- None required for Phase 1
- May need additional testing infrastructure for Phase 2+
