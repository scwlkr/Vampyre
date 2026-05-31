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
- The conservative direct-main product-loop throttle is 30 minutes.
- Recoverable blockers can enter the bounded automatic repair lane.

## Completed this session

- Verified the Owner approval comment on
  `https://github.com/scwlkr/Vampyre/issues/21` from `wlkrlab`.
- Created private `scwlkr/keepingus` through Vampyre Builder repo creation.
- Recorded KeepingUs in the runtime Project Registry.
- Requested hosted GitHub Actions validation for KeepingUs; run
  `26703167520` passed.
- Caught and fixed a runtime validation mismatch: `corepack` is not on the
  non-interactive `wlkrlab` Build Agent PATH, so KeepingUs validation now uses
  `pnpm test` and `pnpm build`.
- Ran a manual validation-only Build Agent pass for KeepingUs; it passed and
  resolved the three temporary validation blockers.
- Added KeepingUs to the repo default Project Registry and updated the root
  Project Registry badge to `4 repos`.
- Updated project docs and tests so the source tree reflects KeepingUs as an
  active managed project.
- Deployed the updated built Vampyre app to `wlkrlab`, restarted
  `vampyre.service`, and cleared the temporary Work Pause.

## Next action

Let the daemon continue normally. KeepingUs and MiniMark are both deferred only
by the conservative product-loop throttle.

When the throttle expires, the next likely KeepingUs product action is:

Build the first real product slice: a local private-circle demo with sample
members, multi-photo posts, captions, Nice/Vice reactions, and profile cards,
keeping persistence mocked until the interaction model is proven.

## Blockers

- No open KeepingUs blocker remains.
- No open MiniMark blocker remains.
- Pinmark still has `2` open blockers from GitHub Actions run `26687024974`,
  but the project is paused and does not drive Owner Action while paused.

## Latest proof

Local proof after adding KeepingUs to the default registry and fixing
KeepingUs validation commands:

- Focused test run
  `corepack pnpm exec tsx --test tests/projectRegistry.test.ts tests/builderRepoCreation.test.ts`
  passed with 7 passing tests.
- Focused integration expectations for status, scheduler, operational state,
  review workflow, and daemon control surface passed with 31 passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 96 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.

Runtime proof on `wlkrlab`:

- `node dist/cli.js approval check --host wlkrlab --repo scwlkr/Vampyre
  --project keepingus --kind builder-repo-plan --key keepingus-repo-plan`
  reported Status `approved`, with issue-comment evidence:
  `https://github.com/scwlkr/Vampyre/issues/21#issuecomment-4585689736`.
- `node dist/cli.js builder repo create --host wlkrlab --control-repo
  scwlkr/Vampyre --project keepingus --approval-kind builder-repo-plan
  --approval-key keepingus-repo-plan --repo scwlkr/keepingus --description
  "Private photo-sharing web app for close friends and family." --template
  keepingus` created private `scwlkr/keepingus` at commit `cb0dd2a`.
- `node dist/cli.js validation request --host wlkrlab --project keepingus
  --ref main --wait --timeout-seconds 900` passed with GitHub Actions run
  `26703167520`: `https://github.com/scwlkr/keepingus/actions/runs/26703167520`.
- `node dist/cli.js agent run --host wlkrlab --project keepingus --task
  "Validate KeepingUs after switching runtime validation commands to pnpm."`
  passed `pnpm test` and `pnpm build`, removed its worktree, and resolved
  `3` prior validation blockers.
- `node dist/cli.js daemon install --host wlkrlab` deployed the updated app.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- Final `node dist/cli.js status --host wlkrlab` at
  `2026-05-31T04:32:27.679Z` reported Overall State `ready`, Work Pause
  `not paused`, Active Build Agent Lock `available`, KeepingUs Open Blockers
  `0`, MiniMark Open Blockers `0`, and both active Builder projects deferred
  only by `product-loop-throttle-conservative`.

## Docs map

- Current roadmap: [to-do/ROADMAP.md](./to-do/ROADMAP.md)
- Docs routing: [map.md](./map.md)
- Architecture: [architecture/index.md](./architecture/index.md)
- CLI reference: [reference/cli/index.md](./reference/cli/index.md)
- Open docs and implementation follow-up: [todo/index.md](./todo/index.md)
