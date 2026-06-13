# Examples

Pi Git Delegate ships typed tools for delegating heavy git read operations to subagents.

## Extension

`extensions/index.ts` registers:

- `git_diff_summary`
- `git_log_summary`
- `git_blame_summary`
- `/git-delegate:configure`
- `/git-delegate:status`

Try it locally:

```bash
pi -e .
```

Then call a tool from Pi:

```txt
git_diff_summary({ref: "HEAD~3"})
git_log_summary({range: "HEAD~5..HEAD"})
git_blame_summary({path: "lib/config.ts"})
```

## Settings

Configure per-tool subagent models:

```txt
/git-delegate:configure
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

`null` uses the current session provider/model.
