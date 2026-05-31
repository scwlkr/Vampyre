# Vampyre Status

## Current phase

Post-MVP Product Loop Proof.

Vampyre is proving that one supervised daemon on `wlkrlab` can keep a portfolio
of managed projects moving with minimal Owner interaction. MiniMark remains the
active Builder/Product Loop proof. KeepingUs is now the next Builder onboarding
candidate: a private web app that should be easier to validate continuously
than permission-heavy native macOS work.

## Current state

- `wlkrlab` is the runtime host.
- Runtime workspace is `~/vampyre`.
- `vampyre.service` is supervised by `systemd --user`.
- Operational State is persisted in SQLite under
  `~/vampyre/data/vampyre.sqlite`.
- Runtime Project Registry currently includes:
  - `minimark`: active Builder/Product Loop project for private
    `scwlkr/minimark`.
  - `palette-wow`: Safe/Watcher Mode for `scwlkr/paletteWOW`.
  - `screenshot-tool`: paused Builder/Product Loop project for private
    `scwlkr/pinmark`.
- KeepingUs is not created yet. Its repo-plan approval issue is open at
  `https://github.com/scwlkr/Vampyre/issues/21`.
- The updated runtime app on `wlkrlab` can create approved Builder repositories
  from the `pinmark`, `minimark`, or `keepingus` templates.
- MiniMark has hosted GitHub Actions validation through `macos-validation.yml`.
- Pinmark remains private and paused until permission-heavy GUI/TCC testing is
  stronger.
- The conservative direct-main product-loop throttle is 30 minutes.
- Recoverable blockers can enter the bounded automatic repair lane.

## Completed this session

- Added `keepingus` as a reusable Builder repo template.
- Added a dependency-light static web app baseline for KeepingUs with:
  - modular project docs using lowercase `docs/status.md`;
  - `package.json` scripts for `corepack pnpm test`, `corepack pnpm build`,
    and `corepack pnpm start`;
  - Node tests for private-circle profile visibility, post photo requirements,
    and simple Nice/Vice feed ranking;
  - static `web/` product shell and build script;
  - hosted GitHub Actions workflow `web-validation.yml`.
- Updated Builder repo creation so an approved new Builder project can be
  appended to the runtime Project Registry instead of requiring a pre-existing
  profile.
- Added `docs/builder-intake/keepingus/repo-plan.md`.
- Created formal GitHub approval issue
  `https://github.com/scwlkr/Vampyre/issues/21` for the KeepingUs repo plan.
- Updated the approval checker so the documented comment form
  `VAMPYRE_APPROVED: accepted` satisfies the approval marker requirement.
- Deployed the updated built Vampyre app to `wlkrlab` and restarted
  `vampyre.service`.

## Next action

Owner approval is required before Vampyre creates the private
`scwlkr/keepingus` repository.

Open this GitHub issue:

`https://github.com/scwlkr/Vampyre/issues/21`

Approve by adding this issue comment:

`VAMPYRE_APPROVED: accepted`

Deny or request changes by adding a comment starting with:

`VAMPYRE_DENIED: <what should change>`

After approval, run:

```sh
node dist/cli.js builder repo create \
  --host wlkrlab \
  --control-repo scwlkr/Vampyre \
  --project keepingus \
  --approval-kind builder-repo-plan \
  --approval-key keepingus-repo-plan \
  --repo scwlkr/keepingus \
  --description "Private photo-sharing web app for close friends and family." \
  --template keepingus
```

Then confirm `vampyre status --host wlkrlab` shows KeepingUs in the Project
Registry with hosted web validation configured.

## Blockers

- KeepingUs repository creation is blocked on Owner approval in GitHub issue
  `#21`.
- No open MiniMark blocker remains.
- Pinmark still has `2` open blockers from GitHub Actions run `26687024974`,
  but the project is paused and does not drive Owner Action while paused.

## Latest proof

Local proof after the KeepingUs Builder template update:

- Focused test run
  `corepack pnpm exec tsx --test tests/builderRepoCreation.test.ts tests/projectRegistry.test.ts`
  passed with 7 passing tests.
- Focused KeepingUs template test ran the generated repo's
  `node --test tests/keepingusPolicy.test.mjs` and `node scripts/build.mjs`.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 96 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.

Runtime proof on `wlkrlab`:

- `node dist/cli.js daemon install --host wlkrlab` deployed the built app with
  the KeepingUs Builder template.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- `node dist/cli.js approval check --host wlkrlab --repo scwlkr/Vampyre
  --project keepingus --kind builder-repo-plan --key keepingus-repo-plan`
  correctly reported Status `missing` until the Owner approval comment is
  added.
- `node dist/cli.js status --host wlkrlab` at
  `2026-05-31T04:17:07.699Z` reported Overall State `ready`, Work Pause
  `not paused`, Active Build Agent Lock `available`, Selected Project `none`,
  MiniMark Open Blockers `0`, and MiniMark deferred only by
  `product-loop-throttle-conservative`.
- MiniMark's latest hosted macOS validation was successful:
  `https://github.com/scwlkr/minimark/actions/runs/26702915416`.

## Docs map

- Current roadmap: [to-do/ROADMAP.md](./to-do/ROADMAP.md)
- Docs routing: [map.md](./map.md)
- Architecture: [architecture/index.md](./architecture/index.md)
- CLI reference: [reference/cli/index.md](./reference/cli/index.md)
- Open docs and implementation follow-up: [todo/index.md](./todo/index.md)
