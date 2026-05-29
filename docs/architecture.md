# Architecture

This compatibility page points to the modular architecture docs.

Read [architecture/index.md](./architecture/index.md) first. It links to:

- [System overview](./architecture/system-overview.md)
- [File layout](./architecture/file-layout.md)
- [Data flow](./architecture/data-flow.md)
- [Lifecycle](./architecture/lifecycle.md)
- [Dependencies](./architecture/dependencies.md)

Current verified summary:

- Vampyre is TypeScript on Node.js with `pnpm`.
- `src/cli.ts` is the command entrypoint and package bin target.
- `wlkrlab` is the runtime host; the MacBook is the operator workstation.
- `~/vampyre` on `wlkrlab` contains deployed app files, config, SQLite state,
  managed repos, disposable worktrees, reports, logs, and artifacts.
- `systemd --user` supervises the daemon.
- SQLite migrations are embedded in `src/state/operationalState.ts`.
- GitHub is the formal review/approval surface.
- Telegram is used for notifications and low-risk status/pause commands.
- No HTTP server or public API is implemented.
