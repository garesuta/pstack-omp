---
name: pstack-principle-guard-the-context-window
description: "Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents; keep summaries in the main thread, not raw payloads."
disable-model-invocation: true
---

In omp, resolve this skill file to its real directory, then read [the omp adapter](../../docs/harness/omp.md) before following this skill. Its tool, model, path, and safety mappings override the Cursor and Claude Code instructions below.

# Guard the Context Window

**Why:** Context overflow degrades reasoning quality, creates compression artifacts, and halts progress.

**Pattern:**
- **Size phases and cap scope.** Limit files per phase, set turn budgets, account for mechanism costs.
