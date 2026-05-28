# Vampyre Status

## Current phase

Phase 2 - Budget-aware Portfolio Scheduler complete.

## Current state

- `CONTEXT.md` defines the project language, mode boundaries, runtime host, workspace, approvals, budget posture, Builder flow, and Safe/Watcher rules.
- `docs/to-do/ROADMAP.md` has been rewritten as the MVP Proof execution roadmap.
- `docs/adr/` records the key architecture decisions.
- `AGENTS.md` records the repo-local working contract for future sessions, including keeping `docs/STATUS.md` handoff-ready before committing and pushing scoped changes.
- `README.md` summarizes the clarified project purpose and links to canonical docs.
- The MVP Proof targets are selected:
  - Safe/Watcher project: `scwlkr/paletteWOW`
  - Builder project: real macOS screenshot tool with quick markup features similar in spirit to ShareX
- Live host check confirmed `wlkrlab` has `systemd`, working `systemctl --user`, and linger enabled for the `wlkrlab` user.
- TypeScript/Node/`pnpm` project skeleton exists with strict TypeScript, build and test scripts, and a `pnpm-lock.yaml`.
- CLI entrypoint exists at `src/cli.ts` with the first milestone command: `vampyre doctor --host wlkrlab`.
- Host doctor checks SSH reachability, `systemd --user`, Node, `pnpm`, Git, Workspace Root, env stub/secret presence metadata, SQLite, and basic `vampyre.service` readiness.
- Doctor output reports secret presence only by key name and does not print or persist secret values.
- The local `wlkrlab` SSH alias now uses `wlkrlab-server.tail4aa4da.ts.net` with `HostKeyAlias 192.168.4.111`, preserving the known host key while avoiding the unreachable LAN route.
- `~/vampyre` now exists on `wlkrlab` with runtime subdirectories and `~/vampyre/config/vampyre.env` at `0600`.
- System-level Arch packages now provide Node `26.1.0`, npm `11.14.1`, and `pnpm` `10.33.0` in the non-interactive SSH environment.
- Remote workspace-root handling now expands `~/vampyre` to `/home/wlkrlab/vampyre` before host setup or doctor checks run.
- Required secret presence metadata is configured for `GITHUB_TOKEN`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`; values were not printed or persisted outside the env file.
- A minimal foreground daemon exists and emits heartbeat JSON with Operational State and scheduler state.
- `vampyre daemon install|start|stop|restart|status|logs` wraps the `systemd --user` service on `wlkrlab`.
- `vampyre.service` is installed, enabled, and running under `systemd --user` on `wlkrlab`.
- `vampyre ping telegram --host wlkrlab` and `vampyre -ping telegram --host wlkrlab` exist as a tiny pre-Phase-1 Telegram delivery check. The command reads Telegram config on `wlkrlab`, sends successfully, and does not print token or chat values.
- After the Owner messaged the bot, `TELEGRAM_CHAT_ID` was corrected from Telegram update metadata without printing the value.
- Phase 1 SQLite migration plumbing exists and creates `schema_migrations`, `projects`, `run_journals`, `project_blockers`, and `idempotency_keys`.
- The runtime Project Registry is loaded from `~/vampyre/config/project-registry.json`; if missing, the daemon creates the two MVP profiles:
  - `paletteWOW` in Safe/Watcher Mode for `scwlkr/paletteWOW`
  - `macOS Screenshot Tool` in Builder Mode from the approved raw idea
- Project Profile validation rejects unsupported modes, duplicate project ids, and mode-specific missing fields before state sync.
- The foreground daemon initializes Operational State at startup and heartbeat JSON now reports `operationalState:"ready"` with `projectCount:2`.
- `vampyre status --host wlkrlab` calls the installed host app, loads registry/state on `wlkrlab`, and reports both MVP projects without printing secrets.
- Phase 2 SQLite migration `0002_scheduler_state` adds scheduler cursors, the latest scheduler tick record, and the single Active Build Agent lock.
- Scheduler ticks now evaluate per-project cadence, pause state, open blockers, Budget Mode, and the one-agent limit.
- A Codex budget-provider boundary exists. Until a real token provider is implemented, unavailable budget data resolves to `conservative`, selecting Safe/Watcher work and deferring Builder work.
- The daemon records scheduler ticks on `wlkrlab` and heartbeat JSON reports `scheduler:"ready"`, `budgetMode`, `activeBuildAgentLock`, `selectedProjectId`, and decision count.
- `vampyre status --host wlkrlab` reports the latest scheduler tick, Budget Mode, Active Build Agent lock state, and selected project.
- Agent/build-worker logic and GitHub writes have not been added yet.

## Next phase

Phase 3 - GitHub And Telegram Control Surfaces.

## Next action

Start Phase 3 by adding GitHub auth/repo access checks and the first issue/PR/comment/label primitives, while keeping Telegram as notification-only and GitHub as the formal approval/review surface.

## Blockers

- None blocking Phase 3 start.

## Latest proof

- `corepack pnpm install` completed and wrote `pnpm-lock.yaml`.
- `corepack pnpm build` passed.
- `corepack pnpm test` passed with 16 passing tests.
- `git diff --check` passed after the Phase 1 changes.
- `node dist/cli.js doctor --host wlkrlab` reached host `wlkrlab-server` as user `wlkrlab`.
- Doctor reported `systemctl --user` is available.
- Doctor reported Git `2.54.0` and SQLite `3.53.1` are visible on `wlkrlab`.
- `node dist/cli.js host setup --host wlkrlab` created the runtime workspace and strict-permission env stub, and verified system Node/`pnpm`.
- Latest doctor run reports Node `v26.1.0`, `pnpm` `10.33.0`, Git `2.54.0`, SQLite `3.53.1`, and writable `~/vampyre`.
- Latest doctor run reports required secret presence for `GITHUB_TOKEN`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`; `OPENROUTER_API_KEY` is missing optional.
- `node dist/cli.js daemon install --host wlkrlab` deployed the built app to `/home/wlkrlab/vampyre/app`, installed `/home/wlkrlab/.config/systemd/user/vampyre.service`, and enabled it.
- `node dist/cli.js daemon start --host wlkrlab` started the service.
- `node dist/cli.js daemon restart --host wlkrlab` restarted the service successfully.
- `node dist/cli.js daemon status --host wlkrlab` reports `vampyre.service` active and running `/usr/bin/node /home/wlkrlab/vampyre/app/dist/daemon/runDaemon.js`.
- `node dist/cli.js daemon logs --host wlkrlab` shows heartbeat JSON with `scheduler:"not-started"` and `agent:"not-started"`.
- Latest `node dist/cli.js doctor --host wlkrlab` exits 0 with service readiness passing.
- Telegram `getUpdates` found the private chat after the Owner sent `/start`/`ping`; the env file was updated without printing the chat id.
- `node dist/cli.js ping telegram --host wlkrlab` exits 0 and sends a Telegram test message.
- `node dist/cli.js -ping telegram --host wlkrlab --message 'Vampyre Telegram alias ping from wlkrlab.'` exits 0 and sends a Telegram test message through the alias.
- `pnpm` global bin was configured to `~/.local/bin`, the local package was linked globally, and `vampyre -ping telegram --host wlkrlab --message 'Vampyre global command ping from wlkrlab.'` exits 0.
- Bare default-host alias proof passed: `vampyre -ping telegram --message 'Vampyre bare alias ping from wlkrlab.'` exits 0.
- System package verification showed `/usr/bin/node`, `/usr/bin/pnpm`, and `/usr/bin/npm` are visible over non-interactive SSH.
- The accidental literal `/home/wlkrlab/~` workspace artifact created by earlier unexpanded tilde handling was removed after verifying it only contained the generated Vampyre stub tree.
- `node dist/cli.js status --local --workspace-root <tmp>` creates a local registry and SQLite database, applies `0001_operational_state`, and reports both MVP projects.
- `node dist/cli.js daemon install --host wlkrlab` deployed the Phase 1 build to `/home/wlkrlab/vampyre/app` and reinstalled/enabled `vampyre.service`.
- `node dist/cli.js daemon restart --host wlkrlab` restarted the service after the Phase 1 deploy.
- `node dist/cli.js daemon status --host wlkrlab` reports `vampyre.service` active, with heartbeat JSON showing `operationalState:"ready"` and `projectCount:2`.
- `node dist/cli.js status --host wlkrlab` reports Operational State ready, database `/home/wlkrlab/vampyre/data/vampyre.sqlite`, registry `/home/wlkrlab/vampyre/config/project-registry.json`, and both MVP projects.
- A second `node dist/cli.js status --host wlkrlab` after restart reports `Migrations Applied This Run: none`, proving the migration state is persisted.
- `ssh -o BatchMode=yes -o ConnectTimeout=8 wlkrlab "sqlite3 ~/vampyre/data/vampyre.sqlite \"select id || '|' || mode from projects order by id;\""` returns `palette-wow|safe-watcher` and `screenshot-tool|builder`.
- `corepack pnpm test` passes with 22 passing tests, including scheduler cadence, budget, pause/block, active-lock, and tick-persistence coverage.
- `corepack pnpm build` passes.
- `git diff --check` passes.
- `node dist/cli.js daemon install --host wlkrlab` deployed the Phase 2 build to `/home/wlkrlab/vampyre/app` and reinstalled/enabled `vampyre.service`.
- `node dist/cli.js daemon restart --host wlkrlab` restarted the service after the Phase 2 deploy.
- `node dist/cli.js daemon status --host wlkrlab` reports `vampyre.service` active and shows heartbeat JSON with `scheduler:"ready"`, `budgetMode:"conservative"`, `activeBuildAgentLock:"available"`, `selectedProjectId:"palette-wow"`, and `schedulerDecisionCount:2`.
- `node dist/cli.js status --host wlkrlab` reports Scheduler Last Tick, `codex/conservative`, Active Build Agent Lock `available`, and Selected Project `palette-wow`.
- `ssh -o BatchMode=yes -o ConnectTimeout=8 wlkrlab "sqlite3 ~/vampyre/data/vampyre.sqlite \"select id from schema_migrations order by id;\""` returns `0001_operational_state` and `0002_scheduler_state`.
- `ssh -o BatchMode=yes -o ConnectTimeout=8 wlkrlab "sqlite3 ~/vampyre/data/vampyre.sqlite \"select budget_mode || '|' || selected_project_id || '|' || active_build_agent_lock from scheduler_ticks where id='current';\""` returns `conservative|palette-wow|available`.
- `ssh -o BatchMode=yes -o ConnectTimeout=8 wlkrlab "sqlite3 ~/vampyre/data/vampyre.sqlite \"select project_id || '|' || last_decision || '|' || last_reason from scheduler_cursors order by project_id;\""` returns `palette-wow|selected|eligible` and `screenshot-tool|deferred|budget-conservative-builder-deferred`.
