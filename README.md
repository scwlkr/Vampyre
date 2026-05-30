# Vampyre

Vampyre is a private TypeScript/Node.js daemon for creating and sustaining
software projects from one always-on runtime host.

The implemented CLI installs and operates a `systemd --user` service on
`wlkrlab`, keeps runtime state in `~/vampyre`, renders Owner check-ins, and runs
managed project workflows through GitHub, Telegram, SQLite, validation commands,
and disposable git worktrees.

## Current Status

- Runtime host: `wlkrlab`
- Runtime workspace: `~/vampyre`
- Service manager: `systemd --user`
- Stack: TypeScript, Node.js `>=20`, `pnpm`
- Project registry defaults: `scwlkr/paletteWOW`, paused private
  `scwlkr/pinmark`, and active private `scwlkr/minimark`
- Current handoff: [docs/STATUS.md](./docs/STATUS.md)

The repo does not include CI or a checked-in env example. Host setup creates
`~/vampyre/config/vampyre.env` on `wlkrlab` with `0600` permissions.

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
node dist/cli.js validation request --host wlkrlab --project minimark --ref main --wait
node dist/cli.js agent run --host wlkrlab --project minimark
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

- [Mission / North Star](./MISSION.md)
- [Docs index](./docs/index.md)
- [Docs routing map](./docs/map.md)
- [Current status](./docs/STATUS.md)
- [Project context](./CONTEXT.md)
- [Architecture](./docs/architecture/index.md)
- [CLI reference](./docs/reference/cli/index.md)
