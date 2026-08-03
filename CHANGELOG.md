# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [Unreleased]

## [0.2.4] - 2026-08-04

### Changed

- Bump package version for the Discord release webhook verification.

## [0.2.3] - 2026-07-21

### Changed

- Pin `@earendil-works/*` devDependencies to `^0.80.6` for reproducible CI.
- CI workflow aligns with the Pi extension template (`oven-sh/setup-bun@v2` before `npm ci`).
- Document `diffModel` / `logModel` / `blameModel` shorthand in configure help and `docs/examples.md`.

### Added

- `ROADMAP.md` — maintenance direction, current release status, and bounded (30–90 min) candidate maintenance seeds.
- Unit tests for `git-exec`, `prompts`, and `subagent-runner` helpers.
- Config smoke tests for `logModel` and `blameModel` shorthand routing.
- Integration test for empty `git_blame_summary` output.
- CI workflow smoke test verifying `npm run ci` runs on push/PR.
- `docs/incidents/2026-07-04-failed-npm-publish.md` — postmortem for a failed Trusted Publishing run.

## [0.2.2] - 2026-07-04

### Changed

- Add Buy Me a Coffee sponsor button to README and native GitHub funding link via `.github/FUNDING.yml`.

## [0.2.1] - 2026-06-27

### Changed

- README: add canonical `Quick start` section after `Install`, aligned with the Pi OSS extension template.
- README: preserve delegation guidance, configuration, and tool examples under `When to delegate`, `Configuration`, and `Tool examples`.

## [0.2.0] - 2026-06-13

### Added

- `git_diff_summary` typed tool — delegates `git diff` summarization to a subagent.
- `git_log_summary` typed tool — delegates `git log` digest generation to a subagent.
- `git_blame_summary` typed tool — delegates `git blame` contributor context to a subagent.
- `/git-delegate:configure` and `/git-delegate:status` commands for settings help.
- Removed template `skills/`, `prompts/`, and `themes/` resources to avoid Pi resource conflicts and invalid theme warnings.

## [0.1.2] - 2026-06-04

### Changed

- README and `docs/template-checklist.md` now follow the Pi OSS minimal-docs policy: `docs/` is optional, with explicit post-generation cleanup for template bootstrap docs.
- Template bootstrap docs (`github-template.md`, `repository-settings.md`, `typescript.md`) are labeled for delete-or-merge after setup.

## [0.1.1] - 2026-06-01

### Changed

- Publish workflow now supports npm publishing on merged package version bumps in addition to tags, releases, and manual dispatch.
- Publish workflow now installs a current npm CLI so npm Trusted Publishing OIDC is supported.
- CI and publish workflow commands no longer include literal trailing `\\n` text.

## [0.1.0] - YYYY-MM-DD

### Added

- Initial Pi package template.
- Example extension, Agent Skill, prompt, and theme.
- CI and npm Trusted Publishing workflow.

