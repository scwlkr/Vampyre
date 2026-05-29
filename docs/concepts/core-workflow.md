# Core Workflow

This is the normal daemon loop as implemented in source.

## Startup

1. `daemon install` copies built `dist/` files and `package.json` to
   `~/vampyre/app`.
2. It writes and enables `~/.config/systemd/user/vampyre.service`.
3. `daemon restart` starts the service under `systemd --user`.
4. `daemon run` initializes Operational State from the runtime workspace.

## Heartbeat

Each daemon heartbeat:

1. Refreshes Operational State.
2. Polls Telegram operational commands.
3. Records a scheduler tick.
4. Runs the review control surface when a project is selected.
5. Invokes the Build Agent when an eligible project remains selected.
6. Emits sanitized heartbeat JSON.

## Scheduling

The scheduler considers:

- Work Pause.
- Project pause state.
- Open blockers.
- Cadence.
- Budget Mode.
- Conservative direct-main product-loop throttle.
- Single Active Build Agent lock.

Only one project can be selected for project-changing Build Agent work at a
time.

## Build Agent

The Build Agent:

1. Creates a Run Journal.
2. Acquires the Active Build Agent lock.
3. Fetches or clones the managed repo under `repos/`.
4. Creates a disposable worktree from `origin/main`.
5. Runs configured validation.
6. Writes worker task context.
7. Optionally launches the configured worker command.
8. Commits, pushes, and opens a PR or pushes direct-main output depending on
   project policy.
9. Surfaces the result through GitHub, Telegram, reports, and blockers.
10. Removes successful worktrees and releases the lock.

## Current Gap

Native validation exists as an operator-triggered command. The Build Agent does
not yet automatically request native validation after pushing output.
