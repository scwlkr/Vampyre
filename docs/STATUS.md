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
  blockers, and clean successful worktrees.
- Pinmark has hosted GitHub Actions native validation configured through
  `macos-validation.yml`.
- `vampyre validation request` can dispatch Pinmark native validation from
  `wlkrlab`, wait for completion, persist SQLite state, write reports, and show
  the result in status.

## Completed this session

- Applied the PerfectDocs documentation structure while keeping the existing
  repo-contract paths:
  - `CONTEXT.md`
  - `docs/STATUS.md`
  - `docs/to-do/ROADMAP.md`
- Added docs routing with `docs/index.md`, `docs/map.md`, and `docs/AGENTS.md`.
- Added compact concepts, guides, reference, architecture, decisions, and todo
  sections.
- Added a repo-local docs audit skill under `.agents/skills/docs-audit/`.
- Added `CHANGELOG.md` and a no-op `.codex/config.toml` placeholder.
- Moved uncertain or not-yet-implemented claims into `docs/todo/` and the active
  project roadmap instead of source-of-truth docs.
- Updated the macOS native-validation handoff so its exact next slice starts at
  Build Agent adoption, not the already-completed hosted workflow/CLI phases.

## Next action

Teach the Build Agent to request configured native validation for macOS projects
after pushing direct-main or PR-mode output, then use the result to resolve
success, create/update project-local blockers, and surface failed native
validation in GitHub/Telegram.

Persistent GUI/TCC Mac runner work remains a later add-on after the hosted
workflow path is automatic.

## Blockers

- No daemon MVP proof blocker remains.
- Hosted routine macOS validation works for Pinmark through GitHub Actions.
- Build Agent runs do not yet request native validation automatically after
  project output.
- Pinmark missing-permission prompt behavior still needs validation on a Mac
  without Screen Recording permission or after an intentional TCC reset.
- Linux containers are not sufficient for AppKit, SwiftUI, Xcode,
  ScreenCaptureKit, signing, or TCC proof.

## Latest proof

Current docs-pass proof:

- `node dist/cli.js --help` matched the documented command surface.
- Local markdown link target check passed for 74 Markdown files.
- `corepack pnpm exec tsc -p tsconfig.json --noEmit` passed.
- `corepack pnpm test` passed with 81 passing tests.
- `corepack pnpm build` passed.
- `git diff --check` passed.
- `node dist/cli.js status --host wlkrlab` reported Overall State `ready`,
  Work Pause `not paused`, Active Build Agent Lock `available`, Open Blockers
  `0` for both projects, and Pinmark Native Validation `completed/success` for
  run `26647404430`.

Previous runtime proof before this docs pass:

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
