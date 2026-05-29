# File Layout

## Root

- `AGENTS.md`: repo working contract.
- `CONTEXT.md`: compact project context.
- `README.md`: human quick start.
- `CHANGELOG.md`: notable project changes.
- `package.json`: Node package metadata and scripts.
- `tsconfig.json`: strict TypeScript config.
- `pnpm-lock.yaml`: package lockfile.

## Source

- `src/cli.ts`: CLI parser and command dispatch.
- `src/agent/`: Worktree Build Agent.
- `src/budget/`: Codex usage summary.
- `src/builder/`: approved Builder repo creation.
- `src/checkin/`: shared CLI/Telegram check-in model.
- `src/control/`: Work Pause.
- `src/daemon/`: service unit, management commands, foreground loop.
- `src/doctor/`: SSH and runtime host checks.
- `src/github/`: GitHub REST API wrapper and workflows.
- `src/host/`: runtime workspace setup.
- `src/ping/`: Telegram test ping.
- `src/registry/`: Project Registry types/defaults/parser.
- `src/remote/`: shell quoting and workspace path helpers.
- `src/scheduler/`: budget/cadence/blocker/project selection.
- `src/state/`: SQLite migrations and state access.
- `src/status/`: status command and Markdown next-action extraction.
- `src/telegram/`: Telegram operational commands and Daily Briefs.
- `src/validation/`: GitHub Actions native validation requests.
- `src/watcher/`: Safe/Watcher discovery reports.

## Tests

Tests live under `tests/` and use Node's test runner through `tsx`.

There is no CI workflow in the repo at this time.
