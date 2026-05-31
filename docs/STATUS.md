# Vampyre Status

## Current phase

Post-MVP Product Loop Proof.

Vampyre is proving that one supervised daemon on `wlkrlab` can keep a portfolio
of managed projects moving with minimal Owner interaction. KeepingUs is now an
active Builder/Product Loop project alongside MiniMark, which moves Vampyre
closer to the final portfolio-management shape.

## Current state

- `wlkrlab` is the runtime host.
- Runtime workspace is `~/vampyre`.
- `vampyre.service` is supervised by `systemd --user`.
- Operational State is persisted in SQLite under
  `~/vampyre/data/vampyre.sqlite`.
- Runtime Policy is configured at `~/vampyre/config/runtime-policy.json`.
- Runtime Project Registry currently includes:
  - `keepingus`: active Builder/Product Loop project for private
    `scwlkr/keepingus`.
  - `minimark`: active Builder/Product Loop project for private
    `scwlkr/minimark`.
  - `palette-wow`: Safe/Watcher Mode for `scwlkr/paletteWOW`.
  - `screenshot-tool`: paused Builder/Product Loop project for private
    `scwlkr/pinmark`.
- KeepingUs hosted web validation is configured through `web-validation.yml`
  and currently passes.
- KeepingUs Linux-side Build Agent validation uses `pnpm test` and
  `pnpm build` on `wlkrlab`.
- MiniMark hosted macOS validation currently passes.
- MiniMark repo-local docs now follow the shared initial modular docs structure
  with lowercase `docs/status.md`.
- Pinmark remains private and paused until permission-heavy GUI/TCC testing is
  stronger.
- Direct-main Builder/Product Loop runs now detect missing legacy-vs-initial
  docs shape before normal product work and route legacy Builder repos to an
  initial-docs migration task.
- Direct-main Builder/Product Loop minimum interval is 3 hours under both
  `normal` and `conservative` Budget Mode.
- Runtime Policy Telegram commands are synced to Telegram's visible bot command
  menu via `setMyCommands`.
- Codex usage with no rate-limit percentage now falls back to Budget Mode
  `normal`; missing Codex usage still falls back to `conservative`.
- Recoverable blockers can enter the bounded automatic repair lane.
- Status `deferred` means a project was not selected on the latest scheduler
  tick because of pause, cadence, throttle, budget, or lock state. `Open
  Blockers` is a separate unresolved-blocker count, so a project can be
  deferred with `0` blockers when it is only waiting for cadence or throttle.

## Completed this session

- Migrated private `scwlkr/minimark` docs from the legacy
  `CONTEXT.md`/`docs/STATUS.md`/`docs/ROADMAP.md` shape to the shared initial
  modular docs structure.
- Added MiniMark `AGENTS.md`, `CHANGELOG.md`, `docs/index.md`, `docs/map.md`,
  lowercase `docs/status.md`, concepts, guides, reference, architecture,
  decisions, and todo docs.
- Preserved MiniMark's current verified product state, no-permission boundary,
  Launch Visibility Gate next action, and hosted visual-proof validation links
  in the migrated docs.
- Removed MiniMark legacy `CONTEXT.md`, `docs/STATUS.md`, `docs/ROADMAP.md`,
  and moved `docs/adr/` decision records to `docs/decisions/`.
- Pushed MiniMark docs migration commit `4bd0ebc` directly to `main` under the
  approved direct-main Builder/Product Loop policy.
- Fast-forwarded the `wlkrlab` runtime clone of `scwlkr/minimark` to
  `4bd0ebc`.
- Added a Build Agent guard that routes direct-main Builder repos missing the
  initial modular docs shape to an explicit docs migration task before reading
  status next actions for product work.
- Updated direct-main Builder task guardrails so product-loop workers no longer
  preserve legacy `docs/STATUS.md` as the normal path.
- Added Build Agent test coverage for legacy Builder docs being prioritized
  over stale product/status tasks.
- Requested hosted MiniMark macOS validation through Vampyre after the docs
  migration and recorded success in Operational State.
- Deployed the updated built Vampyre app to `wlkrlab` and restarted
  `vampyre.service`.
- Confirmed live `wlkrlab` status reports Overall State `ready`, Work Pause
  inactive, Active Build Agent lock available, MiniMark native validation
  success for run `26716457684`, and no open MiniMark blockers.

## Next action

Let the daemon continue normally. KeepingUs and MiniMark are both deferred only
by the 3-hour product-loop interval.

Based on live status at `2026-05-31T15:21:31.060Z`, KeepingUs last ran at
`2026-05-31T13:59:54.055Z` and MiniMark last ran at
`2026-05-31T14:15:54.485Z`, so their earliest next product-loop eligibility is
after `2026-05-31T16:59:54.055Z` and `2026-05-31T17:15:54.485Z` respectively,
subject to the next daemon tick and one-agent selection.

The current repo-local KeepingUs next action is:

Provide or connect the actual hosted container platform/app for KeepingUs, then
configure it to pull `ghcr.io/scwlkr/keepingus:latest`, set the real
`KEEPINGUS_PRODUCTION_BASE_URL`, set Cloudflare Access runtime values with
`KEEPINGUS_AUTH_SIGN_IN_URL=<cloudflare-access-login-url>` and
`KEEPINGUS_AUTH_SIGN_OUT_URL=/cdn-cgi/access/logout`, rerun the host deploy,
and run `pnpm verify:production` against that hosted base URL.

## Blockers

- No open KeepingUs blocker remains.
- No open MiniMark blocker remains.
- Pinmark still has `2` open blockers from GitHub Actions run `26687024974`,
  but the project is paused and does not drive Owner Action while paused.

## Latest proof

MiniMark docs migration proof:

- MiniMark commit `4bd0ebc` pushed to `scwlkr/minimark` `main`.
- `wlkrlab` runtime clone at `~/vampyre/repos/minimark` fast-forwarded to
  `4bd0ebc`.
- `git diff --check` passed in the MiniMark docs migration worktree and in the
  `wlkrlab` runtime clone.
- Hosted MiniMark macOS validation run `26716419052` completed successfully for
  the docs migration push.
- Vampyre validation request for MiniMark recorded run `26716457684` as
  `completed/success` at `2026-05-31T15:19:35.265Z`.

Local Vampyre proof after adding the Build Agent docs-shape guard:

- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- Focused `corepack pnpm exec tsx --test tests/buildAgent.test.ts` passed with
  16 passing tests.
- `corepack pnpm test` passed with 103 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.

Runtime proof on `wlkrlab`:

- `node dist/cli.js daemon install --host wlkrlab` deployed the updated app.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- Final `node dist/cli.js status --host wlkrlab` at
  `2026-05-31T15:21:31.060Z` reported Overall State `ready`, Budget
  `codex/normal`, Work Pause `not paused`, Active Build Agent Lock
  `available`, Runtime Policy path
  `/home/wlkrlab/vampyre/config/runtime-policy.json`, MiniMark native
  validation `completed/success` for
  `https://github.com/scwlkr/minimark/actions/runs/26716457684`, KeepingUs and
  MiniMark deferred by `product-loop-throttle-normal`, paletteWOW deferred by
  `cadence-not-due`, and Pinmark paused with `2` open blockers.

## Docs map

- Current roadmap: [to-do/ROADMAP.md](./to-do/ROADMAP.md)
- Docs routing: [map.md](./map.md)
- Architecture: [architecture/index.md](./architecture/index.md)
- CLI reference: [reference/cli/index.md](./reference/cli/index.md)
- Open docs and implementation follow-up: [todo/index.md](./todo/index.md)
