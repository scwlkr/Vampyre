# Vampyre Status

## Current phase

Phase 3 - GitHub And Telegram Control Surfaces complete; Phase 4 ready to start.

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
- `vampyre github check --host wlkrlab [--repo owner/name]` verifies GitHub token authentication and repository access from the runtime host without printing token values.
- `vampyre doctor --host wlkrlab` now includes a GitHub authentication check in addition to secret presence metadata.
- A GitHub API boundary now exists for authenticated requests, repository access checks, create/update label, create issue, create issue comment, and create pull request primitives.
- `vampyre review request --host wlkrlab` now wires the first scheduler-selected review workflow: it loads runtime state on `wlkrlab`, uses the scheduler-selected project, ensures the `vampyre:review` label, creates or reuses a GitHub review issue, posts an update comment, and sends a Telegram notification linking to the GitHub record.
- Telegram review notifications explicitly remain notification-only; GitHub is still the durable approval/review record.
- `vampyre approval check --host wlkrlab --repo owner/name --project project-id --kind builder-vision|builder-repo-plan|major-feature --key approval-key` now performs read-only formal approval lookup from the runtime host.
- Formal approval lookup requires a GitHub issue labeled `vampyre:approval` plus matching `Project:`, `Approval Kind:`, and `Approval Key:` fields, with a `VAMPYRE_APPROVED` marker in the issue body or an issue comment.
- `vampyre pr upsert --host wlkrlab --repo owner/name --head branch --base branch --title title [--body body] [--draft]` now performs PR find/create/update workflow support from the runtime host and sends a Telegram PR link.
- PR upsert finds an open PR for the target head/base branch, updates the title/body/base when one exists, or creates a new PR when none exists.
- The daemon now runs a control-surface tick after each scheduler tick and invokes the existing review workflow for the scheduler-selected project.
- Daemon-triggered review requests are guarded by SQLite idempotency keys like `daemon-review-request:palette-wow`, preventing repeated GitHub comments or Telegram notifications on every heartbeat.
- Heartbeat JSON now reports control-surface status, action, project id, and the GitHub issue URL when present.
- Phase 3 CLI/API support for review requests, approval checks, and PR upserts is in place; future agent-output PR automation belongs with the build-worker/worktree phases.
- Agent/build-worker logic has not been added yet.

## Next phase

Start Phase 4 - Watcher Discovery Pass For `paletteWOW`.

## Next action

Begin Phase 4 by inspecting `scwlkr/paletteWOW` from the configured Runtime Workspace on `wlkrlab`, checking README/config/app structure plus open GitHub issues and PRs, inferring validation commands, and producing a Watcher Discovery Pass result before any project-changing work.

## Blockers

