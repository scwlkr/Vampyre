# Vampyre Agent Instructions

## Source of truth

Before non-trivial work, read:

- `CONTEXT.md`
- `docs/to-do/ROADMAP.md`
- `docs/STATUS.md`
- relevant files in `docs/adr/`

Treat the roadmap and status file as the execution contract unless the Owner explicitly changes direction.

## Project rules

- Vampyre is daemon-first. Do not reframe the MVP as a manual CLI-first tool.
- The real runtime target is `wlkrlab`; the current MacBook is only an operator workstation via `ssh wlkrlab`.
- Runtime workspace, SQLite state, logs, cloned repos, disposable worktrees, run journals, reports, and artifacts belong on `wlkrlab`.
- Use TypeScript on Node.js with `pnpm`.
- Use `systemd --user` for MVP daemon supervision on `wlkrlab`.
- GitHub is the formal approval and review surface. Telegram is for notifications and links.
- Keep Builder-created repos private by default until a Launch Visibility Gate approves public visibility.

## Working rules

- Keep changes narrow and tied to the current roadmap phase.
- Before continuing managed-project work, confirm it advances Vampyre itself; if a missing daemon capability is the blocker, build that capability first.
- Update `docs/STATUS.md` after every meaningful implementation session with current phase, completed work, latest proof, blockers, and exact next action.
- After successful chats, keep `docs/STATUS.md` handoff-ready, then commit and push scoped changes.
- Do not print or persist secret values. Track only secret presence metadata.
- Do not use random existing project checkouts for daemon work; use the configured Workspace Root.
- Validate changes with the repo's available commands and report what was and was not validated.
