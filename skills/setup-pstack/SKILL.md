---
name: pstack-setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes an always-applied rule that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

In omp, resolve this skill file to its real directory, then read [the omp adapter](../../docs/harness/omp.md) before following this skill. Its tool, model, path, and safety mappings override the Cursor and Claude Code instructions below.

# Setup pstack

Configure pstack model roles for omp. Run this workflow only when the user asks to configure them. It writes one native rule, not omp settings or other harness configuration.

## 1. Detect models and the rule path

Run `omp models --json` in the active session's environment. Use its available chat model records, including each exact `provider` and `id`, as the detected set. Consult `omp://models.md` and the model records' effective thinking metadata or schemas for supported effort levels. A catalog listing indicates configured availability, not proof that credentials or a remote request will succeed. If the command fails, returns no usable models, or does not expose enough information to validate a requested effort, report the missing evidence and ask for a choice that can be validated; never invent a model or supported level.

Determine the active native agent directory using the session's profile and environment. The default is `~/.omp/agent`; named profiles normally use `~/.omp/profiles/<name>/agent`, `PI_CONFIG_DIR` changes the config-root directory name, and `PI_CODING_AGENT_DIR` can override the default-profile agent directory. Resolve the actual active directory before writing. The rule target is `<active-agent-dir>/rules/pstack-models.md`. Consult `omp://context-files.md` and `omp://skills.md` if the active directory or rule discovery is unclear.

## 2. Load current choices

Read the target rule if it exists. Keep its budget, each recognized role's model or ordered list, and aliases as the current choices. Show any unrecognized or retired role lines that a rewrite would drop. Fill missing roles with `inherit-parent`. If no rule exists, start every role at `inherit-parent`, including each list role with one entry. Do not assume upstream Cursor model slugs are available in omp.

`inherit-parent` and `auto` are pstack aliases for the selected parent session model, not native model selectors. Do not pass either alias as `task.model`. Omitting `model` alone does not guarantee inheritance: native agent frontmatter and `task.agentModelOverrides` can select another model. When a role requires the parent identity, the runner must use the actual selected session provider/model and effort as an approved per-call selector when omission would resolve differently. If identity or per-call authorization is unavailable, report the blocker rather than claiming inheritance. Check `omp://tools/task.md` and `omp://task-agent-discovery.md` for current dispatch and approval rules.

## 3. Choose budget and roles

Ask the user for one budget, naming the current one if recorded:

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

Apply the selected target to each concrete choice, including list entries. Preserve its exact provider/model identity; use the highest supported effort at or below the target on `max > xhigh > high > medium > low > minimal > off`. Use `provider/id:effort`, not a made-up model-id suffix. If no supported level at or below the target is established, mark the entry as needing a choice. Models without controllable effort may use the bare `provider/id` only when their metadata establishes that no effort selector applies. Aliases remain unchanged. Do not silently replace a model with another family or provider.

Show all 17 role lines, their proposed values, any invalid or unresolved entries, and retired lines that would be removed. Offer the detected exact selectors and the two aliases; allow changes to any role. For list roles preserve entry order. `arena runners`, `architect runners`, and `interrogate reviewers` run one worker per entry, including aliases; list length sets fan-out. `swarm workers` is the default worker model unless a comparison assigns a model per arm.

`arena cross-judge pool` is an ordered candidate list for one judge, not a panel. Arena tries only a concrete model from a different model family than the actual parent session model, in list order; aliases never qualify as cross-family judges. Provider names alone do not prove different model families, especially through gateways. Before enabling a cross-family panel or judge, establish from reliable model identity metadata that the selected, available, authorized models are from the required distinct families. If that evidence or a suitable model is missing, leave that operation blocked and tell the user the prerequisite; do not substitute a same-family model or present aliases as diverse models. Alias-only defaults may be saved, but do not enable a cross-family operation.

## 4. Validate and confirm

Validate every concrete selector against the detected `provider` and `id` pair, every specified effort against that model's supported levels, and each list entry individually. Also check that per-call model selection is permitted and the selector is operator-approved for the intended task agent; availability alone is not authorization. An unavailable, unapproved, ambiguous, or unsupported choice needs a replacement or an explicit blocker. Never write an invalid selector. Keep the previous file untouched until the user explicitly confirms the complete proposed rule and any dropped lines. If they decline, cancel without writing.

## 5. Write the rule

After confirmation, create the target's `rules` directory if needed and replace only `<active-agent-dir>/rules/pstack-models.md`. Use `alwaysApply: true`, the chosen budget and target, and exactly one line for each role. The example uses aliases only:

```md
---
description: pstack per-role model choices (overrides skill defaults)
alwaysApply: true
---
# pstack model configuration. Missing roles inherit the selected parent session model.
# inherit-parent and auto are pstack aliases, not native task model selectors.
# budget: large (xhigh)
feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: inherit-parent
hardest tasks: inherit-parent
how explorer: inherit-parent
how explainer: inherit-parent
why investigators: inherit-parent
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: inherit-parent
arena cross-judge pool: inherit-parent
swarm workers: inherit-parent
architect runners: inherit-parent
interrogate reviewers: inherit-parent
```

Use the actual chosen budget and validated values in the written rule. Do not edit `config.yml`, Cursor rules, Claude files, or other settings. Tell the user the path and that a new session or session reset loads the rule; rerunning this skill updates it after confirmation.

## 6. Optional verification skills

If the project has no existing skill or harness for driving the real app, offer once to generate one with `/skill:pstack-create-verification-skill`. If the project has no formal verification skill, offer once to generate one with `/skill:pstack-create-formal-verification-skill`. On acceptance invoke the corresponding installed omp skill; use native project skill paths such as `.omp/skills/<name>/SKILL.md` for any generated project-local skill. On decline, move on.
