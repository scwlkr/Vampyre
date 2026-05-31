# Vampyre Status

## Current phase

Post-MVP Product Loop Proof.

The active proof has pivoted from Pinmark to MiniMark. Pinmark is preserved as a
paused Builder project until Vampyre has stronger permission-heavy native macOS
testing. MiniMark is now the active Builder/Product Loop target because its
baseline is a no-permission macOS markdown scratchpad that can validate quickly
on hosted macOS runners.

## Current state

- `wlkrlab` is the runtime host.
- Runtime workspace is `~/vampyre`.
- `vampyre.service` is supervised by `systemd --user`.
- The TypeScript/Node/`pnpm` repo builds and tests locally.
- Operational State is persisted in SQLite under `~/vampyre/data/vampyre.sqlite`.
- Runtime Project Registry now includes:
  - `minimark`: active Builder/Product Loop project for private `scwlkr/minimark`.
  - `palette-wow`: Safe/Watcher Mode for `scwlkr/paletteWOW`.
  - `screenshot-tool`: paused Builder/Product Loop project for private `scwlkr/pinmark`.
- MiniMark has hosted GitHub Actions native validation configured through
  `macos-validation.yml`.
- MiniMark Visual Proof is configured as optional through the
  `minimark-visual-proof` GitHub Actions artifact, selecting
  `minimark-product.png` when the app shell can produce a real screenshot.
- The Vampyre README now carries the existing `brand/vampyre_logo.PNG` logo and
  a static 3-repo Project Registry badge that counts all default registry
  entries, including paused projects.
- Builder-created app README files now include a "Supported with Vampyre"
  Shields badge.
- Builder-created app templates now generate the shared initial modular docs
  structure with lowercase `docs/status.md`; Vampyre status readers still fall
  back to legacy managed repos that use `docs/STATUS.md`.
- Pinmark remains private and paused with its existing native-validation/Visual
  Proof blockers preserved, but paused-project blockers no longer drive the
  Owner Action line.
- The conservative direct-main product-loop throttle is now 30 minutes.
- The latest runtime status shows the Active Build Agent lock available,
  MiniMark deferred only by `product-loop-throttle-conservative`, and no open
  MiniMark blockers.

## Completed this session

- Paused Pinmark in the repo default Project Registry and on `wlkrlab`.
- Added MiniMark as the active no-permission Builder/Product Loop profile.
- Added the `minimark` Builder repo template with project truth docs, SwiftPM
  baseline, and hosted macOS validation workflow.
- Updated Check-in owner-action logic so blockers on paused projects do not
  require Owner action while a different active project is eligible.
- Created formal GitHub approval issue
  `https://github.com/scwlkr/Vampyre/issues/20` for the MiniMark repo plan.
- Created private `scwlkr/minimark` from the MiniMark template.
- Fixed the MiniMark validation workflow to accept Vampyre's `ref_name`
  workflow-dispatch input and pushed MiniMark commit `2cc4fe2`.
- Deployed the updated Vampyre daemon to `wlkrlab`, restarted it, cleared the
  temporary Work Pause, and confirmed the scheduler selected MiniMark.
- Standardized Builder app templates on the shared initial docs structure:
  `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/index.md`, `docs/map.md`,
  lowercase `docs/status.md`, concepts, guides, reference, architecture,
  decisions, and todo docs.
- Updated Build Agent task selection and the Owner Check-in status surface to
  read lowercase `docs/status.md` with fallback to legacy `docs/STATUS.md`.
- Linked the existing `brand/vampyre_logo.PNG` logo and a 3-repo Project
  Registry Shields badge from the root README, and documented reusable badge
  snippets in `brand/BADGES.md`.
- Updated Builder-created app README templates so new managed Builder repos show
  a "Supported with Vampyre" badge.
- Diagnosed the apparent MiniMark stall: `vampyre.service` was running, but
  MiniMark was blocked by native-validation failure
  `native-validation:minimark:26691882262:failure`.
- Fixed MiniMark Swift validation blockers directly in the approved direct-main
  product loop with commits `5acf71a` and `9225aa4`; hosted macOS validation
  then passed with GitHub Actions run `26701676194`.
- The daemon selected MiniMark again and completed Build Agent run
  `run-20260531T030318Z-minimark`, pushing MiniMark commit `c48314c` with
  persisted editor wrapping and preview style settings.
- Reduced Vampyre's conservative direct-main product-loop throttle from 60
  minutes to 30 minutes and deployed the updated daemon to `wlkrlab`.

## Next action

Wait for the 30-minute conservative product-loop throttle to expire, then let
the daemon run MiniMark's next product action:

Add hosted macOS visual proof that launches MiniMark and uploads a
`minimark-visual-proof` artifact containing the deterministic sample screenshot.

## Blockers

- No Vampyre implementation blocker remains for the MiniMark pivot.
- No Vampyre implementation blocker remains for Builder app docs
  standardization.
- No open MiniMark blocker remains; native-validation blockers
  `26691882262` and `26701653195` are resolved.
- Pinmark still has `2` open blockers from GitHub Actions run `26687024974`,
  but the project is paused for permission-heavy native macOS testing and no
  longer drives Owner Action while paused.
- The Active Build Agent lock is currently available.

