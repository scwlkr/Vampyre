# Vampyre Context

Vampyre is an always-on system for creating, improving, and sustaining software
projects with minimal Owner interaction and explicit guardrails.

The daemon is the product. CLI commands exist so the Owner can install, inspect,
pause, resume, diagnose, and trigger the daemon, but the MVP is not a manual
CLI-first workflow.

## Current Stage

Vampyre has passed the daemon MVP proof and is in the Post-MVP Product Loop
Proof.

The active proof is that one supervised daemon on `wlkrlab` can keep managed
projects moving through registry-driven scheduling, GitHub review records,
Telegram check-ins, SQLite state, disposable worktrees, and validation.

Current managed projects:

- `palette-wow`: Safe/Watcher project for `scwlkr/paletteWOW`.
- `screenshot-tool`: Builder/Product Loop project for private `scwlkr/pinmark`.

## Operating Model

- Runtime host: `wlkrlab`.
- Operator workstation: this MacBook, administering the host over `ssh wlkrlab`.
- Runtime workspace: `~/vampyre` on `wlkrlab`.
- Service manager: `systemd --user`.
- Stack: TypeScript on Node.js with `pnpm`.
- Persistent state: SQLite at `~/vampyre/data/vampyre.sqlite`.
- Project truth: GitHub records plus repo-local docs in each managed project.

The runtime workspace owns:

- `app/`: deployed Vampyre build artifacts.
- `config/`: `project-registry.json` and `vampyre.env`.
- `data/`: SQLite state.
- `logs/`: runtime logs.
- `repos/`: managed clones.
- `worktrees/`: disposable project-changing worktrees.
- `reports/`: run, discovery, and validation reports.
- `artifacts/`: tool caches and build artifacts.

## Vocabulary

**Vampyre** is the always-on system.

**Project** means a software product, repository, or initiative Vampyre creates
or sustains.

**Project Portfolio** is the set of projects managed by one central daemon.

**Project Registry** is daemon-owned configuration listing Project Profiles and
operational policy.

**Project Profile** is one registry entry: project id, display name, mode,
GitHub repo, cadence, autonomy policy, validation commands, pause state, and
optional native validation.

**Safe/Watcher Mode** sustains existing projects through issue handling, PR
review, feature work, docs, accessibility, validation, and daily forward motion.
Auto-safe work ends in an Owner-reviewed PR.

**Builder Mode** turns an approved raw idea or repo plan into a real project.
During approved continuous product loops, a Builder project can use direct-main
output if the registry policy says so.

**Daily Forward Motion** means visible useful progress, not activity for its own
sake.

**Payoff-backed Refactor** means internal cleanup justified by product,
reliability, testability, dependency, performance, accessibility, or future-work
payoff.

**GitHub** is the durable approval and review surface.

**Telegram** is the phone-first notification and low-risk command surface.

**Check-in Summary** is the shared status model rendered by CLI, Telegram
`/status`, and Daily Briefs.

**Work Pause** is a timed global pause that stops new project-changing work while
letting the daemon keep heartbeats, status, notifications, and safe polling
alive.

**Native Validation** is delegated validation for projects that cannot be proven
on `wlkrlab`, such as macOS apps. The implemented provider is GitHub Actions.

## Guardrails

- Do not print or persist secret values.
- Track only secret presence metadata.
- Do not use random existing project checkouts for daemon work.
- Managed project work happens under the configured runtime workspace.
- Daemon-managed project output uses PRs unless an approved project policy allows
  direct-main product-loop output.
- Vampyre must not merge its own daemon-created PRs.
- Builder-created repositories are private by default until a Launch Visibility
  Gate approves public visibility.
- Major Feature Candidates need Owner approval before significant build effort.
- Missing daemon capability blocks managed-project work only when the missing
  capability is required to proceed safely.

## Current Capability

Implemented local repo capability includes:

- Host setup and doctor checks for `wlkrlab`.
- `systemd --user` daemon install/start/stop/restart/status/logs.
- Project Registry creation and validation.
- SQLite migrations for projects, run journals, blockers, scheduler state,
  Work Pause, Telegram command state, notification delivery, unauthorized
  command attempt accounting, and external validation runs.
- Scheduler ticks with Budget Mode, project cadence, blockers, Work Pause, and
  a single Active Build Agent lock.
- Codex usage summarization from local Codex JSONL logs.
- CLI and Telegram check-in rendering from one summary model.
- Telegram `/status`, `/pause1min`, `/pause1hour`, `/pause1day`, `/resume`, Daily
  Brief delivery, and unauthorized command threshold alerts.
- GitHub auth checks, approval lookup, review issue workflow, PR upsert workflow,
  and GitHub Actions workflow dispatch/read helpers.
- Watcher discovery for managed Safe/Watcher repos.
- Worktree Build Agent runs with validation, worker task context, PR or
  direct-main output, GitHub/Telegram surfacing, reports, blocker handling, and
  successful-worktree cleanup.
- Builder repo creation for the approved `pinmark` template.
- Operator-triggered native validation request through GitHub Actions.

## Current Gap

Build Agent runs do not yet automatically request configured native validation
after pushing project output. The next implementation slice is to wire native
validation into direct-main and PR-mode Build Agent output handling.

Persistent GUI/TCC macOS runner support remains later work after hosted GitHub
Actions validation is automatic.

## Documentation Routing

Read these first for future work:

1. `AGENTS.md` for repo working rules.
2. `docs/STATUS.md` for the current handoff and next action.
3. `docs/map.md` for task-specific docs routing.
4. `docs/to-do/ROADMAP.md` for the active roadmap.
5. Relevant files under `docs/architecture/`, `docs/reference/`, and `docs/adr/`.
