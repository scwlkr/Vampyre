# First Run

This is the shortest path from local build to runtime check-in.

## Build

```sh
corepack pnpm build
```

## Deploy Service

```sh
node dist/cli.js daemon install --host wlkrlab
node dist/cli.js daemon restart --host wlkrlab
```

## Inspect

```sh
node dist/cli.js daemon status --host wlkrlab
node dist/cli.js status --host wlkrlab
```

The status command renders the Owner Check-in Surface from runtime state.

## Validate Locally

```sh
corepack pnpm exec tsc -p tsconfig.json --noEmit
corepack pnpm test
corepack pnpm build
git diff --check
```
