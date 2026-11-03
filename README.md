# pstack for omp

Unofficial omp adaptation of [Cursor's pstack](https://github.com/cursor/plugins/tree/main/pstack). Includes all 58 skills, both native agents, playbooks, scripts, documentation, and supporting assets from the pinned upstream version.

This is a declarative native omp plugin. It has no runtime extension, install hook, root dependencies, or automatic updater. Installation does not copy credentials or write model settings.

## Install on a new computer

Install omp and Git, then configure Git access to this private repository. For SSH, authorize a GitHub SSH key on the new computer first.

```sh
omp plugin install git:git@github.com:garesuta/pstack-omp#v0.1.0
```

Start a new omp session after installation. Existing sessions and their children may retain an old skill catalog.

```text
/skill:pstack-poteto-help Which skill fits my task?
/skill:pstack-poteto-mode Investigate this issue without changing code.
/skill:pstack-how How does this module work?
/skill:pstack-tdd Fix this bug with a failing regression test first.
/skill:pstack-setup-pstack
```

Every exposed upstream skill has the `pstack-` prefix. Upstream `setup-pstack`, for example, becomes `pstack-setup-pstack`. The two agent selectors are `pstack-poteto-agent` and `pstack-comment-sicko`.

The plugin manager owns installation and discovery. No manual links under `.agents/skills` or the native agent directory are needed. Model-provider authentication is separate and must be configured on each computer. No Claude configuration change is required.

## Models and capability limits

Read the [omp adapter](docs/harness/omp.md) before following upstream instructions. It resolves the package location at runtime and overrides Cursor and Claude tool names, model handling, paths, and authorization assumptions.

Without a pstack model rule, roles use the actual parent session identity when native task policy permits. Native agent overrides can prevent inheritance; the adapter requires reporting that conflict. Use `pstack-setup-pstack` to detect available models, choose a budget, and confirm all 17 role lines before writing the active native agent directory's `rules/pstack-models.md`. Setup does not write `config.yml`, Cursor rules, or Claude files.

Alias-only defaults do not provide cross-family judging. Arena and other workflows requiring different model families need suitable authorized models. Cursor cloud agents, Automations, secret-request APIs, and external companion skills have no presumed omp equivalents. Missing required capabilities block the affected workflow; they are not simulated or silently skipped. Workspace isolation is not a VM or network sandbox. User and tool authorization always overrides upstream autonomy instructions.

Bundled scripts retain their upstream prerequisites and side effects. Watcher bootstrap may install dependencies, statechart may provision Java/TLC through mise, and some workflows access external services or modify repositories. Installing this plugin does not execute those scripts or authorize those operations.

## Verify installation and relocation

For development, clone the repo and use a local plugin link:

```sh
git clone git@github.com:garesuta/pstack-omp.git
cd pstack-omp
omp plugin link "$PWD"
node scripts/verify-install.mjs
```

The dependency-free verifier uses a disposable HOME and workspace. It checks the complete skill collection, local resource links, explicit command registration, native agent discovery, and plugin disable/enable/uninstall/reinstall behavior. It preserves an unrelated sentinel skill. Its inert loopback model exists only for nonprompt RPC discovery; it makes no model requests and needs no model credentials.

To check a published Git release instead of the local copy:

```sh
node scripts/verify-install.mjs git:git@github.com:garesuta/pstack-omp#v0.1.0
```

Private Git access still needs caller-authorized authentication, such as an SSH agent. The verifier does not copy credentials into its disposable HOME. Safe model-backed workflow checks are separate from this offline discovery/lifecycle check. Do not run shipping, automation, provisioning, or destructive cleanup against live targets merely to verify installation.

## Update, disable, and remove

Releases are pinned. To move to a later release, install its explicit tag using the same command with the new version. Upgrading a dependency pinned to `v0.1.0` does not select a newer tag automatically.

```sh
omp plugin disable pstack-omp
omp plugin enable pstack-omp
omp plugin uninstall pstack-omp
```

Restart the session after lifecycle changes. Uninstalling the plugin should not delete user-created model rules or generated project skills.

## Migrating an earlier manual installation

Install and verify this plugin first. Then remove only manual `pstack-*` skill and agent symlinks whose targets belong to the old adaptation. Never remove shared directories or unrelated skills. Retain the old adaptation until rollback is verified; restoring its owned links restores that prior state. Keep the original upstream omp marketplace copy disabled to avoid activating a second distribution. The separate Claude installation remains independent.

## Upstream maintenance and license

[UPSTREAM.json](UPSTREAM.json) records pstack 0.15.36, the exact source commit, and local adaptations. [UPSTREAM-README.md](UPSTREAM-README.md) retains the upstream guide; its installation commands target upstream harnesses, not this package.

Updates are deliberate: stage a new pinned upstream revision, preserve its complete dependency tree and license, reapply and review the omp adaptation, run isolated verification and relevant bounded workflow checks, then publish a new tagged release. This repository's maintainer owns that process; upstream does not maintain this adaptation.

The upstream MIT [LICENSE](LICENSE) is preserved. This project is not an official Cursor or omp release.
