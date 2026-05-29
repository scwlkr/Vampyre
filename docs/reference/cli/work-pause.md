# `pause` And `resume`

Controls timed global Work Pause.

## Usage

```sh
node dist/cli.js pause 1m|1h|1d --host wlkrlab [--workspace-root ~/vampyre] [--reason text]
node dist/cli.js pause status --host wlkrlab [--workspace-root ~/vampyre]
node dist/cli.js resume --host wlkrlab [--workspace-root ~/vampyre]
```

## Behavior

Work Pause prevents new scheduler-selected project-changing Build Agent launches.
It does not interrupt an already-running Active Build Agent.

State is persisted in SQLite and used by both CLI and Telegram commands.

## Source

- `src/control/workPause.ts`
- `src/state/operationalState.ts`
