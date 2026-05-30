# Vampyre Status

## Current phase

Post-MVP Product Loop Proof.

The daemon MVP proof is closed. Vampyre is now proving that the supervised
daemon can keep Pinmark moving as a real continuous product loop while surfacing
runtime health, deferrals, budget posture, blockers, reviews, and validation
outcomes through the Owner Check-in Surface.

## Current state

- `wlkrlab` is the runtime host.
- Runtime workspace is `~/vampyre`.
- `vampyre.service` is supervised by `systemd --user`.
- The TypeScript/Node/`pnpm` repo builds and tests locally.
- Operational State is persisted in SQLite under `~/vampyre/data/vampyre.sqlite`.
- Runtime Project Registry defaults remain:
  - `palette-wow`: Safe/Watcher Mode for `scwlkr/paletteWOW`.
  - `screenshot-tool`: Builder/Product Loop project for private `scwlkr/pinmark`.
- GitHub remains the durable approval and review surface.
- Telegram is wired for notifications, `/status`, timed Work Pause commands,
  Daily Briefs, and unauthorized command alerting.
- Action-oriented Telegram notifications now include explicit GitHub Owner
  options for approve vs deny/request-changes decisions.
- The Check-in Summary model feeds CLI, Telegram status, and Daily Brief output.
  The rendered owner-action line distinguishes daemon-selected work that needs
  no Owner action from blockers that do need Owner review.
- Watcher Discovery can inspect managed Safe/Watcher repos and write reports.
- The Worktree Build Agent can validate, create task context, run worker
  commands, push PR-mode or approved direct-main output, surface results, record
  blockers, request configured native validation after pushed output, capture
  configured Visual Proof screenshots, send successful screenshots to Telegram,
  and clean successful worktrees.
- Pinmark has hosted GitHub Actions native validation configured through
  `macos-validation.yml`.
- Pinmark Visual Proof is configured through the `pinmark-visual-proof` GitHub
  Actions artifact, selecting `pinmark-product.png` as the product screenshot.
- `vampyre validation request` can dispatch Pinmark native validation from
  `wlkrlab`, wait for completion, persist SQLite state, write reports, and show
  the result in status for operator-triggered checks.

## Completed this session

- Added shared GitHub Owner decision text for Telegram notifications:
  - Approve: comment `VAMPYRE_APPROVED: accepted` on the linked review record,
    or approve/merge the PR for PR-mode work.
  - Deny/request changes: comment `VAMPYRE_DENIED: <reason or requested change>`
    on the linked review record, or request changes on the PR.
- Added those explicit options to Build Agent Telegram messages, Build Agent
  product screenshot captions, PR notifications, review-request notifications,
  and the durable GitHub review-record comments created by Vampyre.
- Updated Telegram Daily Brief/status owner-action wording so selected daemon
  work says `No owner action needed`, while blockers say `Owner action needed`.
- Deployed the updated daemon to `wlkrlab` and restarted `vampyre.service`.

## Next action

Owner action is currently needed for Pinmark's latest blocked Build Agent run.
Use the linked GitHub review record from the Telegram notification:

- Approve/accept the run by commenting `VAMPYRE_APPROVED: accepted` if the
  native-validation/Visual-Proof failure is acceptable for this run.
- Deny/request follow-up by commenting
  `VAMPYRE_DENIED: <reason or requested change>` with the required fix.

After those Pinmark blockers are handled, the next repo-local product action
remains: add capture-editor zoom controls so users can zoom the captured image
while placing annotations and crop bounds.

## Blockers

- No daemon MVP proof blocker remains.
- No Vampyre implementation or deployment blocker remains for this slice.
- Runtime status currently reports Pinmark deferred for `project-blocked` with
  two open blockers from GitHub Actions run `26687024974`:
  - Native validation failure: `Expected conclusion success, got failure; jobs
    SwiftPM and app build:failure`.
  - Visual Proof failure: `pinmark-visual-proof` artifact missing from the
    failed workflow run.
- Hosted routine macOS validation and hosted Visual Proof remain implemented in
  the Build Agent path; this latest Pinmark run failed in the managed project,
  not in Vampyre's notification change.
