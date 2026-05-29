# Vampyre MVP Proof Roadmap

## Vision

Vampyre is an always-on system for creating and sustaining software projects. One central daemon manages a portfolio of projects, keeps existing projects moving, and turns selected new ideas into real running projects with minimal owner interaction and explicit guardrails.

The first version must prove the core identity: Vampyre runs continuously on `wlkrlab`, manages more than one project profile, respects token budget, creates reviewable output through GitHub, sends useful Telegram notifications, and leaves durable project truth in repositories.

## Decision Records

- [ADR 0001: Run one central daemon on wlkrlab](../adr/0001-run-one-central-daemon-on-wlkrlab.md)
- [ADR 0002: Use systemd user service for MVP supervision](../adr/0002-use-systemd-user-service-for-mvp-supervision.md)
- [ADR 0003: Use GitHub for approval records and Telegram for notifications](../adr/0003-github-is-approval-record-telegram-is-notification-channel.md)
- [ADR 0004: Keep the runtime workspace on wlkrlab](../adr/0004-keep-runtime-workspace-on-wlkrlab.md)
- [ADR 0005: Builder Mode automatically creates approved repos](../adr/0005-builder-mode-automatically-creates-approved-repos.md)
- [ADR 0006: Use Telegram for phone-first check-ins and low-risk commands](../adr/0006-use-telegram-for-phone-first-check-ins-and-low-risk-commands.md)

## MVP Proof

The MVP is successful when one Central Daemon running on `wlkrlab` manages:

- **Watcher project:** `scwlkr/paletteWOW`
- **Builder project:** a real macOS screenshot tool with quick markup features similar in spirit to ShareX

The daemon must:

- stay alive as a supervised long-running process
- load both Project Profiles from a central Project Registry
- run one Active Build Agent at a time
- keep cheap monitoring and reporting loops active
- use SQLite for Operational State and Run Journals
- use disposable git worktrees for project changes
- use GitHub for issues, PRs, comments, labels, and formal approvals
- use Telegram for notifications, blocker alerts, status pings, and links
- monitor Token Budget and degrade gracefully
- continue other eligible projects when one project is blocked

## Product Principles

1. The daemon is the product. CLI commands exist for operation, inspection, diagnosis, pausing, and one-off triggers.
2. One central daemon manages the Project Portfolio. Do not require one daemon or Telegram bot per project.
3. The production runtime is `wlkrlab`, not the current MacBook. The MacBook is an Operator Workstation that can administer the host with `ssh wlkrlab`.
4. GitHub is the formal approval and review surface for daemon-managed project work and significant approval records. Telegram is a notification and link delivery channel.
5. For daemon-managed project work, Vampyre opens PRs and does not merge its own PRs; the Owner remains the merge authority. Direct Owner-supervised implementation work in the Vampyre repo may commit and push to `main` after validation unless the Owner asks for a PR.
6. Never invent secrets, bypass missing access, or silently skip required validation.
7. Always preserve resumable Operational State and clear Run Journals.
8. Always report what was and was not validated.
9. Always pace work by Token Budget. Do not launch many high-cost agents at once.
10. Prefer visible Compounding Product Quality over random churn.

## Modes

### Safe/Watcher Mode

Safe/Watcher Mode sustains existing projects for the long term. It handles issues, PR review, PR creation, feature additions, UX polish, docs, accessibility, validation improvements, and daily forward motion.

Healthy projects should still move forward. If there are no bugs, open PRs, or broken builds, Vampyre should find low-risk improvements that compound product quality rather than doing meaningless cleanup.

Auto-safe Work can be implemented without prior Owner approval, but it must end in a branch or PR for Owner review and merge. Major Feature Candidates must be confirmed before Vampyre spends significant build effort.

The first Safe/Watcher target is `scwlkr/paletteWOW`.

### Builder Mode

Builder Mode turns a raw or early project idea into a real running project. It is allowed to take larger product-building swings than Safe/Watcher Mode and should not be constrained to one tiny issue per PR during the first baseline.

For a Raw Idea, Builder Mode starts with bounded external research, then exactly two meaningfully different Vision Options. Each Vision Option includes lightweight brand direction: working product name, target user, tone, positioning, core differentiator, MVP scope, and likely repo-name recommendation. More than two options is a focus failure unless the Owner explicitly asks for it.

