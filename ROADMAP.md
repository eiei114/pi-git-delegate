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
| Latest release | **v0.2.11** (npm `0.2.11`, published 2026-09-30) |
| `package.json` version | `0.2.11` (in sync with npm) |
| Release model | npm Trusted Publishing via GitHub Actions; auto-release on `package.json` version bump |
| CI | `npm run ci` = `typecheck` + `node --test` + `pack:check` |
| Test files | 9 (`commands`, `config`, `git-exec`, `git-summary-pipeline`, `prompts`, `registration`, `smoke`, `subagent-runner`, `tools`) |
| Open issues | 0 |
| Open PRs | 1 (grouped Dependabot devDependency update) |
| DevDependencies | `@earendil-works/*` ^0.99.1; `@types/node` ^26.1.0 (resolved 26.4.1); `typebox` latest (resolved 1.3.27) |
| Audit | 1 high transitive devDependency finding (`brace-expansion` via the Pi SDK; not shipped in the package) |
| Last roadmap refresh | 2026-10-05 (DOT-2144) |

v0.2.11 shipped the Pi SDK `0.99.1` alignment. v0.2.10 and v0.2.9 were
periodic patch releases, while v0.2.5 rolled up the 2026-08-22 managed OSS
dependency and maintenance batch. GitHub currently has no open issues and one
open grouped Dependabot update for `typebox` and `@types/node`; its CI is green.
The next release should roll up any remaining maintenance seeds listed below.

## Short-term goals (next 2–3 releases)

1. **Harden test coverage around the config/override paths** that are the most
   user-facing behavior (model routing + per-call override).
2. **Keep docs minimal and accurate** — README + `docs/` + this roadmap stay in
   sync; no fixed six-file doc set.
3. **Roadmap-driven seeding** — each week, promote one bounded seed below into
   a tracked issue and PR.
4. **Triage open dependabot PRs** — when dependabot opens devDependency bumps,
   merge verified updates or close superseded ones so the PR queue stays
   actionable. One grouped update is currently open for `typebox` and
   `@types/node`.
5. **Keep the candidate seed pool stocked** — maintain at least three open,
   bounded seeds so the weekly maintenance seed planner always has work to
   promote without re-deriving project state.

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
wired into `npm run ci` so style drift is caught automatically. Style is
currently enforced only by `tsc --noEmit` and review; a formatter closes the
gap called out in "Known technical debt".

**Acceptance criteria**

- [ ] `.prettierrc.json` added with a small, intentional ruleset
- [ ] `npm run format:check` runs in CI
- [ ] Existing files formatted in the same PR (no behavior change)

---

### Seed 10 — Expand `git-exec` error-path test coverage

`~60 min` · test / correctness

`tests/git-exec.test.mjs` covers success and invalid-command paths only.
Add focused tests for non-zero exit with stderr populated and for commands
run outside a git repository. These paths feed user-facing tool errors and
should not regress silently.

**Acceptance criteria**

- [ ] Test for git command failure with stderr message preserved
- [ ] Test for `runGit` invoked in a non-repo directory (non-zero status)
- [ ] `npm run ci` passes; no production code changes unless a bug is found

---

### Seed 11 — Add adapter-level model-routing regression tests

`~45 min` · test / correctness

The shared `createGitSummaryPipelineOptions` adapter boundary landed in
DOT-2084. The helper itself is covered, but integration coverage currently
exercises configured and per-call model routing only through
`git_blame_summary`. Add focused tool-level tests for `git_diff_summary` and
`git_log_summary` so each adapter remains wired through the shared pipeline.

**Acceptance criteria**

- [ ] Diff and log tests assert configured model routing reaches the result details
- [ ] Diff and log tests each cover a per-call model override
- [ ] `npm run ci` passes; no production code changes unless a regression is found

---

### Seed 12 — Resolve the transitive npm audit finding

`~60 min` · dependency health / security

`npm audit` currently reports one high-severity `brace-expansion` finding in
the dev-only dependency chain `@earendil-works/pi-coding-agent` → `minimatch`
→ `brace-expansion`. Determine whether an upstream Pi SDK update or a narrow
lockfile override is appropriate; avoid a broad, unreviewed audit fix.

**Acceptance criteria**

- [ ] The dependency path and an upstream update or narrow override are verified
- [ ] `npm audit` no longer reports this high-severity finding, or the upstream blocker is documented
- [ ] `npm run ci` passes and the published package contents remain unchanged

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
- **Seed 7 — Triage and merge open dependabot devDependency bump** — merged
  dependabot PR #48 in DOT-1745; lockfile resolved `@earendil-works/*`
  devDependencies to 0.84.4 within the existing `^0.84.1` manifest ranges,
  peerDependencies (`*`) unchanged, open PR queue cleared.
- **Post-Seed 7 Pi devDependency alignment (DOT-1776)** — landed in PR #55;
  manifest ranges bumped from `^0.84.1` to `^0.85.1`, lockfile refreshed,
  npm audit moderate findings cleared.
- **Dependabot `@types/node` bump (#54)** — merged 2026-09-07; `@types/node`
  26.2.0 → 26.4.1 within the npm-dev-minor-patch group.
- **Seed 8 — Add ROADMAP candidate-count smoke test** — landed in PR #59
  (DOT-1951); `tests/smoke.test.mjs` now guards against fewer than three active
  candidate seeds.
- **Seed 9 — Document subagent cancellation (`AbortSignal`)** — landed in PR
  #74 (DOT-2056); `docs/examples.md` now records cancellation and retry
  boundaries for delegated subagents.

## How to update this roadmap

- **On release:** move shipped items out of "Candidate seeds", refresh "Current
  release status", and bump the short-term goals.
- **On seed promotion:** create the GitHub issue, link it from the seed, and
  leave the seed here until the PR merges.
- **Keep seeds bounded.** If a seed grows past ~90 min, split it before
  promoting.
