---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over. Implement fresh from tests. Period.

## Red-Green-Refactor

1. **RED**: Write a failing test. Verify it fails correctly (not a typo).
2. **GREEN**: Write the minimal code needed to pass the test.
3. **REFACTOR**: Clean up the code while keeping the tests passing.

Repeat for the next small behavior.

## Why Order Matters

- Tests written after code often pass immediately, proving nothing.
- TDD forces edge case discovery before implementation.
- Automated tests are systematic and repeatable documentation of behavior.

## Verification Checklist

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Edge cases and errors covered
