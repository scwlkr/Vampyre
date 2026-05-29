# System Overview

## Runtime

- `wlkrlab` is the real runtime host.
- `~/vampyre` is the runtime workspace.
- `systemd --user` supervises `vampyre.service`.
- The MacBook is the operator workstation.

## Main Subsystems

- CLI parsing: `src/cli.ts`.
- Host readiness: `src/doctor/` and `src/host/`.
- Daemon lifecycle: `src/daemon/`.
- Project Registry: `src/registry/`.
- SQLite Operational State: `src/state/`.
- Scheduler: `src/scheduler/`.
- Budget usage: `src/budget/`.
- Owner check-ins: `src/checkin/` and `src/status/`.
- Work Pause: `src/control/`.
- GitHub workflows: `src/github/`.
- Telegram commands/notifications: `src/telegram/` and `src/ping/`.
- Watcher discovery: `src/watcher/`.
- Build Agent: `src/agent/`.
- Builder repo creation: `src/builder/`.
- Native validation: `src/validation/`.

## Rigid Decisions

- One central daemon manages the Project Portfolio.
- Runtime state belongs on `wlkrlab`.
- GitHub is the durable approval/review surface.
- Telegram is not the formal approval ledger.
- Build Agent project-changing work uses isolated runtime worktrees.

## More Fluid Decisions

- Future native validation runner shape beyond hosted GitHub Actions.
- Future Builder templates.
- Future CI for the Vampyre TypeScript repo.
- Future hardening beyond the MVP worktree isolation model.
