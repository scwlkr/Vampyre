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
  blockers, request configured native validation after pushed output, and clean
  successful worktrees.
- Pinmark has hosted GitHub Actions native validation configured through
  `macos-validation.yml`.
- `vampyre validation request` can dispatch Pinmark native validation from
  `wlkrlab`, wait for completion, persist SQLite state, write reports, and show
  the result in status for operator-triggered checks.

## Completed this session

- Wired Build Agent output to request configured native validation after:
  - approved direct-main product-loop pushes, proven with Pinmark on `main`;
  - PR-mode branch pushes, covered by tests before the Owner-reviewed PR body is
    created.
- Added Build Agent report, PR body, GitHub issue comment, Telegram message, and
  Markdown report rendering for native-validation status and run URLs.
- Reused the existing native-validation state path so success resolves matching
  native validation blockers and failure/timeout records project-local blockers.
- Added tests for direct-main success, PR-mode success, failure, timeout, and
  projects without native validation configured.
- Deployed the updated daemon to `wlkrlab` and ran a docs-only Pinmark
  direct-main proof through the live Build Agent.

## Next action

Let the supervised Pinmark product loop continue to the next repo-local action:
add a Settings preference for the default export preset so new capture editors
can start in Original or Polished mode from the user's saved choice.

Automatic hosted native validation is now in the Build Agent path. Persistent
GUI/TCC Mac runner work remains a later add-on for live permission and app smoke
coverage.

## Blockers

- No daemon MVP proof blocker remains.
- Hosted routine macOS validation works for Pinmark through GitHub Actions.
- Pinmark missing-permission prompt behavior still needs validation on a Mac
  without Screen Recording permission or after an intentional TCC reset.
- Linux containers are not sufficient for AppKit, SwiftUI, Xcode,
  ScreenCaptureKit, signing, or TCC proof.

## Latest proof

Current Build Agent native-validation adoption proof:

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
