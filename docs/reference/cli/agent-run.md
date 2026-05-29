# `agent run`

Runs the host Worktree Build Agent loop and records a Run Journal.

## Usage

```sh
node dist/cli.js agent run --host wlkrlab [--workspace-root ~/vampyre] [--project palette-wow] [--task text] [--worker-command command]
```

## Behavior

- Initializes Operational State and records a scheduler tick.
- Selects the requested project or scheduler-selected project.
- Creates a Run Journal and acquires the single Active Build Agent lock.
- Fetches the managed repo and creates an isolated worktree.
- Runs validation from Project Registry or Watcher discovery.
- Writes worker task context.
- Optionally runs a worker command.
- Commits and pushes output according to project autonomy policy.
- Opens/updates PRs for PR-mode output.
- Surfaces outcome through GitHub, Telegram, reports, blockers, and Run Journal.

## Source

- `src/agent/buildAgent.ts`
