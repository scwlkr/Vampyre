# Vampyre

Vampyre is a private TypeScript/Node.js project for an always-on software-project daemon. The implemented CLI installs and operates a `systemd --user` service on `wlkrlab`, keeps runtime state in a host-local workspace, renders Owner check-ins, and can run managed project workflows through GitHub, Telegram, SQLite, and disposable git worktrees.

## Current Status

- Runtime host: `wlkrlab`
- Runtime workspace: `~/vampyre`
- Service manager: `systemd --user`
- Stack: TypeScript, Node.js `>=20`, `pnpm`
- Project registry defaults: `scwlkr/paletteWOW` in Safe/Watcher Mode and `scwlkr/pinmark` in Builder Mode
- Current handoff: [docs/STATUS.md](./docs/STATUS.md)

The repo does not include CI configuration or an env example file. Runtime setup creates `~/vampyre/config/vampyre.env` on `wlkrlab` with `0600` permissions.

## Setup

```sh
corepack pnpm install
corepack pnpm build
```

Host setup and readiness checks:

```sh
node dist/cli.js host setup --host wlkrlab
node dist/cli.js doctor --host wlkrlab
```

## Run

```sh
node dist/cli.js status --host wlkrlab
node dist/cli.js daemon install --host wlkrlab
node dist/cli.js daemon restart --host wlkrlab
node dist/cli.js daemon logs --host wlkrlab
```

Useful operator commands:

```sh
node dist/cli.js watcher discover --host wlkrlab --project palette-wow
node dist/cli.js validation request --host wlkrlab --project screenshot-tool --ref main --wait
node dist/cli.js agent run --host wlkrlab --project screenshot-tool
node dist/cli.js pause 1h --host wlkrlab --reason "operator maintenance"
node dist/cli.js resume --host wlkrlab
```

## Validate

```sh
corepack pnpm exec tsc -p tsconfig.json --noEmit
corepack pnpm test
corepack pnpm build
git diff --check
```

## Docs

- [Docs map](./docs/README.md)
- [Architecture](./docs/architecture.md)
- [Status handoff](./docs/STATUS.md)
- [Project context](./CONTEXT.md)
- [To-do docs](./docs/to-do/README.md)
- [Deprecated docs](./docs/deprecated/README.md)