After the Owner selects a Vision Option, Vampyre records the approval in GitHub, passes the Repo Creation Gate, creates a Repo Plan, creates the real project repository after that plan is approved, writes the Project Contract, and starts the Project Build.

Builder Mode may commit directly to `main` for initial repo creation and the Initial Baseline. After the Initial Baseline exists, refinements, risky changes, major additions, and mature sustainment use branches and PRs.

The first Builder target is the macOS screenshot tool.

Pre-repo Builder artifacts live in Vampyre's Builder Intake Area until Automatic Repo Creation:

```txt
docs/builder-intake/screenshot-tool/
  evidence-brief.md
  vision-pair.md
  vision-pair.html
  repo-plan.md
```

After repo creation, only the selected direction becomes the new project's Project Contract. Unselected Vision Options remain archived in the Builder Intake Area.

Do not prefill these files during roadmap planning. They should be created by the actual Builder Mode workflow when it runs fresh external research.

## Architecture

### Runtime Host

- Production host: `wlkrlab`
- Admin path from this MacBook: `ssh wlkrlab`
- Supervision: `systemd --user` service on `wlkrlab`
- Runtime Workspace: Project Registry, SQLite state, logs, cloned repos, disposable worktrees, Run Journals, and build artifacts live on `wlkrlab`
- Workspace Root: one configurable home-owned directory on `wlkrlab`, such as `~/vampyre` or `~/wlkr/vampyre`
- Runtime User: the MVP may run as the normal homelab user reached by `ssh wlkrlab`; keep paths/config portable enough to move to a dedicated service user later
- Host Doctor Check: `vampyre doctor --host wlkrlab` should fail early with exact setup blockers before the daemon tries to run
- Host Setup Command: `vampyre host setup --host wlkrlab` may install or repair approved prerequisites such as Node and `pnpm`
- Host Setup Sudo Boundary: setup may use `sudo` for approved runtime prerequisites, but not unrelated homelab services, firewall/DNS changes, global project dependencies, or secret changes
- Live host check: `wlkrlab` has `systemd`, working `systemctl --user`, and linger enabled for the `wlkrlab` user
- Secrets: resolved from a strict-permission host-local env file for MVP; presence may be tracked, values must not be persisted
- Secret stub: if `~/vampyre/config/vampyre.env` is missing, doctor may create it with empty keys and `0600` permissions
- Future secret provider option: 1Password, after the env-file MVP path works

MVP required secret/auth checks:

- `GITHUB_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- Codex/auth availability on `wlkrlab`

GitHub auth note: the daemon should prefer explicit `GITHUB_TOKEN` from `~/vampyre/config/vampyre.env`; `gh` auth can be used for doctor diagnostics and setup assistance.

MVP GitHub token boundary:

- Use a fine-grained token where possible.
- Scope the token as narrowly as possible while still allowing automatic creation of the selected Builder Mode repository after the Repo Creation Gate.
- Required repository permissions: contents read/write, issues read/write, pull requests read/write, metadata read.
- Checks/actions should be read-only unless a later implementation proves write access is needed.
- Repository creation permission is required for the Builder Mode MVP, but must only be used after a Formal Approval Record passes the Repo Creation Gate.
- Automatic repo creation also requires an approved Repo Plan with one recommended repo name, visibility, description, topics, license, enabled GitHub features, default branch, and initial files/docs.
- Builder-created repos default to private until the Initial Baseline is real and a Launch Visibility Gate approves public visibility.

Telegram note: missing Telegram configuration should not stop all GitHub-centered daemon work, but it is an MVP completion blocker because notification delivery is part of the proof.

MVP optional secret checks:

- `OPENROUTER_API_KEY`
- project-specific secrets only when a Project Profile requires them

Recommended workspace shape:

```txt
~/vampyre/
  config/
    vampyre.env
  data/vampyre.sqlite
  logs/
  repos/
  worktrees/
  reports/
  artifacts/
