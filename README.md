# Pi Git Delegate

[![CI](https://github.com/eiei114/pi-git-delegate/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-git-delegate/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-git-delegate/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-git-delegate/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-git-delegate.svg)](https://www.npmjs.com/package/pi-git-delegate)
[![npm downloads](https://img.shields.io/npm/dm/pi-git-delegate.svg)](https://www.npmjs.com/package/pi-git-delegate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)
<a href="https://buymeacoffee.com/ekawano114m"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

> Delegate git operations (diff/log/blame) to cheaper models via subagents — keeping parent context clean and cutting costs.

## What this is

Pi Git Delegate provides typed tools that internally delegate heavy git read operations (diff, log, blame) to subagents. The subagent processes the raw git output and returns only a concise summary to the parent session. This prevents large diffs from polluting the parent's context window and lets you route expensive operations to cheaper models.

## When to delegate

The cost leverage principle: **delegate only when input is large and output is small.**

| Operation | Delegation | Why |
|---|---|---|
| `git diff` (→ summary) | ✅ Delegate | Diff is large (1000+ tokens), summary is tiny |
| `git log` (→ changelog) | ✅ Delegate | Many commits → compact digest |
| `git blame` (→ context) | ✅ Delegate | Full blame is verbose; what matters is who/when/why |
| `git status` | ❌ Direct | Output is tiny; subagent overhead not worth it |
| `git push` / `git commit` | ❌ Direct | Write operations stay in parent for safety |

## Features

- **`git_diff_summary`** — delegate `git diff` to a subagent, return a 1-3 sentence summary
- **`git_log_summary`** — delegate `git log` range, return a structured digest
- **`git_blame_summary`** — delegate `git blame`, return who changed what and why
- **Per-tool model routing** — set `provider` and `model` per tool in `.pi/settings.json` (`null` uses the session defaults)
- **`/git-delegate:configure`** — interactive help for writing the settings block
- **`/git-delegate:status`** — show current model routing and example JSON
- **Model override parameter** — override model per-call via tool parameter
- **Fallback to current model** — no config needed; uses the parent session model
- **Write guard** — no write operations exposed as tools

## Install

```bash
pi install npm:pi-git-delegate
```

Install locally (project-scoped):

```bash
pi install npm:pi-git-delegate -l
```

Try without installing:

```bash
pi -e .
```

## Quick start

After installing (see above) or running `pi -e .` from this repo, call each tool in Pi:

```txt
git_diff_summary({ref: "HEAD~3"})
git_log_summary({range: "main..feature"})
git_blame_summary({path: "src/auth.ts"})
```

The tools are registered automatically — no extra setup required.

## Configuration

Model routing is optional. Run in Pi:

```txt
/git-delegate:configure
```

This shows what each key does, prints a starter JSON block, and can save it to `.pi/settings.json` interactively.

Check the current routing anytime with:

```txt
/git-delegate:status
```

Manual example for `.pi/settings.json`:

```json
{
  "pi-git-delegate": {
    "diff": { "provider": "anthropic", "model": "claude-3-5-haiku-latest" },
    "log": { "provider": null, "model": null },
    "blame": { "provider": null, "model": null }
  }
}
```

`null` means "use the current session provider/model".

## Tool examples

Once installed, the tools are available automatically. Pi calls them via `pi list`.

```txt
git_diff_summary({ref: "HEAD~3"})
→ "feat: add avatar upload with resize (3 files, 2 commits)"

git_log_summary({range: "main..feature"})
→ "3 commits: feat(avatar), fix(crop), chore(deps)"

git_blame_summary({path: "src/auth.ts"})
→ "src/auth.ts: 3 authors, most recent by @alice (2026-06-01)"
```

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoints |
| `lib/` | Shared TypeScript helpers |
| `docs/` | Optional supporting docs |

## Development

```bash
npm install
npm run ci
```

## Release

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push
```

See [`docs/release.md`](docs/release.md) for setup details.

## Docs

`docs/` is optional supporting documentation, not a fixed six-file set. README stays the GitHub/npm entrypoint; add `docs/*.md` only when they help users or maintainers.

- [`docs/examples.md`](docs/examples.md) — tool usage examples
- [`docs/release.md`](docs/release.md) — Trusted Publishing details (README Release summarizes the flow)

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-git-delegate
- GitHub: https://github.com/eiei114/pi-git-delegate
- Issues: https://github.com/eiei114/pi-git-delegate/issues

## License

MIT
