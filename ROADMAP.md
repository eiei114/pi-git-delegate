# Roadmap

This roadmap tracks the maintenance direction for **pi-git-delegate** so the
weekly maintenance seed planner can pick the next bounded micro-task without
re-deriving project state each run.

It is a living document: update it whenever a release ships, a seed is promoted
to an issue, or priorities shift. Keep seeds scoped to **30–90 minutes** of
focused work so they stay one-PR-sized.

## Project purpose

Pi Git Delegate is a [Pi](https://pi.dev) extension that delegates heavy git
read operations (`diff`, `log`, `blame`) to cheaper subagents, returning only a
concise summary to the parent session. The goal is **lower cost** and a
**clean parent context window** — delegate only when input is large and output
is small.

The surface is intentionally small and stable:

- 3 typed tools — `git_diff_summary`, `git_log_summary`, `git_blame_summary`
- 2 slash commands — `/git-delegate:configure`, `/git-delegate:status`
- Optional per-tool model routing in `.pi/settings.json` (with `diffModel` /
  `logModel` / `blameModel` shorthand)

Maintenance priority order: **correctness &gt; context hygiene &gt; dependency
health &gt; docs/examples &gt; new features.** New features are out of scope
unless they directly serve the cost/context-leverage thesis.

## Current release status

| Item | Value |
|---|---|
| Latest release | **v0.2.4** (npm `0.2.4`, published 2026-08-04) |
| `package.json` version | `0.2.4` (in sync with npm) |
| Release model | npm Trusted Publishing via GitHub Actions; auto-release on `package.json` version bump |
| CI | `npm run ci` = `typecheck` + `node --test` + `pack:check` |
| Test files | 8 (`commands`, `config`, `git-exec`, `prompts`, `registration`, `smoke`, `subagent-runner`, `tools`) |
| Open issues | 0 |
| Open PRs | dependabot dev bumps (#42, #43) |

v0.2.4 shipped the Discord release webhook verification bump. v0.2.3 added the
devDependency pin, CI template alignment, expanded test coverage, and CHANGELOG
hygiene. The next release will roll up any remaining maintenance seeds listed
below.

## Short-term goals (next 2–3 releases)

1. **Harden test coverage around the config/override paths** that are the most
   user-facing behavior (model routing + per-call override).
2. **Keep docs minimal and accurate** — README + `docs/` + this roadmap stay in
   sync; no fixed six-file doc set.
3. **Roadmap-driven seeding** — each week, promote one bounded seed below into
   a tracked issue and PR.
4. **Triage stale dependabot branches** — close or delete branches whose bumps
   are already satisfied by current workflow pins.

No breaking changes are planned. Anything that changes tool names, settings
keys, or command names is a minor (`0.x.0`) bump and must be called out in the
PR and CHANGELOG.

## Known technical debt

- **No formatter/linter.** No Prettier/ESLint config; style is enforced only by
  `tsc --noEmit` and review.

## Candidate maintenance seeds

Each seed is intentionally bounded to one PR. Promote a seed to a GitHub issue
when scheduling it, then check it off here once the PR merges. Keep the
"Acceptance criteria" verbatim when promoting so the issue is self-contained.

Legend: `~time` = estimated focused effort; all targets are ≤ 90 min.

---

### Seed 6 — Add minimal Prettier config + format check

`~45 min` · tooling

Add a minimal, non-prescriptive Prettier config and a `format:check` script
wired into `npm run ci` so style drift is caught automatically.

**Acceptance criteria**

- [ ] `.prettierrc.json` added with a small, intentional ruleset
- [ ] `npm run format:check` runs in CI
- [ ] Existing files formatted in the same PR (no behavior change)

---

## Completed maintenance seeds

- **Seed 1 — Resolve devDependency pin conflict** — landed in PR #34 (DOT-1229);
  `@earendil-works/*` pinned to `^0.80.6`, superseded dependabot PR closed.
- **Seed 2 — Backfill CHANGELOG `[0.2.2]` and clean `[Unreleased]`** — landed
  in PR #33 (DOT-1168); `[Unreleased]` is empty on `0.2.3`.
- **Seed 4 — Focused test for per-call model override** — landed in PR for
  DOT-1484; partial override and whitespace fallback paths covered in
  `tests/config.test.mjs`.
- **Seed 5 — Config-precedence fixture test** — landed in PR #39 (DOT-1374);
  project vs agent-dir precedence and invalid JSON fallback covered.
- **Seed 3 — Close the stale `actions/checkout` dependabot branch** — verified
  in DOT-1540; all workflows pin `actions/checkout@v7`, and dependabot PR #6
  merged 2026-06-24.

## How to update this roadmap

- **On release:** move shipped items out of "Candidate seeds", refresh "Current
  release status", and bump the short-term goals.
- **On seed promotion:** create the GitHub issue, link it from the seed, and
  leave the seed here until the PR merges.
- **Keep seeds bounded.** If a seed grows past ~90 min, split it before
  promoting.
