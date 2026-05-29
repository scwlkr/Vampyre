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

Pinmark macOS validation uses GitHub-hosted macOS Actions runners first. Linux
containers on `wlkrlab` are not sufficient for AppKit, SwiftUI,
ScreenCaptureKit, Xcode, signing, or TCC proof.
