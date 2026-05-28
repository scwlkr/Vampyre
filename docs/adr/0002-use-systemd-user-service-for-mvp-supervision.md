# Use systemd user service for MVP supervision

Vampyre will use a `systemd --user` service for MVP daemon supervision on `wlkrlab`. Live host inspection confirmed `systemd`, working `systemctl --user`, and linger support for the `wlkrlab` user, so this gives restart, status, logs, enable-on-boot, and clean lifecycle behavior without a custom supervisor or SSH-session background process.

## Consequences

- `vampyre daemon install|start|stop|restart|status|logs` should wrap normal `systemd --user` operations.
- The MVP may run as the normal homelab user, while keeping paths/config portable enough for a later dedicated service user.
- `vampyre doctor --host wlkrlab` must verify service support before daemon installation.