## Latest proof

Local proof after the Builder app docs standardization update:

- Focused test run
  `corepack pnpm exec tsx --test tests/builderRepoCreation.test.ts tests/status.test.ts tests/buildAgent.test.ts`
  passed with 23 passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 91 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.

Local proof after the Vampyre brand and badge update:

- Focused test run `corepack pnpm exec tsx --test tests/builderRepoCreation.test.ts`
  passed with 4 passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 91 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.

Local proof after the 30-minute Builder throttle update:

- Focused test run `corepack pnpm exec tsx --test tests/scheduler.test.ts`
  passed with 9 passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 91 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.

Runtime proof on `wlkrlab`:

- `node dist/cli.js pause 1h --host wlkrlab --reason "MiniMark pivot runtime registry update"` held project-changing work during the registry swap.
- `node dist/cli.js daemon install --host wlkrlab` deployed the built app.
- `node dist/cli.js builder repo create --host wlkrlab --control-repo scwlkr/Vampyre --project minimark --approval-kind builder-repo-plan --approval-key minimark-repo-plan --repo scwlkr/minimark --description "No-permission macOS markdown scratchpad with split editor, preview, autosave, recent documents, and .md export." --template minimark` created private `scwlkr/minimark` at initial commit `c7b8f9a`.
- MiniMark workflow fix commit `2cc4fe2` added the `ref_name` dispatch input
  required by Vampyre native validation.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- `node dist/cli.js validation request --host wlkrlab --project minimark --ref main --wait --timeout-seconds 1800` passed with GitHub Actions run `26691740795`: https://github.com/scwlkr/minimark/actions/runs/26691740795
- `node dist/cli.js resume --host wlkrlab` cleared the temporary Work Pause.
- Final `node dist/cli.js status --host wlkrlab` at
  `2026-05-30T18:39:10.416Z` reported Overall State `ready`, Work Pause
  `not paused`, Active Build Agent Lock `held`, Selected Project `minimark`,
  MiniMark Open Blockers `0`, Pinmark `project-paused`, and Owner Action
  `No owner action needed; MiniMark is selected for the next Build Agent run.`
- Runtime MiniMark clone is clean at `2cc4fe2`.
- `node dist/cli.js daemon install --host wlkrlab` deployed the latest built app
  with the Builder app docs standardization.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- `node dist/cli.js status --host wlkrlab` at `2026-05-30T18:52:57.200Z`
  reported Overall State `ready`, Work Pause `not paused`, Active Build Agent
  Lock `available`, Selected Project `none`, MiniMark `project-blocked`, and
  Owner Action `review open blockers for MiniMark`.
- `node dist/cli.js daemon install --host wlkrlab` deployed the brand/badge
  template update into the runtime workspace.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- `node dist/cli.js status --host wlkrlab` at `2026-05-30T20:42:15.093Z`
  reported Overall State `ready`, Work Pause `not paused`, Active Build Agent
  Lock `available`, Selected Project `none`, MiniMark `project-blocked`, and
  Owner Action `review open blockers for MiniMark`.
- `node dist/cli.js daemon status --host wlkrlab` showed `vampyre.service`
  active and running since `2026-05-30T20:42:12Z`, with heartbeats every 30
  seconds.
- `gh run view 26691882262 --repo scwlkr/minimark` showed the MiniMark blocker
  was a Swift 6 concurrency failure for `MiniMarkDocument.sample`.
- MiniMark commit `5acf71a` made `MiniMarkDocument` conform to `Sendable`; a
  follow-up validation run `26701653195` exposed a second app init compiler
  error.
- MiniMark commit `9225aa4` fixed the init locals; `node dist/cli.js validation
  request --host wlkrlab --project minimark --ref main --wait --timeout-seconds
  1800` passed with GitHub Actions run `26701676194`.
- `node dist/cli.js status --host wlkrlab` at `2026-05-31T03:03:57.832Z`
  reported Overall State `ready`, MiniMark Open Blockers `0`, Active Build
  Agent Lock `held`, and Selected Project `minimark`.
- Build Agent run `run-20260531T030318Z-minimark` completed, pushed MiniMark
  commit `c48314c` to `main`, removed its successful worktree, released the
  Active Build Agent lock, and passed hosted macOS validation with run
  `26701789520`.
- `node dist/cli.js daemon install --host wlkrlab` deployed the 30-minute
  throttle build, and `node dist/cli.js daemon restart --host wlkrlab`
  restarted `vampyre.service`.
- Final `node dist/cli.js status --host wlkrlab` at
  `2026-05-31T03:11:51.352Z` reported Overall State `ready`, Work Pause `not
  paused`, Active Build Agent Lock `available`, MiniMark Open Blockers `0`,
  MiniMark deferred only by `product-loop-throttle-conservative`, and next
  action `minimark-visual-proof`.

## Docs map

- Current roadmap: [to-do/ROADMAP.md](./to-do/ROADMAP.md)
- Docs routing: [map.md](./map.md)
- Architecture: [architecture/index.md](./architecture/index.md)
- CLI reference: [reference/cli/index.md](./reference/cli/index.md)
- Open docs and implementation follow-up: [todo/index.md](./todo/index.md)
