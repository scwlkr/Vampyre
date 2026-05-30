# `status`

Renders the Owner Check-in Surface from runtime state.

## Usage

```sh
node dist/cli.js status --host wlkrlab [--workspace-root ~/vampyre]
node dist/cli.js status --local --json --workspace-root <path>
```

## Output Includes

- Work Pause state.
- Scheduler budget, selected project, and decisions.
- Codex usage when available.
- Active Build Agent lock state.
- Project run journal counts and blocker counts.
- Latest repo-local `docs/status.md` next action from managed clones, with
  fallback to legacy `docs/STATUS.md`.
- Latest native-validation result when recorded.

## Source

- `src/status/vampyreStatus.ts`
- `src/checkin/checkInSummary.ts`