```

### Core Components

MVP implementation stack: TypeScript on Node.js with `pnpm`.

- `daemon`: process lifecycle, startup, health, graceful shutdown, supervision hooks
- `scheduler`: portfolio scheduling, cadence enforcement, preemption, budget-aware work selection
- `registry`: central Project Registry and Project Profile loading
- `state`: SQLite Operational State, migrations, Run Journals, idempotency keys
- `github`: GitHub API wrapper for repos, issues, labels, comments, PRs, checks
- `telegram`: notifications, blocker alerts, status pings, and links to GitHub or HTML reports
- `policy`: Work Classification, approval requirements, auto-safe boundaries, escalation rules
- `budget`: Token Budget tracking, Budget Mode calculation, provider adapters
- `worktree`: disposable git worktree and branch lifecycle management
- `agent`: Active Build Agent launcher and result parser
- `reports`: Markdown and optional HTML Visual Project Reports
- `doctor`: environment, auth, config, repo, validation, and host checks

### Persistent State

SQLite stores Operational State:

- projects and Project Registry snapshot
- scheduler cursors
- runs and Run Journals
- workers and active build locks
- Project Blockers
- Token Budget and Budget Mode
- event cursors
- idempotency keys
- notification history
- last-seen GitHub state

GitHub and repo-local docs store Project Truth:

- approvals
- issues and PRs
- roadmaps
- status docs
- project contracts
- ADRs
- review history

If SQLite is lost, Vampyre should recover most Project Truth from GitHub and repo-local docs, while accepting loss of some local run history.

### Project Registry

The central Project Registry defines daemon-owned facts for each project:

- project id and display name
- GitHub repo
- local path or workspace policy
- mode: Safe/Watcher or Builder
- cadence
- autonomy policy
- notification settings
- validation commands or inference policy
- budget posture
- paused/active state
- status doc paths

Repo-local docs define project-owned truth:

- `CONTEXT.md`
- `docs/ROADMAP.md`
- `docs/STATUS.md`
- ADRs when warranted
- optional HTML Visual Project Reports

`docs/STATUS.md` must be updated after every meaningful implementation session with current phase, completed work, latest proof, blockers, and exact next action.

### Budget-aware Scheduling

The scheduler must keep Vampyre consistently productive without exhausting AI capacity.

Budget Modes:

- **Normal:** regular Watcher cadence and Builder loops
- **Conservative:** prioritize blockers, CI failures, approved PR fixes, status, and cheap planning
- **Critical:** pause new builds except urgent safety work
- **Exhausted:** stop agent launches, keep daemon alive, monitor state, and notify the Owner

MVP concurrency:

- one Active Build Agent at a time
- cheap monitoring, polling, blocker scans, status updates, and reports may continue

Initial budget providers:

- Codex first
- OpenRouter likely next

### Work Isolation

MVP isolation uses disposable git worktrees:

1. fetch target repo
2. create a disposable worktree
3. create a run branch when branch workflow applies
4. run the Active Build Agent only inside that worktree
5. run validation
6. commit and push
7. open or update PR when appropriate
8. preserve or clean the worktree based on Failure Classification

Container Isolation is a later hardening target, not an MVP prerequisite.

## Delivery Roadmap

### Phase 0 - Runtime Host And Repository Foundation

**Outcome:** Vampyre has a daemon-first TypeScript foundation that is designed to run on `wlkrlab`.

#### Phase 0A - Host readiness skeleton

**Outcome:** the first code milestone proves the `wlkrlab` host path before scheduler or agent logic exists.

- Create the TypeScript/Node/`pnpm` project skeleton.
- Add the CLI entrypoint.
- Implement `vampyre doctor --host wlkrlab`.
- Check SSH reachability, `systemd --user`, Node, `pnpm`, Git, Workspace Root, env stub, SQLite availability, and basic service readiness.
- Do not add daemon scheduling yet.
- Do not perform GitHub writes yet.

**Exit criteria:**

- `pnpm test` passes.
- `pnpm build` passes.
- `vampyre doctor --host wlkrlab` prints readiness and exact blockers without printing secrets.

- Bootstrap the TypeScript project structure.
- Add strict TypeScript, linting, formatting, `pnpm` lockfile, and test command.
- Define the `wlkrlab` runtime assumptions in docs and config examples.
- Add CLI shell with `daemon install|start|stop|restart|status|logs`, `status`, `doctor`, `project list`, and debug-only `run once`.
- Add `vampyre doctor --host wlkrlab` checks for SSH reachability, Node, `pnpm`, Git, GitHub auth, Codex access, Workspace Root writability, system service support, SQLite, and Telegram config.
- Add `vampyre host setup --host wlkrlab` for approved prerequisite installation or repair.
- Add host setup guidance or automation for making Node and `pnpm` available in non-interactive SSH/systemd environments.
- Prefer daemon-friendly Node tooling via system packages or `mise`; avoid `nvm` for the service runtime unless explicitly wrapped and verified.
- Add strict-permission env-file loading for `~/vampyre/config/vampyre.env`, without logging secret values.
- Add safe env stub creation when `~/vampyre/config/vampyre.env` is missing, reporting missing keys without displaying values.
- Treat GitHub access, Telegram bot token/chat id, and Codex/auth availability as MVP required checks; treat OpenRouter and project-specific secrets as optional unless configured.
- Add structured logging and a basic health heartbeat.
- Add `systemd --user` service/supervision files or install notes for `wlkrlab`.

**Exit criteria:**

- The daemon can start in foreground and supervised mode.
- `vampyre daemon install|start|stop|restart|status|logs` wraps normal `systemd --user` service operations.
- `vampyre doctor --host wlkrlab` reports host, GitHub, Telegram, SQLite, workspace, service, and token-provider readiness with exact blockers.
- Documentation clearly states that `wlkrlab` is the intended runtime host.

### Phase 1 - Operational State And Project Registry

**Outcome:** the daemon loads two Project Profiles and persists Operational State.

- Add SQLite migrations.
- Implement Project Registry loading.
- Add Project Profile schema validation.
- Create MVP profiles for:
  - `paletteWOW` in Safe/Watcher Mode
  - macOS screenshot tool Raw Idea in Builder Mode
- Add Run Journal storage.
- Add Project Blocker storage.
- Add idempotency keys for side-effect operations.

**Exit criteria:**

- The daemon starts, loads both Project Profiles, persists state, restarts cleanly, and reports both projects in `vampyre status`.

### Phase 2 - Budget-aware Portfolio Scheduler

**Outcome:** the daemon can choose work across the portfolio without spending tokens blindly.

- Implement scheduler ticks and per-project cadence.
- Add one Active Build Agent lock.
- Add Budget Mode calculation.
- Add provider adapter boundary for Codex token/budget checks.
- Add conservative, critical, and exhausted degradation behavior.
- Add project-level pause/block/preemption rules.

**Exit criteria:**

- The scheduler can select eligible work, defer work under low budget, and avoid launching more than one Active Build Agent.

### Phase 3 - GitHub And Telegram Control Surfaces

**Outcome:** GitHub holds formal project review/approval records and Telegram sends useful notifications.

- Add GitHub auth checks and repo access checks.
- Add issue/PR/comment/label primitives.
- Add formal approval lookup for Builder decisions and Major Feature Candidates.
- Add PR creation/update support.
- Add Telegram notification support for status, blockers, PR links, issue links, and optional HTML report links.
- Ensure Telegram commands are not treated as the durable approval ledger.

**Exit criteria:**

- Vampyre can create or update a GitHub issue/PR/comment and send a Telegram notification linking to it.

### Phase 4 - Watcher Discovery Pass For `paletteWOW`

**Outcome:** Safe/Watcher Mode can learn an existing project before editing it.

- Inspect `scwlkr/paletteWOW` README, package/config files, app structure, and current product purpose.
- Check open GitHub issues and PRs.
- Infer validation commands using the Validation Ladder.
- Create or update repo-local status/context docs if missing.
- Identify one Auto-safe Work candidate focused on Compounding Product Quality.
- Use worktree isolation for any project changes.

**Exit criteria:**

- Vampyre produces a Watcher Discovery Pass result for `paletteWOW`.
- The result includes purpose, validation commands or blocker, current status, first safe improvement, and proof of what was inspected.

### Phase 5 - Builder Vision Pair For Screenshot Tool

**Outcome:** Builder Mode can turn a Raw Idea into two credible product directions.

- Capture the Raw Idea: a real macOS screenshot tool with quick markup features similar in spirit to ShareX.
- Create the Builder Intake Area at `docs/builder-intake/screenshot-tool/`.
- Run bounded external research on ShareX feature expectations, macOS screenshot constraints, existing macOS screenshot tools, useful open-source libraries or Skill.md workflows, and App Store/notarization constraints where relevant.
- Produce a short Evidence Brief with 5-8 key findings, source links, implications for the Vision Options, build constraints, reusable assets, and explicit research limits.
- Generate exactly two meaningfully different Vision Options, each with lightweight brand direction.
- Produce a Markdown summary and, when useful, an HTML comparison report.
- Create a GitHub approval issue for selecting the direction.
- After direction approval, generate a Repo Plan for the selected project.
- Wait for Repo Plan approval before automatic repo creation.

**Exit criteria:**

- The Owner can compare exactly two directions and approve one in GitHub.

### Phase 6 - Worktree Build Agent And Validation

**Outcome:** Vampyre can safely make project changes and preserve useful failure context.

- Implement disposable worktree lifecycle.
- Implement branch naming and cleanup/preservation rules.
- Implement Active Build Agent launch boundary.
- Implement validation command execution.
- Implement Failure Classification:
  - validation failure
  - missing secret or access
  - merge conflict
  - agent error or context exhaustion
  - unsafe or risky discovery
- Implement Draft PR rules for useful failed-validation progress.

**Exit criteria:**

- A run produces a Run Journal, validation evidence, and either a clean PR/update, a Draft PR, or a clear Project Blocker.

### Phase 7 - Builder Repo Creation And Initial Baseline

**Outcome:** after direction approval, Builder Mode creates the real screenshot-tool project and starts making it real.

- Pass the Repo Creation Gate after GitHub approval and approved Repo Plan.
- Automatically create the real repository.
- Write the Project Contract:
  - `CONTEXT.md`
  - `docs/ROADMAP.md`
  - `docs/STATUS.md`
  - README when direction is stable enough
- Commit initial repo creation directly to `main`.
- Build toward the first Initial Baseline.
- Stop at the next useful Proof Point with a precise next target.

**Exit criteria:**

- The screenshot-tool repo exists with project docs and an Initial Baseline path started or completed.
- The run leaves a status doc and Run Journal that make the next build step obvious.

### Phase 8 - End-to-End MVP Proof Run

**Outcome:** Vampyre proves the two-mode central daemon loop.

- Run the supervised daemon on `wlkrlab`.
- Load both Project Profiles.
- Execute a `paletteWOW` Watcher Discovery Pass and first safe output.
- Execute the screenshot-tool Vision Pair and approval flow.
- Start the selected Builder Project after approval.
- Demonstrate one Active Build Agent limit.
- Demonstrate Telegram notifications.
- Demonstrate GitHub approval/review records.
- Demonstrate SQLite restart/resume behavior.
- Demonstrate Project Blocker behavior without stopping the whole portfolio.
- Record the final proof checklist in [docs/MVP-PROOF-CHECKLIST.md](../MVP-PROOF-CHECKLIST.md).

**Exit criteria:**

- There is evidence for daemon uptime, project scheduling, budget behavior, GitHub output, Telegram notification, run journals, worktree isolation, and both project modes.

**Completion note:** Phase 8 is closed as the daemon MVP proof. `docs/MVP-PROOF-CHECKLIST.md` maps the Phase 8 proof and MVP Definition of Done to live `wlkrlab` evidence. Pinmark hands-on native UI and Screen Recording validation remains post-MVP product follow-through because the Builder MVP criterion is creation or start of the real repo after the Repo Creation Gate, not completed native runtime validation.

## Post-MVP Follow-Through

- Build an Owner Check-in Surface that summarizes daemon health, scheduler decisions, token budget posture, project blockers, latest Run Journals, latest PR/report links, and action needed.
- Use one Check-in Summary model for CLI check-ins, Telegram `/status`, and Daily Briefs so all check-in surfaces share facts while using different detail levels.
- Implement the Check-in Summary and detailed CLI renderer first for testability, then wire Telegram `/status` and Daily Brief renderers to the same model.
- Ship the Check-in MVP before returning to product-loop follow-through: shared Check-in Summary, detailed CLI renderer, Authorized Telegram Chat-gated `/status`, and visible Work Pause state.
- Keep Telegram `/status` compact by default for phone use: overall state, Work Pause state, Budget Mode, selected/deferred/blocked Projects with reasons, Owner-needed action, and useful links; keep full project/run/report detail in the CLI renderer.
- Persist Work Pause state in SQLite on `wlkrlab` with `paused_until`, `source`, `created_at`, and optional `reason`; the scheduler reads it before selecting new project-changing work and the Check-in Summary renders it.
- Work Pause blocks new project-changing launches only; already-running Active Build Agents finish, write Run Journals/reports, and surface outcomes normally. Emergency cancellation is a separate later control.
- Add CLI pause controls such as `vampyre pause 1m|1h|1d`, `vampyre resume`, and pause status, all writing the same SQLite Work Pause state that Telegram commands use.
- Reply to Authorized Telegram Chat `/status`, pause, and `/resume` commands with short confirmations; pause confirmations include pause/resume state, expiry when paused, and whether any Active Build Agent is already running and will finish.
- Use Telegram polling for MVP command ingestion, with processed update offset or idempotency state persisted in SQLite; defer public webhook setup unless a later deployment need appears.
- Defer scheduled Daily Brief delivery and Unauthorized Telegram Alert Threshold enforcement until after basic check-in works unless they are cheap while wiring Telegram.
- Make Telegram the phone-first Mobile Check-in Channel for alerts, Daily Briefs, `/status`, `/pause1min`, `/pause1hour`, `/pause1day`, and `/resume`; pause commands create a timed global Work Pause for new project-changing runs, not a daemon stop, per-project pause, or indefinite hold.
- Accept Telegram Operational Commands only from the Authorized Telegram Chat configured by `TELEGRAM_CHAT_ID`; unknown chats must receive no useful operational details.
- Log and count Unauthorized Telegram Command Attempts quietly by default; trigger one Immediate Alert at three attempts within ten minutes, then suppress repeated alerts for one hour unless the source or rate changes materially.
- Daily Briefs should summarize running state, Budget Mode, completed work, selected/deferred/blocked Projects with reasons, Owner-needed reviews, next likely action, and useful links without dumping raw logs unless there is a failure.
- Immediate Alerts should interrupt only for action-needed or risk events: daemon down or repeated failure, critical or exhausted Token Budget, Owner-needed blockers, approvals needed before progress can continue, PRs ready for review or merge, validation failures after useful work, and Work Pause start, expiry, or early resume.
- `paletteWOW` PR `#18` is merged; fast-forward the runtime clone and review cleanup for any successful runtime worktree or branch left behind by that run.
- Run hands-on Pinmark native UI and Screen Recording validation on the Mac operator workstation.
- Record the Pinmark validation outcome in `scwlkr/pinmark` project docs and keep the runtime clone on `wlkrlab` clean and current.
- Continue Pinmark Builder iterations toward a usable capture, markup, redaction, and export baseline.