- Pinmark missing-permission prompt behavior still needs validation on a Mac
  without Screen Recording permission or after an intentional TCC reset.
- Linux containers are not sufficient for AppKit, SwiftUI, Xcode,
  ScreenCaptureKit, signing, or TCC proof.

## Latest proof

Current Telegram Owner-decision clarity proof:

- Focused test run
  `corepack pnpm exec tsx --test tests/buildAgent.test.ts tests/prWorkflow.test.ts tests/reviewWorkflow.test.ts tests/status.test.ts`
  passed with 26 passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 89 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.
- `node dist/cli.js daemon install --host wlkrlab` deployed the built app.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- Final `node dist/cli.js status --host wlkrlab` reported Overall State
  `ready`, Work Pause `not paused`, Active Build Agent Lock `available`,
  Selected Project `none`, paletteWOW Open Blockers `0`, Pinmark Open Blockers
  `2`, Pinmark deferred for `project-blocked`, and Owner Action
  `Owner action needed: review open blockers for Pinmark.`
- Direct SQLite blocker check on `wlkrlab` confirmed the two open Pinmark
  blockers are the native validation failure and missing Visual Proof artifact
  from GitHub Actions run `26687024974`.

Previous Build Agent Visual Proof adoption proof:

- `corepack pnpm exec tsx --test tests/buildAgent.test.ts tests/githubClient.test.ts tests/projectRegistry.test.ts tests/operationalState.test.ts` passed with 28 passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 88 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.
- Live proof run
  `node dist/cli.js agent run --host wlkrlab --project screenshot-tool ...`
  created Pinmark Run Journal `run-20260530T005640Z-screenshot-tool`, pushed
  direct-main docs commit `95270da`, ran `git diff --check`, automatically
  requested hosted macOS validation, captured Visual Proof from GitHub Actions
  run `26669923695`, and sent Telegram photo message `76`.

Previous Build Agent native-validation adoption proof:

- `corepack pnpm exec tsx --test tests/buildAgent.test.ts` passed with 12
  passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 85 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.
- `node dist/cli.js daemon install --host wlkrlab` deployed the built app.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- Live proof run
  `node dist/cli.js agent run --host wlkrlab --project screenshot-tool ...`
  created Pinmark Run Journal `run-20260530T001815Z-screenshot-tool`, pushed
  direct-main docs commit `cb6505e`, ran `git diff --check`, automatically
  requested hosted macOS validation, and recorded GitHub Actions run
  `26668895659`: https://github.com/scwlkr/pinmark/actions/runs/26668895659
- Final `node dist/cli.js status --host wlkrlab` reported Overall State
  `ready`, Work Pause `not paused`, Active Build Agent Lock `available`, Open
  Blockers `0` for both projects, and Pinmark Native Validation
  `completed/success` for run `26668895659`.

Previous runtime proof before this slice:

- `node dist/cli.js validation request --host wlkrlab --project screenshot-tool --ref main --wait --timeout-seconds 1800` dispatched hosted macOS validation for Pinmark and recorded successful GitHub Actions run `26647404430`: https://github.com/scwlkr/pinmark/actions/runs/26647404430
- Final `node dist/cli.js status --host wlkrlab` after blocker cleanup reported Overall State `ready`, Open Blockers `0` for both projects, Pinmark deferred for `product-loop-throttle-conservative`, and Native Validation `completed/success` for run `26647404430`.
- Local validation after the macOS validation runner change passed:
  - `corepack pnpm exec tsc -p tsconfig.json --noEmit`
  - `corepack pnpm test`
  - `corepack pnpm build`
  - `git diff --check`

## Docs map

- Current roadmap: [to-do/ROADMAP.md](./to-do/ROADMAP.md)
- Docs routing: [map.md](./map.md)
- Architecture: [architecture/index.md](./architecture/index.md)
- CLI reference: [reference/cli/index.md](./reference/cli/index.md)
- Open docs and implementation follow-up: [todo/index.md](./todo/index.md)
