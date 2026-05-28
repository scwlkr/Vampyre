# Run one central daemon on wlkrlab

Vampyre will run as one central daemon on the `wlkrlab` homelab server, not as per-project daemon instances and not as a production process on the current MacBook. This preserves Vampyre's always-on identity, avoids managing many bots or service processes, and lets the MacBook remain an operator workstation that administers the runtime over `ssh wlkrlab`.

## Consequences

- Project-specific behavior must live in Project Profiles loaded by the central daemon.
- Runtime state, logs, cloned repos, worktrees, and build artifacts belong on `wlkrlab`.
- The daemon must handle one blocked project without stopping the whole Project Portfolio.
