# Troubleshooting

## `remote-app-missing`

The installed app is missing on `wlkrlab`.

Run:

```sh
corepack pnpm build
node dist/cli.js daemon install --host wlkrlab
```

## Doctor Reports Missing Secrets

Configure missing values in `~/vampyre/config/vampyre.env` on `wlkrlab`.

Docs and command output should only show key names and presence metadata, never
the values.

## Daemon Is Not Running

Check and restart:

```sh
node dist/cli.js daemon status --host wlkrlab
node dist/cli.js daemon restart --host wlkrlab
node dist/cli.js daemon logs --host wlkrlab
```

## Scheduler Selects No Project

Check for:

- Active Work Pause.
- Open project blockers.
- Cadence not due.
- Conservative budget product-loop throttle.
- Held Active Build Agent lock.

Use:

```sh
node dist/cli.js status --host wlkrlab
```

## Watcher Discovery Blocks On Dirty Clone

Watcher discovery intentionally blocks instead of inspecting or overwriting a
managed runtime clone with uncommitted changes. Inspect the clone on `wlkrlab`
and preserve or clean the state deliberately.

## Native Validation Fails

Open the linked GitHub Actions run from status or the native-validation report.
Failed or timed-out native validation should be treated as a project-local
blocker until resolved.
