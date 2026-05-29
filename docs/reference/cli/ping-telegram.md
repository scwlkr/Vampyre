# `ping telegram`

Sends a Telegram test message from the runtime host.

## Usage

```sh
node dist/cli.js ping telegram --host wlkrlab [--workspace-root ~/vampyre]
node dist/cli.js -ping telegram --host wlkrlab [--workspace-root ~/vampyre]
```

## Behavior

Reads Telegram config from `~/vampyre/config/vampyre.env`, sends a test message,
and reports sanitized success or failure.

## Source

- `src/ping/telegram.ts`
