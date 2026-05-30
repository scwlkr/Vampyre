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
- Pinmark remains private and paused with its existing native-validation/Visual
  Proof blockers preserved, but paused-project blockers no longer drive the
  Owner Action line.
- The latest runtime status shows MiniMark selected with an active Build Agent
  lock for `run-20260530T183653Z-minimark`.

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

## Next action

Let the in-flight MiniMark Build Agent run finish:

- Run Journal: `run-20260530T183653Z-minimark`
- Task context:
  `/home/wlkrlab/vampyre/reports/build-agent/minimark/run-20260530T183653Z-minimark-task-context.md`
- Worktree:
  `/home/wlkrlab/vampyre/worktrees/minimark-20260530T183653Z`

After it finishes, run `node dist/cli.js status --host wlkrlab`. If it blocked,
handle the MiniMark blocker. If it completed, inspect the MiniMark repo output
and verify hosted macOS validation/optional visual proof behavior before
choosing the next MiniMark product action. The latest built app has been staged
with `daemon install`, but `vampyre.service` was not restarted after that final
install so the active MiniMark run would not be interrupted.

## Blockers

- No Vampyre implementation blocker remains for the pivot.
- No runtime deployment blocker remains for the pivot.
- MiniMark currently has `0` open blockers.
- Pinmark still has `2` open blockers from GitHub Actions run `26687024974`,
  but the project is paused for permission-heavy native macOS testing and no
  longer drives Owner Action while paused.
- A MiniMark Build Agent run is currently active; do not start another
  project-changing run until the active lock clears.

## Latest proof

Local proof after the final docs/status update:

- Focused test run
  `corepack pnpm exec tsx --test tests/projectRegistry.test.ts tests/status.test.ts tests/builderRepoCreation.test.ts`
  passed with 11 passing tests.
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
- After final local validation, `node dist/cli.js daemon install --host wlkrlab`
  staged the latest built app on the runtime host without restarting the
  service, preserving the active MiniMark Build Agent run.

## Docs map

- Current roadmap: [to-do/ROADMAP.md](./to-do/ROADMAP.md)
- Docs routing: [map.md](./map.md)
- Architecture: [architecture/index.md](./architecture/index.md)
- CLI reference: [reference/cli/index.md](./reference/cli/index.md)
- Open docs and implementation follow-up: [todo/index.md](./todo/index.md)
