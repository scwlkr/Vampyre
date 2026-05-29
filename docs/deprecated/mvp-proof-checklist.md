# Vampyre MVP Proof Checklist

Last live proof refresh: `2026-05-29T02:06Z` on `wlkrlab`.

This checklist maps the Phase 8 proof and Definition of Done in `docs/to-do/ROADMAP.md` to concrete evidence. It records secret presence only; no secret values belong here.

## Result

The central daemon MVP proof is demonstrated on `wlkrlab`, and Phase 8 is closed as the daemon MVP proof. Remaining work is product-loop follow-through, not missing daemon proof capability: `paletteWOW` PR `#18` is merged and needs runtime sync/cleanup, and Pinmark still needs hands-on native UI and Screen Recording validation on the Mac operator workstation.

## Phase 8 Proof

- [x] Supervised daemon runs on `wlkrlab`.
  - Evidence: `node dist/cli.js daemon status --host wlkrlab` reports `vampyre.service` active under `systemd --user`, running `/usr/bin/node /home/wlkrlab/vampyre/app/dist/daemon/runDaemon.js` since `2026-05-28 20:33:11 CDT`.
- [x] Both MVP Project Profiles load from the runtime Project Registry.
  - Evidence: `node dist/cli.js status --host wlkrlab` reports `paletteWOW (palette-wow)` in Safe/Watcher Mode and `Pinmark (screenshot-tool)` in Builder Mode.
- [x] Runtime Workspace state lives on `wlkrlab`.
  - Evidence: status reports database `/home/wlkrlab/vampyre/data/vampyre.sqlite` and registry `/home/wlkrlab/vampyre/config/project-registry.json`; runtime repos and worktrees are under `/home/wlkrlab/vampyre/repos` and `/home/wlkrlab/vampyre/worktrees`.
- [x] Budget-aware scheduling and one Active Build Agent limit are active.
  - Evidence: status reports Budget `codex/conservative`, Active Build Agent Lock `available`, Selected Project `none`, and scheduler decisions for both profiles after completed Build Agent runs.
- [x] GitHub integration handles auth, approvals, review records, and PRs from the runtime host.
  - Evidence: `node dist/cli.js github check --host wlkrlab --repo scwlkr/Vampyre`, `--repo scwlkr/paletteWOW`, and `--repo scwlkr/pinmark` all pass; Builder approvals resolve from GitHub issues `#6` and `#8`; Vampyre PR `#18` is merged; `paletteWOW` PR `#18` merged at `2026-05-29T01:57:53Z`.
- [x] Telegram notification delivery works from the runtime host.
  - Evidence: the Phase 8 checkpoint ping completed successfully and sent Telegram message `37`; the Phase 8 PR upsert sent Telegram message `38`.
- [x] SQLite restart/resume state and Run Journals are preserved.
  - Evidence: status reports `Migrations Applied This Run: none`, `paletteWOW` Run Journals `7`, and the latest Run Journal `run-20260529T011906Z-palette-wow|palette-wow|completed`.
- [x] Project Blocker behavior is project-local and resolvable.
  - Evidence: SQLite reports two prior `Build Agent validation-failure` blockers for `palette-wow` as `resolved` at `2026-05-29T00:35:17.662Z`; both Project Profiles currently report `Open Blockers: 0`.
- [x] Safe/Watcher Mode completed discovery and first safe forward motion for `paletteWOW`.
  - Evidence: `node dist/cli.js watcher discover --host wlkrlab --project palette-wow` completed at `2026-05-29T01:41:57.918Z`, inspected clean commit `cabc80b`, confirmed project-truth docs are present, inferred the Rails validation ladder, and wrote `latest.md` plus `latest.json`; `paletteWOW` PR `#17` was merged after adding project-truth docs.
- [x] Builder Mode produced the screenshot-tool direction, approval flow, repo creation, and initial project start.
  - Evidence: Builder Vision Pair and Repo Plan docs exist under `docs/builder-intake/screenshot-tool/`; GitHub approval checks for issues `#6` and `#8` pass; private repo `scwlkr/pinmark` exists; runtime clone `/home/wlkrlab/vampyre/repos/pinmark` is clean at `0ef8162` and contains `CONTEXT.md`, `docs/ROADMAP.md`, and `docs/STATUS.md`.
- [x] Worktree Isolation is used for project-changing work.
  - Evidence: Build Agent runs created isolated worktrees, removed successful no-change worktrees, preserved failed validation worktrees for inspection, and produced `paletteWOW` PR `#18` from branch `vampyre/build-agent/palette-wow/20260529T011906Z`.
- [x] Status and proof artifacts make the next action clear.
  - Evidence: this checklist records the Phase 8 proof map, and `docs/STATUS.md` records current phase, proof, blockers, cleanup, and the exact next action.

## Runtime Worktree Cleanup

- Removed stale successful worktree `/home/wlkrlab/vampyre/worktrees/palette-wow-project-truth-docs` after confirming it was clean, its remote branch was gone, and commit `eee321d` is contained in the runtime clone's `main`.
- Left preserved validation-failure worktrees `/home/wlkrlab/vampyre/worktrees/palette-wow-20260529T003009Z` and `/home/wlkrlab/vampyre/worktrees/palette-wow-20260529T003154Z` in place because they still document earlier blocker behavior.

## Follow-Through

- Fast-forward the `paletteWOW` runtime clone and review cleanup for any successful runtime worktree or branch left after merged PR `#18`.
- Run hands-on Pinmark native UI and Screen Recording validation on the Mac operator workstation.
- Treat Pinmark hands-on validation as post-MVP product follow-through, outside the closed daemon MVP proof.
