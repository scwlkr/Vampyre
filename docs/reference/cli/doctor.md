# `doctor`

Checks runtime host readiness without printing secret values.

## Usage

```sh
node dist/cli.js doctor --host wlkrlab [--workspace-root ~/vampyre]
```

## Checks

- SSH reachability.
- `systemd --user`.
- Node.js.
- `pnpm`.
- Git.
- Workspace root.
- Env stub and required secret presence metadata.
- GitHub authentication from the host env file.
- SQLite.
- `vampyre.service` readiness.

## Source

- `src/doctor/hostDoctor.ts`
- `src/cli.ts`