- None blocking Phase 4 implementation.
- Builder work remains approval-gated until GitHub contains a matching `vampyre:approval` issue with `VAMPYRE_APPROVED` evidence.

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
- `corepack pnpm test` passes with 29 passing tests, including GitHub host-check and API primitive coverage.
- `corepack pnpm build` passes.
- `git diff --check` passes.
- `node dist/cli.js github check --host wlkrlab` exits 0 and reports GitHub auth plus `scwlkr/paletteWOW` access from the runtime host.
- `node dist/cli.js doctor --host wlkrlab` exits 0 and includes `PASS GitHub auth: GitHub token authenticated`.
- `node dist/cli.js daemon install --host wlkrlab` deployed the Phase 3 in-progress build to `/home/wlkrlab/vampyre/app` and reinstalled/enabled `vampyre.service`.
- `node dist/cli.js daemon restart --host wlkrlab` restarted the service after the Phase 3 deploy.
- `node dist/cli.js github check --host wlkrlab --repo scwlkr/paletteWOW` exits 0 and reports the target repo accessible.
- `node dist/cli.js daemon status --host wlkrlab` reports `vampyre.service` active with heartbeat JSON showing `scheduler:"ready"`, `budgetMode:"conservative"`, `activeBuildAgentLock:"available"`, and `selectedProjectId:"palette-wow"`.
- `node dist/cli.js status --host wlkrlab` reports Operational State ready, `Migrations Applied This Run: none`, Scheduler Last Tick, `codex/conservative`, Active Build Agent Lock `available`, and Selected Project `palette-wow`.
- `corepack pnpm test` passes with 33 passing tests, including the new review workflow create/reuse/blocker/remote-command coverage.
- `corepack pnpm build` passes.
- `git diff --check` passes.
- `node dist/cli.js daemon install --host wlkrlab` deployed the Phase 3 review workflow build to `/home/wlkrlab/vampyre/app` and reinstalled/enabled `vampyre.service`.
- `node dist/cli.js daemon restart --host wlkrlab` restarted the service after the Phase 3 review workflow deploy.
- `node dist/cli.js review request --host wlkrlab` exits 0, uses scheduler-selected `palette-wow`, creates `vampyre:review`, creates `scwlkr/paletteWOW` issue `#16`, posts `https://github.com/scwlkr/paletteWOW/issues/16#issuecomment-4565941319`, and sends Telegram message `9` with the GitHub issue link.
- `node dist/cli.js daemon status --host wlkrlab` reports `vampyre.service` active with heartbeat JSON showing `scheduler:"ready"`, `budgetMode:"conservative"`, `activeBuildAgentLock:"available"`, and `selectedProjectId:"palette-wow"`.
- `node dist/cli.js status --host wlkrlab` reports Operational State ready, `Migrations Applied This Run: none`, Scheduler Last Tick `2026-05-28T16:01:18.782Z`, `codex/conservative`, Active Build Agent Lock `available`, and Selected Project `palette-wow`.
- `node dist/cli.js github check --host wlkrlab --repo scwlkr/paletteWOW` exits 0 and reports GitHub auth plus target repo access from the runtime host.
- `corepack pnpm build` passes after the formal approval lookup slice.
- `corepack pnpm test` passes with 37 passing tests, including approval lookup success/missing-token/missing-approval/remote-command coverage.
- `git diff --check` passes.
- `node dist/cli.js daemon install --host wlkrlab` deployed the approval lookup build to `/home/wlkrlab/vampyre/app` and reinstalled/enabled `vampyre.service`.
- `node dist/cli.js daemon restart --host wlkrlab` restarted the service after the approval lookup deploy.
- `node dist/cli.js github check --host wlkrlab --repo scwlkr/Vampyre` exits 0 and reports the control repo accessible with `admin,maintain,pull,push,triage` permissions.
- `node dist/cli.js approval check --host wlkrlab --repo scwlkr/Vampyre --project screenshot-tool --kind builder-vision --key screenshot-tool` exits 1 with the expected approval blocker because no matching `vampyre:approval` issue currently proves `VAMPYRE_APPROVED` for that Builder decision.
- `node dist/cli.js daemon status --host wlkrlab` reports `vampyre.service` active with heartbeat JSON showing `scheduler:"ready"`, `budgetMode:"conservative"`, `activeBuildAgentLock:"available"`, and `selectedProjectId:"palette-wow"`.
- `corepack pnpm test` passes with 42 passing tests, including PR find/update primitives and PR upsert create/update/missing-token/remote-command coverage.
- `corepack pnpm build` passes after the PR upsert slice.
- `git diff --check` passes after the PR upsert slice.
- `node dist/cli.js daemon install --host wlkrlab` deployed the PR upsert build to `/home/wlkrlab/vampyre/app` and reinstalled/enabled `vampyre.service`.
- `node dist/cli.js daemon restart --host wlkrlab` restarted the service after the PR upsert deploy.
- `node dist/cli.js daemon status --host wlkrlab` reports `vampyre.service` active and running `/usr/bin/node /home/wlkrlab/vampyre/app/dist/daemon/runDaemon.js`.
- `node dist/cli.js status --host wlkrlab` reports Operational State ready, `Migrations Applied This Run: none`, Scheduler Last Tick `2026-05-28T17:02:41.070Z`, `codex/conservative`, Active Build Agent Lock `available`, and Selected Project `palette-wow`.
- `node dist/cli.js github check --host wlkrlab --repo scwlkr/Vampyre` exits 0 and reports GitHub auth plus control repo access from the runtime host.
- `node dist/cli.js pr upsert --host wlkrlab --repo scwlkr/Vampyre --head vampyre/pr-upsert-workflow --base main --title "Add PR upsert workflow" ...` created `scwlkr/Vampyre` PR `#2` from the runtime host and sent Telegram message `10` with the PR link.
- A second `node dist/cli.js pr upsert --host wlkrlab --repo scwlkr/Vampyre --head vampyre/pr-upsert-workflow --base main --title "Add PR upsert workflow" ...` reused and updated PR `#2` from the runtime host and sent Telegram message `11`.
- `corepack pnpm test` passes with 44 passing tests, including daemon control-surface idempotency and daemon tick ordering coverage.
- `corepack pnpm build` passes after the daemon control-surface slice.
- `git diff --check` passes after the daemon control-surface slice.
- `node dist/cli.js daemon install --host wlkrlab` deployed the daemon control-surface build to `/home/wlkrlab/vampyre/app` and reinstalled/enabled `vampyre.service`.
- `node dist/cli.js daemon restart --host wlkrlab` restarted the service after the daemon control-surface deploy.
- `node dist/cli.js daemon status --host wlkrlab` reports `vampyre.service` active and running `/usr/bin/node /home/wlkrlab/vampyre/app/dist/daemon/runDaemon.js`.
- The first post-deploy heartbeat at `2026-05-28T17:18:04.444Z` reports `controlSurface:"invoked"`, `controlSurfaceAction:"review-request"`, `controlSurfaceProjectId:"palette-wow"`, and `controlSurfaceIssueUrl:"https://github.com/scwlkr/paletteWOW/issues/16"`.
- SQLite on `wlkrlab` records `daemon-review-request:palette-wow|daemon-review-request|completed` and stores the GitHub issue URL in the idempotency response JSON.
- The next heartbeat at `2026-05-28T17:18:37.008Z` reports `controlSurface:"skipped"` for the same review request, proving the daemon does not repeat the GitHub/Telegram side effect every heartbeat.
- `node dist/cli.js status --host wlkrlab` reports Operational State ready, `Migrations Applied This Run: none`, Scheduler Last Tick `2026-05-28T17:18:37.008Z`, `codex/conservative`, Active Build Agent Lock `available`, and Selected Project `palette-wow`.
