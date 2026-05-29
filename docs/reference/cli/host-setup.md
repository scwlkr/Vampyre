# `host setup`

Creates the runtime workspace/env stub and verifies the system toolchain.

## Usage

```sh
node dist/cli.js host setup --host wlkrlab [--workspace-root ~/vampyre]
```

## Behavior

- Creates runtime directories under the workspace root.
- Creates `config/vampyre.env` if missing.
- Sets the env file to `0600`.
- Verifies Node.js and `pnpm` are visible in non-interactive SSH.

## Source

- `src/host/setupHost.ts`
- `src/cli.ts`
