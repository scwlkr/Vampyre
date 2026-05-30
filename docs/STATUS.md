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
- The Check-in Summary model feeds CLI, Telegram status, and Daily Brief output.
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

- Added first-class Visual Proof config to Project Registry and Operational
  State.
- Added GitHub Actions artifact listing/downloading primitives and a ZIP image
  extractor for screenshot artifacts.
- Wired Build Agent output to capture required Visual Proof after native
  validation, persist screenshots under `reports/visual-proof/`, include status
  in reports/GitHub records, block required screenshot failures, and send
  successful screenshots through Telegram `sendPhoto`.
- Updated Pinmark's hosted macOS validation workflow to launch the packaged app,
  capture `pinmark-product.png`, and upload the `pinmark-visual-proof` artifact.
- Updated the runtime Project Registry on `wlkrlab` so Pinmark requires Visual
  Proof from that artifact.
- Deployed the updated daemon to `wlkrlab` and ran a docs-only Pinmark
  direct-main Build Agent proof that sent the product screenshot to Telegram.

## Next action

Let the supervised Pinmark product loop continue to the next repo-local action:
add a Settings preference for the default export preset so new capture editors
can start in Original or Polished mode from the user's saved choice.

Automatic hosted native validation and hosted Visual Proof are now in the Build
Agent path. Persistent GUI/TCC Mac runner work remains a later add-on for live
permission and deeper app smoke coverage.

## Blockers

- No daemon MVP proof blocker remains.
- Hosted routine macOS validation works for Pinmark through GitHub Actions.
- Hosted Visual Proof works for Pinmark through the GitHub Actions screenshot
  artifact and Telegram photo delivery.
- Pinmark missing-permission prompt behavior still needs validation on a Mac
  without Screen Recording permission or after an intentional TCC reset.
- Linux containers are not sufficient for AppKit, SwiftUI, Xcode,
  ScreenCaptureKit, signing, or TCC proof.

## Latest proof

Current Build Agent Visual Proof adoption proof:

- `corepack pnpm exec tsx --test tests/buildAgent.test.ts tests/githubClient.test.ts tests/projectRegistry.test.ts tests/operationalState.test.ts` passed with 28 passing tests.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 88 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.
- Pinmark workflow commit `83cd3e4` added the hosted product screenshot
  artifact step, and GitHub Actions run `26669832706` completed successfully
  with non-expired artifact `pinmark-visual-proof`.
- `node dist/cli.js daemon install --host wlkrlab` deployed the built app.
- `node dist/cli.js daemon restart --host wlkrlab` restarted
  `vampyre.service`.
- Live proof run
  `node dist/cli.js agent run --host wlkrlab --project screenshot-tool ...`
  created Pinmark Run Journal `run-20260530T005640Z-screenshot-tool`, pushed
  direct-main docs commit `95270da`, ran `git diff --check`, automatically
  requested hosted macOS validation, captured Visual Proof from GitHub Actions
  run `26669923695`, and sent Telegram photo message `76`.
- The captured screenshot is stored at
  `/home/wlkrlab/vampyre/reports/visual-proof/screenshot-tool/run-20260530T005640Z-screenshot-tool/pinmark-product.png`;
  local inspection confirmed it is a 1024x768 PNG showing Pinmark's real macOS
  permission window.
- Final `node dist/cli.js status --host wlkrlab` reported Overall State
  `ready`, Work Pause `not paused`, Active Build Agent Lock `available`, Open
  Blockers `0` for both projects, and Pinmark Native Validation
  `completed/success` for run `26669923695`.

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
