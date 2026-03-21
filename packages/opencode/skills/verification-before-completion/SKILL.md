---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing - requires running verification commands and confirming output before making any success claims.
---

# Verification Before Completion

## Overview

Claiming work is complete without fresh evidence is not acceptable. You MUST provide evidence for every claim of success.

**Core principle:** Evidence before claims, always.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in THIS message, you cannot claim it passes.

## The Process

1. **IDENTIFY**: What command or action proves the claim?
2. **RUN**: Execute the command (fresh run, not historical).
3. **READ**: Analyze the full output and exit code.
4. **VERIFY**: Does the evidence support the claim?
5. **REPORT**: State the status and include the evidence/output snippet.

## Red Flags - STOP
- Using "should", "likely", or "seems to".
- Expressing satisfaction ("Done!", "Fixed!") before verification.
- Trusting sub-agent reports without checking their actual work (diffs, tests).
- Thinking "it's too simple to break".

## Bottom Line
No shortcuts. Run the command. Read the output. THEN claim the result.
