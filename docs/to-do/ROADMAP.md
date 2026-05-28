# Vampyre Project Roadmap

## Vision

**Vampyre** is an always-on AI PR forge: a daemonized orchestration system that converts high-level product goals into a controlled stream of GitHub issues, implementation branches, and reviewable pull requests with explicit human approval gates.

## Safe Mode Product Principles

1. Never push directly to `main`.
2. Never merge its own pull requests.
3. Never invent secrets or bypass missing secret checks.
4. Never auto-implement oversized tasks (`L`/`XL`), always split.
5. Always run tests before opening a PR.
6. Always maintain resumable state.
7. Human remains final authority for risk, architecture, and merge decisions.

## Modes

### Builder Mode
- Optimized for building large projects relatively quickly through a looping plan>build>test mechanism.
- Can auto-build in the background and can ping user when questions or decisions needed and continue to work on what can be worked on while waiting response from user.
- Must escalate auth/security/API/payments/destructive DB actions.
- undecided: builder mode should be setup in such a way that the model can experiment and play around in an environment and have basicslly full control this may need to be a docker or container enviroment or some other implementation where an agent can work freely and uninhibited.

### Safe Mode
- Optimized for sensitive repos (e.g., language/compiler/runtime).
- Requires explicit human approval before implementation.
- meant to be more of a product "Watcher" safe mode it optimized for watching a project and passively providing feature/upgrade ideas, as well as handling issues or reviewing PR's

## High-Level Architecture

### Core Components (TypeScript)
- `daemon.ts` — process lifecycle, startup, health, graceful shutdown.
- `scheduler.ts` — periodic loop coordinator + event-trigger dispatcher.
- `state.ts` — SQLite state store + run journals + idempotency keys.
- `github.ts` — GitHub API wrapper (issues, labels, comments, PRs, checks).
- `codex.ts` — worker launcher abstraction (one-shot agent tasks).
- `telegram.ts` — human interrupt channel and command parser.
- `policy.ts` — approval/risk/size/guardrail evaluation.
- `worktree.ts` — disposable git worktree lifecycle manager.
- `secrets.ts` — environment/secret resolution, missing-secret detection.

### Persistent State
- SQLite (recommended: better-sqlite3 or Prisma SQLite).
- Tables:
  - `projects`
  - `goals`
  - `issues_cache`
  - `runs`
  - `workers`
  - `events`
  - `blockers`
  - `secrets_status` (presence metadata only, no secret values)

### Control Plane
- GitHub labels = task state machine.
- GitHub comments = command triggers (`/vampyre ...`).
- Telegram = asynchronous control + unblock flow.

## GitHub Label State Machine

Primary status labels:
- `vampyre:idea`
- `vampyre:needs-approval`
- `vampyre:approved`
- `vampyre:working`
- `vampyre:blocked`
- `vampyre:pr-open`
- `vampyre:done`
- `vampyre:rejected`

Task metadata labels:
- Size: `size:xs|s|m|l|xl`
- Risk: `risk:low|medium|high|dangerous`
- Type: `type:planning|feature|test|docs|refactor|infra|bug|research`
- Agent profile: `agent:xhigh-plan|high-architecture|medium-implement|low-cleanup|low-docs`

## Operational Loops

Run these as independent jobs, not a single monolith loop:

1. **Event loop (near real-time):**
   - GitHub issue label/comment changes
   - PR comments (e.g., `/vampyre fix`)
   - CI status changes
   - Telegram commands

2. **Implementation loop (every 15 min):**
   - Pull approved work queue
   - Enforce capacity and policy
   - Launch workers for eligible issues

3. **Health/Sweeper loop (hourly):**
   - Detect stuck runs, stale branches, failed agents
   - Requeue or mark blocked

4. **Planning loop (daily):**
   - Generate idea issues from roadmap gaps
   - Refresh dependency graph

5. **Status loop (every 6 hours):**
   - Summarize progress and blockers to Telegram + GitHub summary issue

## Worker Execution Model

Per issue execution:
1. `git fetch`
2. Create disposable worktree
3. Create branch `vampyre/issue-<id>-<slug>`
4. Run implementer agent with issue contract
5. Run lint/tests/build
6. Commit and push
7. Open PR with structured summary + test evidence
8. Transition labels to `vampyre:pr-open`
9. Clean worktree if safe

Isolation tiers:
- v0.x: host worktree isolation
- v1.x: container-per-worker with restricted mounts/env

## CLI Surface

### Commands
- `vampyre goal set --repo <owner/repo> --goal "..."`
- `vampyre run` (foreground)
- `vampyre daemon start|stop|status`
- `vampyre issue run <id>`
- `vampyre issue stop <id>`
- `vampyre status`
- `vampyre doctor`

### Runtime Modes
- **Watcher mode:** listens/reacts to events and schedules work.
- **Builder mode:** executes approved tasks into PRs.

