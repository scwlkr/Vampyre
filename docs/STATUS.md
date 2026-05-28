# Vampyre Status

## Current phase

Phase 0A - Host readiness skeleton.

## Current state

- `CONTEXT.md` defines the project language, mode boundaries, runtime host, workspace, approvals, budget posture, Builder flow, and Safe/Watcher rules.
- `docs/to-do/ROADMAP.md` has been rewritten as the MVP Proof execution roadmap.
- `docs/adr/` records the key architecture decisions.
- `AGENTS.md` records the repo-local working contract for future sessions.
- `README.md` summarizes the clarified project purpose and links to canonical docs.
- The MVP Proof targets are selected:
  - Safe/Watcher project: `scwlkr/paletteWOW`
  - Builder project: real macOS screenshot tool with quick markup features similar in spirit to ShareX
- Live host check confirmed `wlkrlab` has `systemd`, working `systemctl --user`, and linger enabled for the `wlkrlab` user.
- TypeScript/Node/`pnpm` project skeleton exists with strict TypeScript, build and test scripts, and a `pnpm-lock.yaml`.
- CLI entrypoint exists at `src/cli.ts` with the first milestone command: `vampyre doctor --host wlkrlab`.
- Host doctor checks SSH reachability, `systemd --user`, Node, `pnpm`, Git, Workspace Root, env stub/secret presence metadata, SQLite, and basic `vampyre.service` readiness.
- Doctor output reports secret presence only by key name and does not print or persist secret values.
- Scheduler logic, agent/build-worker logic, daemon service commands, and GitHub writes have not been added yet.

## Next phase

Phase 0A continuation - host setup and service skeleton.

## Next action

Implement the approved host setup path for `wlkrlab`: create the Workspace Root, make Node and `pnpm` visible to non-interactive SSH and future `systemd --user` service runs, create the strict-permission env stub, then rerun `vampyre doctor --host wlkrlab` before adding daemon service commands.

## Blockers

- `vampyre doctor --host wlkrlab` reports Node is not visible in the non-interactive SSH environment.
- `vampyre doctor --host wlkrlab` reports `pnpm` is not visible in the non-interactive SSH environment.
- `vampyre doctor --host wlkrlab` reports `~/vampyre` is missing or not writable by the runtime user.
- The env stub cannot be created until the Workspace Root exists.
- MVP secrets are not configured yet in `~/vampyre/config/vampyre.env` on `wlkrlab`.
- `vampyre.service` is not installed yet; this is currently a warning, not a blocker for the first doctor milestone.

## Latest proof

- `corepack pnpm install` completed and wrote `pnpm-lock.yaml`.
- `corepack pnpm build` passed.
- `corepack pnpm test` passed with 3 passing host-doctor tests.
- `node dist/cli.js doctor --host wlkrlab` reached host `wlkrlab-server` as user `wlkrlab`.
- Doctor reported `systemctl --user` is available.
- Doctor reported Git `2.54.0` and SQLite `3.53.1` are visible on `wlkrlab`.
- Doctor reported exact blockers for missing Node, missing `pnpm`, missing Workspace Root, and blocked env-stub creation without printing secret values.
