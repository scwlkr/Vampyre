# 0002 Project Architecture

## Decision

Document Vampyre as a daemon-first runtime system:

- One central daemon on `wlkrlab`.
- Runtime workspace under `~/vampyre`.
- SQLite Operational State.
- GitHub as durable review/approval surface.
- Telegram as notification and low-risk command surface.
- Worktree Build Agent for project-changing work.
- GitHub Actions native validation for macOS projects.

## Reason

This matches the implemented source, tests, current status, and historical ADRs.
It also prevents docs from drifting back to a manual CLI-first framing.

## Consequences

- CLI reference docs describe operator surfaces, not the product identity.
- Runtime proof remains important for daemon behavior.
- Future managed-project work should build missing daemon capability when that
  capability is the blocker.
