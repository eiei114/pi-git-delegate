# Incident: failed `Publish to npm` run 28704535034 (2026-07-04)

Investigation-only record for [DOT-885]. Documents the failed `Publish to npm` run,
classifies the cause, and lists the smallest safe correction options. **No release
workflow, package version, changelog, npm registry state, or release was changed to
produce this report.**

- Failed run: <https://github.com/eiei114/pi-git-delegate/actions/runs/28704535034>
- Workflow: `Publish to npm` (`.github/workflows/publish.yml`)
- Package: `pi-git-delegate`
- Version in scope: `0.2.2`

## TL;DR — classification

**Duplicate-version rejection**, caused by a **trigger/configuration** race:

a `package.json` version bump pushed to `main` fired `publish.yml` **twice at once**
(direct push-to-main trigger **and** `auto-release.yml`'s explicit `workflow_dispatch`).
The push-triggered run published `0.2.2` first; the dispatch-triggered run then tried
to publish the same version and was rejected with
`npm error You cannot publish over the previously published versions: 0.2.2.`
The "Skip already published version" guard did not catch it because of npm read-replica
lag (~3 s) between the write and the dispatch run's `npm view` lookup.

This is **not** a Trusted Publishing / authentication failure: authentication succeeded
(the request reached npm's duplicate-version check, which requires valid credentials).

## Failed run facts (evidence)

| Field | Value | Source |
| --- | --- | --- |
| Run ID | `28704535034` | run URL |
| Event | `workflow_dispatch` | `gh run view` |
| Ref / inputs.ref | `v0.2.2` (tag) | run `head_branch`, checkout `ref: v0.2.2` |
| Head SHA | `fce277dc3d2b76a83c1197f4cf5c6098c568f2b9` | run API |
| Triggering actor | `github-actions[bot]` (= `auto-release.yml`) | run API |
| Started / finished | `2026-07-04T11:18:56Z` / `11:19:29Z` (UTC) | run API |
| Conclusion | `failure` | run API |
| Failed step | `Publish to npm` (`.github#41`) | run annotations |
| Package version | `0.2.2` | `npm notice 📦  pi-git-delegate@0.2.2` |

Step-level outcomes for the failed run:

- `Checkout` → `Setup Node.js` → `Ensure npm supports trusted publishing` →
  `Install dependencies` → `Validate package` (`npm run ci`) → all **passed**.
- `Skip already published version` → **passed with `skip=false`** (i.e. it believed
  `0.2.2` was not yet on npm).
- `Publish to npm` (`npm publish --access public`) → **failed**:

  ```text
  npm error You cannot publish over the previously published versions: 0.2.2.
  npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-07-04T11_19_25_631Z-debug-0.log
  ##[error]Process completed with exit code 1.
  ```

Secondary observation (not the cause): the resolved environment of the `Publish to npm`
step contained a masked `NODE_AUTH_TOKEN` (shown as `XXXXX-XXXXX-XXXXX-XXXXX`). This
indicates a registry credential is configured and was accepted by npm. It should be
reconciled with `docs/release.md`, which states no `NPM_TOKEN` / long-lived token is
used (Trusted Publishing via OIDC). See "Follow-up (auth clarity)" below.

## Why the skip guard missed it — the concurrent runs

Two `publish.yml` runs fired ~9 s apart from the **same** `package.json` bump
(commit `a6b18d3` "chore: bump patch version for sponsor rollout", merged as `fce277d`):

| Run | Event | Ref | Started (UTC) | Result |
| --- | --- | --- | --- | --- |
| `28704532379` | `push` (main) | `main` | `2026-07-04T11:18:47Z` | **success** — published `0.2.2` |
| `28704535034` | `workflow_dispatch` | `v0.2.2` | `2026-07-04T11:18:56Z` | **failure** — duplicate version |

Supporting runs:

- `auto-release.yml` run `28704532381` (`push` main, started `11:18:47Z`, **success**)
  created tag + GitHub Release `v0.2.2` (release `createdAt` `11:18:45Z`) and dispatched
  `publish.yml` on `ref=v0.2.2` → the failed run `28704535034`.

npm public state (read-only `npm view`, recorded `2026-07-15`):

```json
{
  "dist-tags": { "latest": "0.2.2" },
  "time": {
    "0.2.0": "2026-06-13T13:11:49.420Z",
    "0.1.x / 0.2.1": "...",
    "0.2.2": "2026-07-04T11:19:22.326Z",
    "modified": "2026-07-04T11:19:22.595Z"
  }
}
```

So `0.2.2` **is** public, published by the push-triggered run at `11:19:22.326Z`.
The dispatch run's `Skip already published version` step resolved `skip=false` because
its `npm view pi-git-delegate@0.2.2` returned `E404` at roughly `11:19:25` — about
**3 seconds** after the real publish — i.e. stale read-replica data. The subsequent
`npm publish` hit the authoritative write path and was rejected as a duplicate.

## Trigger/configuration root cause

`publish.yml` `on:` block (unchanged since the failed run — `git diff fce277d HEAD
.github/workflows/publish.yml` is empty):

```yaml
on:
  push:
    branches: [main]
    paths: [package.json, package-lock.json, .github/workflows/publish.yml]
    tags: ['v*.*.*']
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      ref: { description: 'Git ref to publish', required: false, type: string }
```

`auto-release.yml` `on:` block:

```yaml
on:
  push:
    branches: [main]
    paths: [package.json]
```

A `package.json` version bump on `main` therefore starts **two** publish pipelines on
the same version:

1. **Direct** — `publish.yml` fires on `push` to `main` (path `package.json`).
2. **Indirect** — `auto-release.yml` fires on the same push, creates `v<version>` tag +
   release, then `gh workflow run publish.yml --ref "$TAG" -f ref="$TAG"`.

The concurrency group `npm-publish-${{ github.event.inputs.ref || github.ref }}` does
**not** serialize them: the push run's `github.ref` is `refs/heads/main`, while the
dispatch run's resolved key is `v0.2.2` → different groups. The only protection is the
"Skip already published version" step, which loses to the ~3 s read-replica window.

> Note: `docs/release.md` already states the design intent — "keep one explicit handoff
> path" — because `GITHUB_TOKEN`-created tags/releases do not reliably fan out via
> `push.tags` / `release.published`. The unhandled case is the **direct push-to-main
> path** in `publish.yml`, which is what produced the duplicate fire here.

## Reproducible non-publish check

These commands are **read-only** (no publish, no rerun, no version/changelog change)
and reproduce the evidence above:

```bash
# 1. Confirm 0.2.2 is public on npm (no write).
npm view pi-git-delegate@0.2.2 version          # -> 0.2.2
npm view pi-git-delegate dist-tags time --json  # -> latest 0.2.2; 0.2.2 published 2026-07-04T11:19:22.326Z

# 2. Re-read the failure without rerunning anything.
gh run view 28704535034 --repo eiei114/pi-git-delegate              # event=workflow_dispatch, ref=v0.2.2, failed at "Publish to npm"
gh run view 28704535034 --repo eiei114/pi-git-delegate --log-failed \
  | grep -E "cannot publish over|Run npm publish"                  # -> "You cannot publish over the previously published versions: 0.2.2."

# 3. See the concurrent winner that published 0.2.2.
gh run list --repo eiei114/pi-git-delegate --workflow=publish.yml --limit 3 \
  --json event,headBranch,status,conclusion,createdAt             # 11:18:47Z push main SUCCESS; 11:18:56Z workflow_dispatch FAILURE

# 4. Static check for the dual-trigger hazard (no network).
grep -nE "on:|push:|branches:|paths:|tags:|workflow_dispatch|gh workflow run" \
  .github/workflows/publish.yml .github/workflows/auto-release.yml
```

Local validation for this documentation-only change:

```bash
npm install   # or npm ci
npm run ci    # typecheck + node:test + npm pack --dry-run  -> must pass
```

## Minimal safe correction options

For a **separate** correction issue (human-owned release flow). Not applied here.

Ranked smallest/risk → larger:

1. **Make duplicate-version non-fatal (smallest, recommended).** Treat
   "cannot publish over the previously published versions" from `npm publish` as a
   soft success (the desired end state — version on npm — already holds), and/or retry
   the `npm view` lookup in "Skip already published version" with short backoff before
   deciding. Pure workflow-step logic; no trigger restructuring, no new permissions.
2. **Remove the redundant direct trigger.** Drop `branches: [main]` + the
   `package.json`/`package-lock.json` entries from `publish.yml`'s `on.push.paths` so
   publishing happens only through `auto-release.yml`'s explicit dispatch (and the
   manual `tags`/`release`/`workflow_dispatch` paths). Matches the documented
   "one explicit handoff path" guardrail. Keep `npm version patch && git push --tags`
   working via the `tags: v*.*.*` trigger.
3. **Serialize the two paths.** Make the concurrency group derive from the package
   version (e.g. read `package.json` version into the group key) so the push and
   dispatch runs queue instead of race. Still pair with option 1 — the loser must exit
   cleanly once the version is published.
4. **Follow-up (auth clarity).** Reconcile the masked `NODE_AUTH_TOKEN` seen in the
   publish step env with `docs/release.md` ("Do not add `NPM_TOKEN`"). Confirm whether
   npm Trusted Publishing (OIDC) or a legacy `NODE_AUTH_TOKEN` secret is the live
   credential, and remove the legacy token if OIDC is intended. Independent of this
   incident's duplicate-version cause.

Pick **option 1** as the minimal fix; **option 2** removes the race at the source.
Open a dedicated correction issue before touching the release workflows — release and
publish remain human-owned.

## Out of scope (this issue)

- Editing `publish.yml` / `auto-release.yml`.
- Publishing, rerunning the workflow, bumping the version, or editing `CHANGELOG.md`.
- Changing npm registry state or GitHub releases.
