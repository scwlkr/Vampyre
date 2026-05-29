# Lifecycle

## Setup Lifecycle

1. Local dependencies are installed with `corepack pnpm install`.
2. The repo is built with `corepack pnpm build`.
3. `host setup` prepares `~/vampyre` on `wlkrlab`.
4. `doctor` verifies readiness and secret presence metadata.

## Service Lifecycle

1. `daemon install` deploys built artifacts to `~/vampyre/app`.
2. It writes `~/.config/systemd/user/vampyre.service`.
3. `daemon restart` starts the service.
4. `daemon status` and `daemon logs` inspect service state.

## Daemon Tick Lifecycle

1. Initialize or refresh Operational State.
2. Poll Telegram commands and Daily Brief state.
3. Record scheduler tick.
4. Run review control surface when selected.
5. Invoke Build Agent if still eligible.
6. Write heartbeat JSON without secret values.

## Failure Lifecycle

- Missing setup creates doctor/setup blockers.
- Validation failure records project blockers and preserves failed worktrees.
- Telegram or GitHub surfacing failures are reported as blockers without
  invalidating already-created durable GitHub records.
- Work Pause blocks new project-changing work without stopping daemon health
  checks or status surfaces.
