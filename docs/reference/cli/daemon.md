# `daemon`

Installs, runs, and manages the supervised Vampyre daemon.

## Usage

```sh
node dist/cli.js daemon run [--workspace-root ~/vampyre]
node dist/cli.js daemon install|start|stop|restart|status|logs --host wlkrlab [--workspace-root ~/vampyre]
```

## Behavior

- `run` starts the foreground daemon loop.
- `install` requires built `dist/` artifacts, copies them to `~/vampyre/app`,
  writes `vampyre.service`, reloads systemd, and enables the service.
- `start`, `stop`, `restart`, and `status` wrap `systemctl --user`.
- `logs` reads recent `journalctl --user -u vampyre.service` output.

## Source

- `src/daemon/runDaemon.ts`
- `src/daemon/manageDaemon.ts`
- `src/daemon/service.ts`