## Later Hardening

- Container Isolation for Active Build Agents.
- Multi-provider budget tracking beyond Codex.
- More mature metrics: success rate, cycle time, blocked time, PR throughput.
- HTML portfolio dashboards and richer Visual Project Reports.
- Backup and restore strategy for SQLite and run logs.
- More precise policy packs per project type.
- Multi-repo scaling beyond the MVP pair.
- CI auto-fix loops and reviewer-agent passes.

## Initial Risk Register

1. **Runaway token usage**
   - Mitigation: one Active Build Agent, Budget-aware Scheduling, Budget Modes, and provider checks.
2. **Daemon hidden failure**
   - Mitigation: supervision, health heartbeat, logs, `doctor`, Telegram failure notifications, restart-safe state.
3. **One project blocking the portfolio**
   - Mitigation: Project Blockers are project-local and scheduler continues other eligible work.
4. **Secret handling mistakes**
   - Mitigation: never persist secret values; track only presence metadata and missing-secret blockers.
5. **Low-value daily churn**
   - Mitigation: Compounding Product Quality priority and payoff-backed refactor rule.
6. **Builder Mode over-planning or over-splitting**
   - Mitigation: Vision Pair first, Project Contract after approval, larger Project Builds before mature PR cadence.
7. **Damaging local workspaces**
   - Mitigation: disposable Worktree Isolation for build agents.
8. **Approval confusion**
   - Mitigation: GitHub is the Formal Approval Record; Telegram only sends updates and links.

## Definition Of Done For MVP

The MVP is done when:

1. Vampyre runs as a supervised daemon on `wlkrlab`.
2. The Central Daemon manages both MVP Project Profiles.
3. The Runtime Workspace on `wlkrlab` contains the Project Registry, SQLite state, logs, cloned repos, worktrees, Run Journals, and build artifacts.
4. GitHub integration can create or update the approval/review artifacts needed by both modes.
5. Telegram sends status, blocker, and review-link notifications.
6. Budget-aware Scheduling prevents more than one Active Build Agent and degrades under low budget.
7. `paletteWOW` completes a Watcher Discovery Pass and produces the first safe forward-motion output.
8. The screenshot-tool Builder flow produces a Vision Pair, records the selected direction approval, and creates or starts the real repo after the Repo Creation Gate.
9. Worktree Isolation is used for project-changing agent runs.
10. The docs and status artifacts make the next action obvious without relying on chat history.
