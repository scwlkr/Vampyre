# Vampyre Roadmap

This is the current execution roadmap. Historical MVP proof detail lives in
[../deprecated/mvp-proof-checklist.md](../deprecated/mvp-proof-checklist.md).

## Vision

Vampyre is an always-on system for creating and sustaining software projects.
One central daemon manages a portfolio of projects, keeps existing projects
moving, and turns selected ideas into real running projects with minimal Owner
interaction and explicit guardrails.

## Product Principles

1. The daemon is the product.
2. The production runtime is `wlkrlab`; the MacBook is an operator workstation.
3. One central daemon manages the Project Portfolio.
4. GitHub is the durable approval and review surface.
5. Telegram is a notification and low-risk command surface.
6. Daemon-managed project work ends in PRs unless an approved policy allows
   direct-main output.
7. Never invent secrets, bypass missing access, or silently skip validation.
8. Preserve resumable Operational State and clear Run Journals.
9. Pace project-changing work by Token Budget.
10. Prefer visible Compounding Product Quality over random churn.

## MVP Proof Status

Closed.

The daemon MVP proof showed that a supervised Vampyre service on `wlkrlab`
could load multiple Project Profiles, persist scheduler and run state, use
GitHub and Telegram, perform Safe/Watcher output for `paletteWOW`, create the
private Pinmark Builder repository, and keep the product loop moving with
recorded proof.

## Current Milestone

Post-MVP Product Loop Proof.

The current milestone proves that Vampyre can keep Pinmark moving as a real
daemon-owned Builder/Product Loop project while still surfacing health,
deferrals, budget posture, blockers, reviews, and validation outcomes through
the Owner Check-in Surface.

## Current Implementation Slice

Teach the Build Agent to request configured native validation after project
output is pushed.

### Scope

- Direct-main product-loop output for Pinmark.
- PR-mode output for projects that do not allow direct-main output.
- Configured native validation provider: GitHub Actions.
- Result persistence in SQLite through existing `external_validation_runs`.
- Failed or timed-out validation creates or updates a project-local blocker.
- Check-in, GitHub, and Telegram surfaces link the validation run when useful.

### Acceptance Criteria

- Existing Linux-side validation still runs before output is pushed.
- After direct-main output, Vampyre fast-forwards the runtime clone and dispatches
  native validation for the pushed ref or commit.
- After PR-mode output, Vampyre can dispatch native validation for the branch and
  surface the result before Owner merge.
- Successful native validation resolves matching validation blockers.
- Failed native validation records a blocker and keeps the next action focused on
  the validation failure.
- Secret values are not printed or stored.
- Tests cover success, failure, timeout, and projects without native validation.

## Completed Phases

- Phase 0: TypeScript/Node/`pnpm` foundation, host doctor, host setup, daemon
  service controls, and runtime workspace.
- Phase 1: SQLite Operational State, Project Registry, default project profiles,
  and status rendering.
- Phase 2: Scheduler state, Codex budget summary, Work Pause, and one-agent
  selection.
- Phase 3: GitHub check, approval lookup, review issue workflow, PR upsert, and
  Telegram notification path.
- Phase 4: Worktree Build Agent, validation, reports, blockers, and
  Safe/Watcher discovery.
- Phase 5: Builder direction and repo-plan approval path for Pinmark.
- Phase 6: Builder repo creation and direct-main Pinmark product-loop policy.
- Phase 7: Owner Check-in Surface hardening, Telegram commands, Daily Briefs,
  and unauthorized command accounting.
- Phase 8: End-to-end daemon MVP proof on `wlkrlab`.
- Post-MVP: operator-triggered hosted macOS native validation for Pinmark.

## Later Work

- Persistent Mac runner for GUI/TCC smoke validation.
- Automatic native-validation adoption in the Build Agent.
- Richer failure classification and blocker recovery for native validation.
- CI for the Vampyre TypeScript suite.
- More complete Builder templates beyond `pinmark`.
- Container or sandbox isolation for non-MVP hardening.
- More granular GitHub token boundaries if later workflows require them.
- Better report retention and cleanup policy for preserved failure worktrees.

## Validation Contract

For Vampyre repo implementation work:

```sh
corepack pnpm exec tsc -p tsconfig.json --noEmit
corepack pnpm test
corepack pnpm build
git diff --check
```

Runtime-affecting changes normally also need:

```sh
node dist/cli.js daemon install --host wlkrlab
node dist/cli.js daemon restart --host wlkrlab
node dist/cli.js status --host wlkrlab
```

Docs-only changes can use a narrower proof if they do not affect runtime code.
