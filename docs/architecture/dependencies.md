# Dependencies

## Runtime Dependencies

- Node.js `>=20`.
- `pnpm`.
- Git.
- SQLite CLI.
- `systemd --user` on `wlkrlab`.
- SSH access to `wlkrlab`.

## npm Dependencies

Runtime dependencies are intentionally minimal. `package.json` currently lists
development dependencies:

- `typescript`
- `tsx`
- `@types/node`

## External Services

- GitHub REST API for auth checks, issues, PRs, repository creation, labels,
  comments, and Actions workflows.
- Telegram Bot API for notifications, `/status`, pause/resume commands, Daily
  Briefs, and unauthorized command alerts.
- Codex local session JSONL logs for budget usage summary.

## Native Validation

MiniMark and Pinmark macOS validation use GitHub-hosted macOS Actions runners
first. MiniMark is the active no-permission validation target. Pinmark is paused
until Vampyre has stronger permission-heavy GUI/TCC validation. Linux containers
on `wlkrlab` are not sufficient for AppKit, SwiftUI, ScreenCaptureKit, Xcode,
signing, or TCC proof.
