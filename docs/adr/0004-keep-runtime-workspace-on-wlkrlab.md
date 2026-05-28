# Keep the runtime workspace on wlkrlab

Vampyre's Runtime Workspace will live entirely on `wlkrlab` under one configurable Workspace Root, such as `~/vampyre` or `~/wlkr/vampyre`. Keeping the Project Registry, SQLite state, logs, cloned repos, disposable worktrees, run journals, reports, and artifacts together on the runtime host avoids split-brain behavior between the homelab and the MacBook.

## Consequences

- Managed project clones should live under the Workspace Root, not in random existing checkouts.
- Build-agent branches and run journals should be created on `wlkrlab`.
- The MacBook should inspect and operate Vampyre over SSH rather than becoming part of runtime state.
