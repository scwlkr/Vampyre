# Installation

Use this for local development setup and runtime host preparation.

## Local Dependencies

The repo uses Node.js, `pnpm`, TypeScript, and Node's test runner through `tsx`.

```sh
corepack pnpm install
corepack pnpm build
```

## Runtime Host Setup

Prepare `wlkrlab`:

```sh
node dist/cli.js host setup --host wlkrlab
node dist/cli.js doctor --host wlkrlab
```

`host setup` creates the runtime workspace and env stub. `doctor` checks SSH,
`systemd --user`, Node, `pnpm`, Git, workspace root, env secret presence,
GitHub auth, SQLite, and service readiness.

## Secrets

Configure secret values only on `wlkrlab` in:

```txt
~/vampyre/config/vampyre.env
```

Do not put secret values in the repo, docs, chat, reports, or command output.
