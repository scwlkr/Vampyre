# Data Flow

## Runtime State

SQLite lives at:

```txt
~/vampyre/data/vampyre.sqlite
```

Migrations are embedded in `src/state/operationalState.ts`.

Current tables:

- `schema_migrations`
- `projects`
- `run_journals`
- `project_blockers`
- `idempotency_keys`
- `scheduler_cursors`
- `scheduler_ticks`
- `active_build_agent_lock`
- `work_pause`
- `telegram_update_cursor`
- `notification_delivery_state`
- `telegram_unauthorized_attempt_state`
- `external_validation_runs`

## Registry To State

1. Operational State loads the runtime Project Registry.
2. Missing registry creates repo defaults.
3. Project Profiles are synced into SQLite.
4. Status, scheduler, and Build Agent workflows read project runtime rows.

## Runtime Policy To Daemon

1. Operational State loads `~/vampyre/config/runtime-policy.json`.
2. Missing policy creates the versioned default policy.
3. Scheduler reads policy-backed Budget Mode fallback, cadence intervals, and
   direct-main product-loop intervals.
4. Telegram polling reads policy-backed command names, pause durations, Daily
   Brief timing, and unauthorized-alert thresholds.
5. Status renders a compact effective-policy summary when enabled.

## Scheduler To Build Agent

1. Scheduler calculates Budget Mode.
2. Scheduler defers projects for pause, blockers, cadence, budget, throttle, or
   lock state.
3. At most one project is selected.
4. Daemon invokes the Build Agent for selected eligible work.

## Build Agent Output

Build Agent writes:

- Run Journal rows.
- Worktree reports under `reports/build-agent/`.
- Git branches/commits and PRs or direct-main output.
- GitHub review issue comments.
- Telegram notifications.
- Blockers for failures.

## Native Validation Output

Native validation writes:

- `external_validation_runs` rows.
- Reports under `reports/native-validation/<project-id>/`.
- Project blockers for failure or timeout.
- Check-in links to provider run URLs.

## Visual Proof Output

Visual Proof writes:

- Product screenshots under `reports/visual-proof/<project-id>/<run-journal-id>/`.
- Build Agent report fields linking the screenshot, source workflow run, and
  artifact.
- GitHub issue/PR text with Visual Proof status.
- Telegram `sendPhoto` messages when screenshot capture succeeds.
- Project blockers when required screenshot proof is missing or cannot be read.
