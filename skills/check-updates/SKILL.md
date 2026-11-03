---
name: pstack-check-updates
description: Check for upstream pstack changes or prepare an approved migration to a pinned upstream revision.
---

In omp, resolve this skill file to its real directory, then read [the omp adapter](../../docs/harness/omp.md) before following this skill. Its tool, model, path, and safety mappings apply throughout.

# Check upstream updates

## Check and report

1. Resolve the real path of this `SKILL.md` through symlinks. The package root is two directories above its parent. Run `node <package>/scripts/check-upstream.mjs --json` with that absolute package path; do not assume the working directory is the package. Node.js with built-in `fetch` is required. If the script or Node.js is unavailable, report the prerequisite rather than substituting another check.
2. Report `portVersion`, `status`, and the current and candidate upstream versions and commits, including null values. For `unknown`, report the error and do not claim an update is available. Report the compare URL when present.
3. List every change and its change type, grouped by relevant skills, agents, scripts, docs, and other paths as needed. Do not infer semantic changes from filenames. If the user requests details, inspect the diff between the exact pinned baseline and candidate commits and distinguish observed changes from uncertainty.
4. Explain that an upstream source change is not a reviewed, installable pstack-omp release. This check does not discover port releases. Offer to keep the current version, inspect the pinned diff, or prepare a migration. Checking is on demand and read-only; it executes no remote code, writes no files, and never rewrites the active installation.

## Approved migration preparation

Do not install or migrate without explicit user approval. Approval to prepare does not itself authorize publishing or installing a release. If the active package is an installed plugin cache, use a separate maintainer checkout; do not edit the cache.

1. In the maintainer checkout, create a separate branch or worktree. Pin the exact candidate SHA from the check; do not silently follow a moving branch. Compare the old pinned upstream, the new upstream at that SHA, and the current port for every affected path.
2. Import and review the upstream changes while retaining the port's namespace, paths, native agents, model rules, authorization boundaries, and license. Preserve user rules and generated skills. Account for removed or renamed commands and block workflows requiring unsupported capabilities rather than pretending they work. Inspect new code and its side effects before running it. Update `UPSTREAM.json` only after the import is complete.
3. Verify the installer in isolation and run bounded checks for changed workflows, subject to user authorization and available capabilities. Document the result and prepare a release tag only after verification succeeds; report failures or missing capabilities instead of claiming readiness.
4. Explain rollback: reinstall the prior pinned tag and restart the session to refresh the skill catalog. Keep the prior release available. Do not alter the active install as part of checking or preparation.

Use no generic migration engine, runtime hook, or recurring check.
