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
- The conservative direct-main product-loop throttle is 3 hours.
- Recoverable blockers can enter the bounded automatic repair lane.
- Status `deferred` means a project was not selected on the latest scheduler
  tick because of pause, cadence, throttle, budget, or lock state. `Open
  Blockers` is a separate unresolved-blocker count, so a project can be
  deferred with `0` blockers when it is only waiting for cadence or throttle.

## Completed this session

- Changed the conservative direct-main Builder/Product Loop throttle from 30
  minutes to 3 hours.
- Added scheduler coverage proving direct-main Builder work remains deferred
  before the 3-hour throttle expires and becomes eligible at the 3-hour mark.
- Deployed the updated built Vampyre app to `wlkrlab` and restarted
  `vampyre.service`.
- Verified the installed runtime scheduler exports
  `DEFAULT_CONSERVATIVE_PRODUCT_LOOP_MIN_INTERVAL_MS=10800000`.
- Confirmed live `wlkrlab` status is ready with Work Pause inactive and Active
  Build Agent lock available.

## Next action

Let the daemon continue normally. KeepingUs and MiniMark are both deferred only
by the 3-hour conservative product-loop throttle.

Based on live status at `2026-05-31T14:18:07.295Z`, KeepingUs last ran at
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

Local proof after changing the conservative product-loop throttle to 3 hours:

- `corepack pnpm exec tsx --test tests/scheduler.test.ts` passed with 12
  passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 97 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.

Runtime proof on `wlkrlab`:

- `node dist/cli.js daemon install --host wlkrlab` deployed the updated app.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- Runtime scheduler constant check against
  `/home/wlkrlab/vampyre/app/dist/scheduler/scheduler.js` printed `10800000`
  milliseconds.
- Final `node dist/cli.js status --host wlkrlab` at
  `2026-05-31T14:18:07.295Z` reported Overall State `ready`, Work Pause
  `not paused`, Active Build Agent Lock `available`, KeepingUs Open Blockers
  `0`, MiniMark Open Blockers `0`, paletteWOW Open Blockers `0`, and Pinmark
  paused with `2` open blockers.

## Docs map

- Current roadmap: [to-do/ROADMAP.md](./to-do/ROADMAP.md)
- Docs routing: [map.md](./map.md)
- Architecture: [architecture/index.md](./architecture/index.md)
- CLI reference: [reference/cli/index.md](./reference/cli/index.md)
- Open docs and implementation follow-up: [todo/index.md](./todo/index.md)