## Suggested Tech Stack (TypeScript-first)

- Runtime: Node.js 22+
- Language: TypeScript strict mode
- CLI: `commander` or `yargs`
- Scheduler/events: `bullmq` (optional) + lightweight internal queues
- DB: SQLite (`better-sqlite3`)
- GitHub API: `@octokit/rest` + webhooks/polling fallback
- Telegram: `telegraf`
- Logging: `pino`
- Validation: `zod`
- Process supervision: systemd user services

## Delivery Roadmap

## Phase 0 — Foundations (Week 1)
**Outcome:** project skeleton and reliable runtime basics.

- Bootstrap TS monorepo/app structure.
- Implement configuration loading (`projects.json`, `agents.json`, `policies.json`).
- Implement structured logging, health endpoint, and run journal.
- Implement SQLite schema + migrations.
- Implement CLI skeleton with `goal set`, `run`, `status`.

**Exit criteria:** daemon starts, reads config, persists state, and cleanly restarts.

## Phase 1 — GitHub Task Orchestration (Weeks 2–3)
**Outcome:** issue-driven queue with human approval gates.

- Add GitHub integration for issue CRUD/labels/comments.
- Implement label state machine transitions.
- Parse GitHub commands (`/vampyre revise|implement|stop`).
- Build planner pipeline to create decomposed issues from a goal.
- Add task sizing policy (reject `L/XL` for direct implementation).

**Exit criteria:** Vampyre can generate issues and wait for approval.

## Phase 2 — Builder Pipeline (Weeks 3–5)
**Outcome:** approved issues become PRs automatically.

- Implement worktree manager.
- Implement implementer worker runner.
- Add test/lint/build gate execution.
- Implement PR creation with summary/test outputs.
- Add reviewer agent pass before PR finalize (optional toggle).

**Exit criteria:** one approved issue can flow end-to-end into PR.

## Phase 3 — Watcher Mode + Interrupts (Weeks 5–6)
**Outcome:** responsive automation with human control.

- Add webhook/event polling loop.
- Add Telegram bot commands (`/approve`, `/reject`, `/status`, `/pause`, `/resume`).
- Add blocked-state loop for missing secrets or external constraints.
- Add immediate reactivity for PR comment commands and CI failures.

**Exit criteria:** humans can control runtime live from GitHub + Telegram.

## Phase 4 — Reliability & Recovery (Weeks 6–7)
**Outcome:** safe, resumable long-running operations.

- Add idempotency keys for all side-effect operations.
- Add sweeper for stale workers/branches.
- Add automatic restart safety and partial-run resume.
- Add concurrency caps and backoff/retry policies.

**Exit criteria:** safe restart after crash/reboot with no duplicate PR spam.

## Phase 5 — Policy Intelligence (Weeks 7–8)
**Outcome:** safer autonomous behavior in builder mode.

- Implement approval policy engine:
  - auto-approve only `risk:low`, allowed types, and max size threshold.
- Add escalation triggers for sensitive actions.
- Add explicit policy audit log per decision.

**Exit criteria:** deterministic policy decisions with traceability.

## Phase 6 — v1 Hardening (Weeks 9–10)
**Outcome:** production-ready single-repo Vampyre.

- Add containerized worker isolation.
- Add metrics (success rate, cycle time, blocked time, PR throughput).
- Add dashboard or markdown status report generator.
- Add backup/restore strategy for SQLite and run logs.

**Exit criteria:** stable 24/7 operation on one repo.

## v1.1+ Expansion

- Multi-repo support.
- Reusable templates for project archetypes.
- CI auto-fix loop improvements.
- Optional web UI.
- Agent performance tuning by task category.

## Definition of Done Framework

Each top-level goal must include:
- Clear success criteria
- Required capabilities
- Non-goals
- Validation commands
- Evidence links (PRs/issues/docs)

Vampyre should mark a goal done only when:
1. All required child issues are closed.
2. No blocking labels remain.
3. Required tests pass.
4. Final summary is published.

## Risk Register (Initial)

1. **Runaway automation**
   - Mitigation: strict policy gates + concurrency caps + pause command.
2. **Task bloat / poor decomposition**
   - Mitigation: planner contract requiring acceptance criteria + size labels.
3. **Secret handling mistakes**
   - Mitigation: external secret stores only, no secret persistence in repo/state logs.
4. **Git conflicts and stale branches**
   - Mitigation: frequent rebase policy + automated stale branch sweeper.
5. **Hallucinated implementation steps**
   - Mitigation: reviewer pass + test gate + explicit issue acceptance checks.

## MVP Cut (v0.1)

Deliver only:
- Single repo support
- Single active worker
- Goal-to-issues planning
- Label approval gate
- Issue-to-PR builder path
- Telegram status notifications

This creates the smallest useful autonomous PR factory while preserving human governance.
