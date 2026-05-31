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
- Pinmark remains private and paused until permission-heavy GUI/TCC testing is
  stronger.
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

- Added a validated Runtime Policy config at
  `~/vampyre/config/runtime-policy.json`.
- Routed Budget Mode fallback, Codex usage scan settings, cadence intervals,
  direct-main product-loop intervals, automatic Build Agent launch, worker
  defaults, Telegram command names, Telegram pause durations, Daily Brief
  timing, and unauthorized-alert thresholds through Runtime Policy.
- Changed Codex usage with no rate-limit percentage from implicit
  `conservative` fallback to configured `normal` fallback.
- Made the 3-hour direct-main Builder/Product Loop interval apply under both
  `normal` and `conservative` Budget Mode.
- Added the no-space Telegram policy command `/policy`.
- Added daemon-side Telegram bot command-menu sync from Runtime Policy, so
  `/policy`, pause commands, `/resume`, and `/status` are visible in Telegram.
- Added Runtime Policy summary lines to CLI and Telegram status rendering.
- Updated configuration, workflow, and data-flow docs for Runtime Policy.
- Deployed the updated built Vampyre app to `wlkrlab` and restarted
  `vampyre.service`.
- Confirmed live `wlkrlab` status reports Budget `codex/normal`, Runtime
  Policy path `/home/wlkrlab/vampyre/config/runtime-policy.json`, Work Pause
  inactive, and Active Build Agent lock available.
- Confirmed live Telegram `getMyCommands` reports `status`, `policy`,
  `pause1min`, `pause1hour`, `pause1day`, and `resume`.

## Next action

Let the daemon continue normally. KeepingUs and MiniMark are both deferred only
by the 3-hour product-loop interval.

Based on live status at `2026-05-31T14:57:41.296Z`, KeepingUs last ran at
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

Local proof after adding Runtime Policy and Telegram command-menu sync:

- Focused Telegram command test run passed with 7 passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 102 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.

Runtime proof on `wlkrlab`:

- `node dist/cli.js daemon install --host wlkrlab` deployed the updated app.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- Final `node dist/cli.js status --host wlkrlab` at
  `2026-05-31T14:57:41.296Z` reported Overall State `ready`, Budget
  `codex/normal`, Work Pause `not paused`, Active Build Agent Lock
  `available`, Runtime Policy path
  `/home/wlkrlab/vampyre/config/runtime-policy.json`, direct-main loop interval
  `normal 3h, conservative 3h`, KeepingUs and MiniMark deferred by
  `product-loop-throttle-normal`, paletteWOW deferred by `cadence-not-due`, and
  Pinmark paused with `2` open blockers.
- Runtime Policy file check on `wlkrlab` confirmed
  `unknownRateLimitMode=normal`, `normalInterval=3h`,
  `conservativeInterval=3h`, `normalBehavior=allow`,
  `criticalBehavior=defer`, and `policyCommand=/policy`.
- Live Telegram `getMyCommands` on `wlkrlab` returned `status`, `policy`,
  `pause1min`, `pause1hour`, `pause1day`, and `resume`.

## Docs map

- Current roadmap: [to-do/ROADMAP.md](./to-do/ROADMAP.md)
- Docs routing: [map.md](./map.md)
- Architecture: [architecture/index.md](./architecture/index.md)
- CLI reference: [reference/cli/index.md](./reference/cli/index.md)
- Open docs and implementation follow-up: [todo/index.md](./todo/index.md)
