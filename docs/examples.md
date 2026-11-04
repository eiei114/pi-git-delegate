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

Then ask Pi in chat to use a tool. Pi calls them from your request; the JSON
notation below only shows the arguments each tool accepts.

```txt
Summarize the last three commits' changes with git_diff_summary (ref HEAD~3).
Give me a digest of the commits in HEAD~5..HEAD with git_log_summary.
Who last changed lib/config.ts? Use git_blame_summary.
```

Equivalent tool arguments:

```txt
git_diff_summary   { ref: "HEAD~3" }
git_log_summary    { range: "HEAD~5..HEAD" }
git_blame_summary  { path: "lib/config.ts" }
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
    "diff": { "provider": "anthropic", "model": "claude-haiku-4-5" },
    "log": { "provider": null, "model": null },
    "blame": { "provider": null, "model": null }
  }
}
```

Model-only shorthand is also supported (uses the session provider):

```json
{
  "pi-git-delegate": {
    "diffModel": "claude-haiku-4-5",
    "logModel": "gpt-4.1-mini",
    "blameModel": "gemini-2.5-flash"
  }
}
```

`null` uses the current session provider/model.

Every id above must exist in your Pi catalog. `pi --list-models <pattern>`
lists the ids with their owning provider, for example `claude-haiku-4-5` on
`anthropic`. Settings load without validating ids, so a typo only surfaces as
a `Model "..." not found` warning when the subagent starts.

## Failure recovery and retry boundaries

The delegated tools are read-only, but each call has two separate steps:

1. The extension runs the local `git` command in the current working directory.
2. Only when that command succeeds with non-empty output does it start a `pi`
   subagent to summarize that output.

If Git exits non-zero, the tool normally returns Git's stderr (or stdout when
stderr is empty) and does **not** start a subagent. The log tool treats its
known no-commits-in-range errors as the normal `No commits in range.` result.
Other common causes such as a missing repository, invalid revision, or missing
blame path must be fixed in the working directory or tool arguments before
retrying. An empty successful result (for example, no diff) is also returned
directly without delegation.

If the subagent cannot produce a summary, the tool returns its error instead;
the raw Git output is not included in the tool response. Retry the same tool
only for a transient local or model/transport failure, or after correcting the
reported Git error. Retrying does not mutate the repository: it reruns the
read-only Git command and, when applicable, an isolated subagent process.

For example, from a Pi session:

```txt
Summarize the changes since HEAD~3 with git_diff_summary.
```

That tool call takes `ref: "HEAD~3"`.

If this reports `unknown revision`, use an existing revision and call the tool
again. Do not use these delegated tools for write operations such as `git
commit` or `git push`; perform those directly in the parent session. A caller
that supplies an `AbortSignal` may cancel the subagent; the child
process may remain alive if it handles or ignores `SIGTERM`, and the Git step
itself is not retried automatically.
