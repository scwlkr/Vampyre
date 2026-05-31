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

The current milestone proves that Vampyre can keep MiniMark moving as a real
daemon-owned Builder/Product Loop project while still surfacing health,
deferrals, budget posture, blockers, reviews, and validation outcomes through
the Owner Check-in Surface. Pinmark is paused until Vampyre has stronger native
macOS permission/TCC testing.

## Current Implementation Slice

Add bounded automatic recovery for project-local blockers that the daemon can
repair without Owner input.

### Scope

- Classify known recoverable blockers separately from owner-required blockers.
- Let recoverable blockers schedule a Build Agent repair run instead of
  returning `project-blocked`.
- Generate repair task context from the blocker and latest native-validation
  result before normal product next actions.
- Keep hard stops for owner-required blockers, mixed blocker sets, and repeated
  recoverable failures beyond the bounded retry limit.
- Deploy the updated daemon to `wlkrlab` after validation.

### Acceptance Criteria

- Existing Linux-side validation still runs before direct-main output is pushed.
- Native validation failure and timeout blockers can trigger repair runs without
  Owner intervention.
- Required Visual Proof failure and Build Agent validation-failure blockers can
  trigger repair runs without Owner intervention.
- Three open recoverable blockers for the same project stop auto-recovery and
  surface owner-required review.
- Owner check-ins do not ask for blocker review while a recoverable repair run
  is schedulable.
- Secret values are not printed or stored.
- Builder-created repos remain private until a later Launch Visibility Gate
  approves public visibility.

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
- Post-MVP: Build Agent automatic native-validation adoption for direct-main and
  PR-mode output.
- Post-MVP: Build Agent Visual Proof adoption for visual Builder products.
- Post-MVP: Pinmark paused in favor of MiniMark until permission-heavy macOS
  app testing is stronger.
- Post-MVP: Builder app templates standardized on the shared initial modular
  docs structure.
- Post-MVP: bounded auto-recovery for recoverable blockers.

## Later Work

- Persistent Mac runner for GUI/TCC smoke validation.
- Richer blocker recovery beyond the current bounded auto-repair lane.
- CI for the Vampyre TypeScript suite.
- More complete Builder templates beyond `pinmark` and `minimark`.
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
