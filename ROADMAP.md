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
| Latest release | **v0.2.2** (npm `0.2.2`, published 2026-07-04) |
| `package.json` version | `0.2.2` (in sync with npm) |
| Release model | npm Trusted Publishing via GitHub Actions; auto-release on `package.json` version bump |
| CI | `npm run ci` = `typecheck` + `node --test` + `pack:check` |
| Test files | 8 (`commands`, `config`, `git-exec`, `prompts`, `registration`, `smoke`, `subagent-runner`, `tools`) |
| Open issues | 0 |
| Open PRs | dependency bumps (dependabot + devDep pinning) |

v0.2.2 shipped the sponsor/funding rollout. The next release (0.2.3 / 0.3.0)
will roll up the unreleased test-coverage additions and any maintenance seeds
landed below.

## Short-term goals (next 2–3 releases)

1. **Stabilize dependencies.** Land a single coherent devDependency pin so CI
   is reproducible and dependabot stops racing the manual pin PR.
2. **Close the CHANGELOG gap.** Backfill the missing `0.2.2` section and keep
   `[Unreleased]` honest so releases have accurate notes.
3. **Harden test coverage around the config/override paths** that are the most
   user-facing behavior (model routing + per-call override).
4. **Keep docs minimal and accurate** — README + `docs/` + this roadmap stay in
   sync; no fixed six-file doc set.
5. **Roadmap-driven seeding** — each week, promote one bounded seed below into
   a tracked issue and PR.

No breaking changes are planned. Anything that changes tool names, settings
keys, or command names is a minor (`0.x.0`) bump and must be called out in the
PR and CHANGELOG.

## Known technical debt

- **devDependency pin race.** Manual pin PR (DOT-850) and a dependabot group PR
  both touch `@earendil-works/*`; they conflict and one must win.
- **CHANGELOG hygiene.** The `0.2.2` release has no dedicated section; its
  sponsor item is stranded under `[Unreleased]`.
- **Dependabot branch drift.** A `github-actions` dependabot branch for
  `actions/checkout` lingers though workflows already reference `@v7`; needs
  triage/closure.
- **Override-path test gap.** The per-call `provider`/`model` override
  parameter is unit-tested indirectly but has no focused integration test.
- **Config-precedence test gap.** Project `.pi/settings.json` vs agent-dir
  precedence is implemented but not asserted by an explicit fixture.
- **No formatter/linter.** No Prettier/ESLint config; style is enforced only by
  `tsc --noEmit` and review.

## Candidate maintenance seeds

Each seed is intentionally bounded to one PR. Promote a seed to a GitHub issue
when scheduling it, then check it off here once the PR merges. Keep the
"Acceptance criteria" verbatim when promoting so the issue is self-contained.

Legend: `~time` = estimated focused effort; all targets are ≤ 90 min.

---

### Seed 1 — Resolve devDependency pin conflict (DOT-850 vs dependabot)

`~45 min` · dependencies

Merge one canonical devDependency update so `@earendil-works/*` is pinned to a
real range (not `latest`) and the lockfile is regenerated, then close the
superseded PR.

**Acceptance criteria**

- [ ] `package.json` has no `latest` for `@earendil-works/*` devDependencies
- [ ] `package-lock.json` regenerated and committed
- [ ] `npm run ci` passes
- [ ] The losing PR (dependabot group or DOT-850) is closed with a comment
      pointing at the winner

---

### Seed 2 — Backfill CHANGELOG `[0.2.2]` and clean `[Unreleased]`

`~30 min` · docs

The `0.2.2` release shipped the sponsor/funding rollout but has no CHANGELOG
section; its entry is stranded under `[Unreleased]`.

**Acceptance criteria**

- [ ] New `## [0.2.2] - 2026-07-04` section documents the sponsor/funding change
- [ ] `[Unreleased]` keeps only genuinely unreleased items (test additions)
- [ ] No behavior/code change in the PR

---

### Seed 3 — Close the stale `actions/checkout` dependabot branch

`~30 min` · dependencies / ci

The `dependabot/github_actions/actions/checkout-7` branch is already
satisfied: every workflow references `actions/checkout@v7`. Confirm, then
delete the stale branch (or close any associated PR with a reason). **One
branch per seed** — any additional stale dependabot branch becomes its own
follow-up seed so this stays a single 30-minute maintenance unit.

**Acceptance criteria**

- [ ] Confirmed all workflows already pin `actions/checkout@v7` or higher
- [ ] The `actions/checkout` dependabot branch is deleted, or its PR closed
      with a reason
- [ ] No workflow references a non-existent action version

---

### Seed 4 — Focused test for per-call model override

`~60 min` · tests

Add a focused test asserting that the `provider`/`model` tool parameters
override config routing and that override takes precedence over file config.

**Acceptance criteria**

- [ ] New test covers: override wins over config; override with only `model`;
      override with only `provider`; empty/whitespace override falls back
- [ ] `npm run ci` passes
- [ ] No production code change unless a real bug is found (then split it out)

---

### Seed 5 — Config-precedence fixture test (project vs agent dir)

`~60 min` · tests

Add a fixture-based test asserting project `.pi/settings.json` wins over the
agent-dir settings, and that malformed JSON is ignored gracefully.

**Acceptance criteria**

- [ ] Test uses temp dirs for both project and agent settings
- [ ] Asserts: project config wins; missing files → defaults; invalid JSON →
      ignored (no throw)
- [ ] `npm run ci` passes

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

## How to update this roadmap

- **On release:** move shipped items out of "Candidate seeds", refresh "Current
  release status", and bump the short-term goals.
- **On seed promotion:** create the GitHub issue, link it from the seed, and
  leave the seed here until the PR merges.
- **Keep seeds bounded.** If a seed grows past ~90 min, split it before
  promoting.
