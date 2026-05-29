# Vampyre Context

Vampyre is an always-on system for creating and sustaining software projects. It has one mode for long-running existing projects and one mode for turning early ideas into running projects with minimal owner interaction.

## Language

**Vampyre**:
An always-on system that creates, improves, and sustains software projects with minimal owner interaction and explicit guardrails.
_Avoid_: PR forge, generic coding bot

**Project**:
A software product, repository, or initiative that Vampyre is responsible for creating or sustaining.
_Avoid_: Task, job

**Project Portfolio**:
The set of projects managed by one central Vampyre daemon.
_Avoid_: One daemon per project

**Project Profile**:
The per-project configuration that tells the Central Daemon how to manage one Project.
_Avoid_: Global-only policy, unmanaged repo

**Project Registry**:
The central daemon-owned configuration that lists managed projects and their operational profiles.
_Avoid_: Repo scan as source of truth

**Safe/Watcher Mode**:
The operating mode for existing projects, focused on continuous maintenance, improvement, issue handling, PR review, and feature creation.
_Avoid_: Passive monitor

**Daily Forward Motion**:
A visible daily project outcome that sustains or advances a project through fixes, reviews, improvements, feature work, backlog refinement, or status reporting.
_Avoid_: Activity for activity's sake, passive status only

**Compounding Product Quality**:
The accumulated user-facing and operational improvement that makes a Project more useful, reliable, understandable, or easier to sustain over time.
_Avoid_: Random churn, cleanup for its own sake

**Payoff-backed Refactor**:
An internal code change justified by a concrete product, reliability, testability, dependency, performance, accessibility, or future-work payoff.
_Avoid_: Taste-based cleanup, broad clean-code pass

**Auto-safe Work**:
Low-risk project work that Vampyre can implement without prior Owner approval, ending in a pull request for Owner review and merge.
_Avoid_: Fully autonomous merge, direct-to-main change

**Major Feature Candidate**:
A larger project idea that may be valuable but should be confirmed by the Owner before Vampyre spends significant build effort.
_Avoid_: Auto-built major feature

**Work Classification**:
The risk, scope, and reversibility judgment that decides whether work is Auto-safe Work or a Major Feature Candidate.
_Avoid_: Excitement-based priority, catchy size labels

**Builder Mode**:
The operating mode for new or very early projects, focused on turning an idea, MVP, or roadmap into a real running project as hands-off as possible.
_Avoid_: One-shot scaffolder

**Project Build**:
A larger cohesive Builder Mode effort that turns an approved direction into a real running project through fast implementation, iteration, and launch preparation.
_Avoid_: Prototype, throwaway scaffold, one issue, one small PR

**Raw Idea**:
A broad or vague project request that needs product-direction exploration before Vampyre commits to a build plan.
_Avoid_: Final spec, implementation contract

**Vision Option**:
One credible product direction for a Raw Idea, including purpose, audience, differentiator, roadmap shape, and build implications.
_Avoid_: Minor variant, colorway

**Lightweight Brand Direction**:
The minimal naming, tone, positioning, and product identity needed for a Builder Mode project to have a coherent repo and first product direction.
_Avoid_: Full brand system before build, purely technical repo plan

**Bounded External Research**:
Focused research Vampyre performs before creating Vision Options when a Raw Idea depends on current tools, market expectations, technical constraints, or reusable open-source assets.
_Avoid_: Endless market report, stale assumed knowledge

**Evidence Brief**:
A short source-linked research artifact that captures key findings, build implications, constraints, reusable assets, and deliberate research limits for a Vision Pair.
_Avoid_: Long market-analysis report, unsourced assumptions

**Builder Intake Area**:
The Vampyre repo-local area where pre-repo Builder Mode research, Evidence Briefs, Vision Pairs, HTML comparisons, and Repo Plans live before Automatic Repo Creation.
_Avoid_: Creating repos for unselected visions, losing unselected rationale

**Vision Pair**:
Exactly two meaningfully different Vision Options for a Raw Idea.
_Avoid_: Brainstorm list, three or more options

**Build Loop**:
An iterative multi-session process where Vampyre turns an approved direction into a running project through repeated planning, implementation, verification, and review.
_Avoid_: One-shot generation

**Refinement Loop**:
The ongoing improvement process that hardens, polishes, and corrects a real project after the initial Builder Mode implementation has created working product shape.
_Avoid_: Perfect-first implementation

**Proof Point**:
The next useful stopping condition for a Builder Mode session, such as a running app, a vertical slice, a deployed preview, a project contract, or a precise handoff for the next session.
_Avoid_: Fixed stage gate, arbitrary token stop

**Visual Project Report**:
A browser-viewable HTML artifact Vampyre can use when visual structure would clarify project vision, status, suggestions, implemented work, roadmap, or feature opportunities.
_Avoid_: Mandatory template, text-only status as the only option

**Canonical Project Doc**:
A durable Markdown document that records project truth, contracts, decisions, status, or implementation handoff.
_Avoid_: Visual-only source of truth

**Status Handoff**:
The repo-local status document that records current phase, completed work, latest proof, blockers, and exact next action after meaningful sessions.
_Avoid_: Stale status, chat-only handoff

**Control Surface**:
A channel the Owner uses to inspect, direct, or operate Vampyre.
_Avoid_: Undifferentiated UI

**Owner Check-in Surface**:
The read-only status view that tells the Owner whether Vampyre is running, what it last did, what it plans or declines to do next, why, and what needs human attention.
_Avoid_: Raw logs as the primary status view, hidden scheduler state

**Check-in Summary**:
The shared internal status model that combines daemon health, scheduler decisions, budget posture, blockers, recent work, review links, and action needed for rendering across CLI, Telegram status, and Daily Briefs.
_Avoid_: Separate truth per surface, divergent status summaries

**CLI-first Check-in Implementation**:
The implementation order where Vampyre builds and validates the Check-in Summary plus detailed CLI renderer before wiring Telegram status and Daily Brief renderers.
_Avoid_: Telegram-only implementation, untestable status rendering

**Check-in MVP**:
The first Owner Check-in Surface slice: one Check-in Summary model, a detailed CLI renderer, Authorized Telegram Chat-gated `/status`, and visible Work Pause state in the summary.
_Avoid_: Full notification system before basic status works, raw-log status UI

**Compact Telegram Status**:
The default `/status` rendering for phone scanning: overall daemon state, Work Pause state, Budget Mode, selected/deferred/blocked Projects with reasons, Owner-needed action, and the most useful links.
_Avoid_: Full CLI dump in chat, raw logs by default

**Mobile Check-in Channel**:
The phone-first Telegram surface for alerts, daily briefs, status checks, and small operational commands while the Owner is away from the Operator Workstation.
_Avoid_: Desktop-only check-ins, Telegram approval ledger

**Daily Brief**:
A short scheduled Mobile Check-in Channel summary of runtime health, budget posture, completed work, deferred or blocked projects, Owner-needed reviews, and the next likely action.
_Avoid_: Raw log dump, full report replacement

**Immediate Alert**:
A phone-first interruption for an action-needed or risk event that should not wait for the next Daily Brief.
_Avoid_: Routine progress ping, noisy heartbeat

**Telegram Operational Command**:
A low-risk no-space Telegram slash command that reads status or temporarily changes scheduler behavior without approving significant work.
_Avoid_: Approval command, free-form remote shell

**Authorized Telegram Chat**:
The configured Telegram chat id allowed to receive Mobile Check-in Channel messages and issue Telegram Operational Commands in the MVP.
_Avoid_: Any Telegram user, multi-user permission model by default

**Unauthorized Telegram Command Attempt**:
A Telegram command received from an unknown chat or otherwise unauthorized sender.
_Avoid_: Treating every bad command as Owner-facing noise

**Unauthorized Telegram Alert Threshold**:
The rule that escalates unauthorized Telegram command attempts into an Immediate Alert after three attempts within ten minutes, with repeated alerts suppressed for one hour unless the source or rate materially changes.
_Avoid_: Alert on every bad command, never alert on abuse

**Telegram Command Confirmation**:
The short reply an Authorized Telegram Chat receives after `/status`, `/pause1min`, `/pause1hour`, `/pause1day`, or `/resume`, confirming the resulting state and useful next detail without exposing operational internals.
_Avoid_: Silent accepted command, raw log dump, secrets or hidden runtime detail

**Telegram Command Polling**:
The MVP command-ingestion approach where the Central Daemon polls Telegram updates and stores processed update state in SQLite instead of requiring a public webhook endpoint.
_Avoid_: Public webhook prerequisite for MVP, duplicate command execution

**Notification Channel**:
A lightweight interrupt channel for quick updates, blocker alerts, status pings, and links or attachments for review.
_Avoid_: Primary approval ledger

**Formal Approval Record**:
The durable GitHub-based record that shows the Owner approved significant work, direction, or risk before Vampyre proceeded.
_Avoid_: Telegram-only approval, unrecorded chat approval

**Central Daemon**:
The single long-running Vampyre process that manages the Project Portfolio.
_Avoid_: Per-project Vampyre instance, many Telegram bots

**WLKRLAB Runtime Host**:
The homelab server where Vampyre's Central Daemon is intended to run for real always-on operation.
_Avoid_: Developer laptop as production runtime

**Operator Workstation**:
The MacBook or other personal machine used to administer Vampyre remotely, usually by connecting to the WLKRLAB Runtime Host with `ssh wlkrlab`.
_Avoid_: Runtime host

**Runtime Workspace**:
The host-local area where Vampyre keeps its Project Registry, SQLite state, logs, cloned repos, disposable worktrees, run journals, and build artifacts.
_Avoid_: Split state across workstation and runtime host

**Workspace Root**:
The single explicit directory on the WLKRLAB Runtime Host that contains Vampyre's Runtime Workspace.
_Avoid_: Scattered paths, random existing checkout

**Runtime User**:
The operating system account on the WLKRLAB Runtime Host that owns the Workspace Root and runs the Central Daemon.
_Avoid_: Hardcoded personal user dependency

**Host Doctor Check**:
The setup validation that proves the WLKRLAB Runtime Host is reachable and has the required runtime, auth, workspace, service, database, and notification prerequisites.
_Avoid_: Late runtime surprise, implicit host readiness

**Host Setup Command**:
The explicit setup action that may install or repair approved runtime prerequisites on the WLKRLAB Runtime Host.
_Avoid_: Surprise mutation during diagnostics

**Host Setup Sudo Boundary**:
The limit on privileged host changes Vampyre may make while preparing the WLKRLAB Runtime Host.
_Avoid_: Broad homelab administration, unrelated service changes

**Systemd User Service**:
The MVP supervision mechanism for running Vampyre as a long-lived user-level service on the WLKRLAB Runtime Host.
_Avoid_: SSH-session background process, custom supervisor

**Daemon CLI**:
The Vampyre command surface that installs, starts, stops, restarts, inspects, and streams logs for the Systemd User Service.
_Avoid_: Requiring raw systemctl commands for normal operation

**Secret Source**:
The configured place where the Central Daemon reads required secret values at runtime.
_Avoid_: Secret values in SQLite, logs, repo files, or chat

**Secret Presence Metadata**:
Non-sensitive state that records whether a required secret appears to be configured without storing or displaying the secret value.
_Avoid_: Secret value persistence

**Secret Stub**:
A strict-permission env file with required secret keys and empty values that guides the Owner to configure secrets on the runtime host.
_Avoid_: Secret collection in chat, printing secret values

**MVP Secret Set**:
The minimum secrets and host auth Vampyre needs to complete the first MVP Proof.
_Avoid_: Every possible provider key, project-specific secrets by default

**MVP Completion Blocker**:
A missing capability that does not necessarily stop all daemon work, but prevents the first MVP Proof from being considered complete.
_Avoid_: All-or-nothing runtime failure

**Daemon GitHub Auth**:
The GitHub authentication method used by the long-running Central Daemon.
_Avoid_: Reliance on interactive CLI state

**GitHub Token Boundary**:
The least-privilege permission boundary for the token used by the Central Daemon.
_Avoid_: Account-wide overpowered token by default

**Always-on Runtime**:
The never-sleeping operating posture that lets Vampyre continuously monitor, sustain, build, and advance Projects over time.
_Avoid_: Manual-only CLI loop, occasional script run

**Daemon-first MVP**:
The first useful version of Vampyre, built around a real long-running daemon with CLI commands for administration, inspection, triggering, pausing, and diagnosis.
_Avoid_: CLI-first prototype, background behavior as later wrapper

**MVP Implementation Stack**:
The TypeScript and Node.js runtime stack used to build Vampyre's first daemon, CLI, integrations, scheduling, and state management.
_Avoid_: Multi-language MVP, premature low-level rewrite

**Package Manager**:
The Node package manager used for dependency installation and project scripts in the MVP.
_Avoid_: Mixed npm/pnpm/yarn lockfiles

**Daemon Toolchain**:
The Node, pnpm, git, and related runtime tools installed so they are visible to non-interactive SSH commands and the Systemd User Service.
_Avoid_: Interactive-shell-only tooling

**Token Budget**:
The available AI execution capacity Vampyre must monitor and preserve while scheduling project work.
_Avoid_: Unlimited agent spawning, token-blind scheduling

**Budget-aware Scheduling**:
The portfolio scheduling behavior that keeps Vampyre consistently productive without exhausting available AI tokens or launching too many expensive agents at once.
_Avoid_: Fastest possible execution, all-project burst

**Budget Mode**:
The current operating posture Vampyre uses when Token Budget is normal, conservative, critical, or exhausted.
_Avoid_: Binary on/off token behavior

**Work Pause**:
A temporary portfolio-wide hold that automatically expires and prevents new scheduler-selected Active Build Agent launches and project-changing work while leaving the Central Daemon, status checks, heartbeats, notifications, urgent blocker reporting, and already-running Active Build Agents active.
_Avoid_: Daemon shutdown, indefinite pause by default, per-project pause, hiding status, killing in-flight work, emergency cancellation

**Work Pause State**:
The SQLite-backed runtime record for the current Work Pause on `wlkrlab`, including `paused_until`, `source`, `created_at`, and optional `reason`.
_Avoid_: Telegram as source of truth, in-memory-only pause, secret values in pause records

**CLI Pause Command**:
The operator CLI control for creating, clearing, and inspecting Work Pause State through the same path used by Telegram pause commands.
_Avoid_: Telegram-only pause control, separate pause implementations

**Active Build Agent**:
An expensive AI coding worker that makes project changes, runs validation, and prepares reviewable output.
_Avoid_: Cheap monitor, status poller

**Operational State**:
The local daemon state Vampyre needs to schedule, resume, deduplicate, notify, and recover ongoing work.
_Avoid_: Project truth, approval record

**Project Truth**:
The durable project record stored in GitHub and repo-local docs, including approvals, issues, PRs, roadmaps, status, contracts, decisions, and review history.
_Avoid_: Ephemeral daemon state

**Worktree Isolation**:
The MVP isolation model where each Active Build Agent works in a disposable git worktree and branch for one run.
_Avoid_: Main checkout mutation, shared dirty workspace

**Container Isolation**:
The later hardening model where Active Build Agents run inside restricted containers with controlled mounts and environment access.
_Avoid_: MVP prerequisite

**Run Journal**:
The resumable record of what an Active Build Agent attempted, changed, validated, failed, and should do next.
_Avoid_: Lost context, opaque failure

**Failure Classification**:
The category Vampyre assigns to a failed run so it can choose whether to retry, block, notify, request approval, preserve artifacts, or continue elsewhere.
_Avoid_: Generic failure, endless retry

**Draft PR**:
A pull request opened for useful but unfinished or not-yet-passing work, with clear failure evidence and review context.
_Avoid_: Noisy broken PR, hidden useful progress

**MVP Proof**:
The first end-to-end demonstration that one Central Daemon can manage both a Safe/Watcher Mode project and a Builder Mode project under real scheduling, budget, isolation, notification, and persistence constraints.
_Avoid_: Single-mode demo, daemon-only smoke test

**Post-MVP Product Loop Proof**:
The first post-MVP demonstration that Vampyre can keep producing useful project outcomes after the daemon proof by syncing merged work, validating product behavior, updating project truth, and continuing the Builder loop toward a usable baseline.
_Avoid_: Reopened MVP proof, infrastructure-only hardening sprint

**MVP Watcher Project**:
The real existing project used to prove Safe/Watcher Mode in the first MVP Proof.
_Avoid_: Toy watcher repo

**Watcher Discovery Pass**:
The lightweight first Safe/Watcher step where Vampyre inspects a Project, records its purpose/status/validation assumptions, and then chooses the first Auto-safe Work.
_Avoid_: Blind first change, endless audit

**MVP Builder Project**:
The real new project used to prove Builder Mode in the first MVP Proof.
_Avoid_: Disposable test case, fake builder repo

**Project Blocker**:
A missing requirement or external constraint that prevents Vampyre from safely continuing work on one Project.
_Avoid_: Whole-daemon failure, silent skip

**Validation Ladder**:
The ordered fallback process Vampyre uses to prove work when a Project lacks explicit validation commands.
_Avoid_: Unproven safety claim, validation guess treated as certainty

**Project Contract**:
The canonical repo-local documentation that records the selected project direction, roadmap, current status, and owner boundaries before implementation work begins.
_Avoid_: Chat-only plan, inferred memory

**Repo Creation Gate**:
The Builder Mode approval point after a Vision Option is selected and before Vampyre creates the real project repository.
_Avoid_: Repo per unchosen option, premature repository creation

**Automatic Repo Creation**:
The Builder Mode capability where Vampyre creates the selected new project's GitHub repository after the Repo Creation Gate.
_Avoid_: Manual MVP repo creation, repo creation before direction approval

**Repo Plan**:
The proposed GitHub repository settings and initial contents Vampyre presents before Automatic Repo Creation.
_Avoid_: Implicit repository settings, surprise public repo

**Repo Name Recommendation**:
The single repository name Vampyre proposes in a Repo Plan based on the selected Vision Option and brand direction.
_Avoid_: Generic placeholder name, separate naming ceremony

**Launch Visibility Gate**:
The approval point where a Builder-created project may move from private development to public visibility.
_Avoid_: Public by default, accidental launch

**Initial Baseline**:
The first running version of a Builder Mode project, including the project scaffold, Project Contract, and enough implementation to prove the core product shape.
_Avoid_: Final quality bar, mature project workflow

**Project Graduation**:
The transition where a Builder Mode project becomes a Safe/Watcher Mode project for long-term sustainment.
_Avoid_: Permanent builder mode, perfection gate

**Owner**:
The human with final authority over project direction, risk, approvals, and irreversible actions.
_Avoid_: User, customer

## Relationships

- **Vampyre** operates on one or more **Projects**.
- A **Central Daemon** manages the **Project Portfolio** so the **Owner** does not have to run separate Vampyre instances or Telegram bots per project.
- The **Central Daemon** should run on the **WLKRLAB Runtime Host**, not on the **Operator Workstation**.
- The **Operator Workstation** can administer the **WLKRLAB Runtime Host** over SSH with `ssh wlkrlab`.
- The **Runtime Workspace** should live on the **WLKRLAB Runtime Host**, including SQLite state, logs, Project Registry, cloned repos, disposable worktrees, run journals, and build artifacts.
- The **Runtime Workspace** should live under one configurable **Workspace Root**, such as `~/vampyre` or `~/wlkr/vampyre`, instead of scattered paths or random existing checkouts.
- The MVP **Runtime User** may be the normal homelab user reached by `ssh wlkrlab`, while leaving paths and config portable enough to move to a dedicated service user later.
- Phase 0 should include a **Host Doctor Check** for `wlkrlab` that validates SSH reachability, Node, Git, GitHub auth, Codex access, Workspace Root writability, service support, SQLite, and Telegram configuration.
- Phase 0 may include a **Host Setup Command** that installs or repairs approved prerequisites such as Node and `pnpm` on `wlkrlab`.
- The **Host Setup Sudo Boundary** allows `sudo` for approved runtime prerequisites when needed, but not for unrelated homelab services, firewall/DNS changes, global project dependencies, or secret changes.
- The MVP should run Vampyre with a **Systemd User Service** on `wlkrlab`; live host inspection confirmed `systemd`, `systemctl --user`, and linger support are available for the `wlkrlab` user.
- The **Daemon CLI** should wrap normal `systemd --user` operations, including install, start, stop, restart, status, and logs.
- The **MVP Implementation Stack** should be TypeScript on Node.js, covering the daemon, CLI, GitHub and Telegram integrations, config validation, SQLite state, scheduling, filesystem, and git orchestration.
- The MVP **Package Manager** should be `pnpm`, with Phase 0 responsible for making Node and `pnpm` available on `wlkrlab`.
- The **Daemon Toolchain** should use a daemon-friendly install path such as system packages or `mise`; avoid `nvm` for the service runtime unless there is a deliberate wrapper that makes it reliable in non-interactive and systemd environments.
- The MVP **Secret Source** should be a strict-permission host-local env file referenced by the **Systemd User Service**, with 1Password kept as a later possible provider.
- Vampyre may store **Secret Presence Metadata**, but must never store or print secret values in SQLite, logs, repo files, reports, or chat.
- The **Host Doctor Check** may create a **Secret Stub** with `0600` permissions when the env file is missing, then report missing keys without asking for or displaying secret values.
- The **MVP Secret Set** should include GitHub access, Telegram bot token, Telegram chat id, and Codex/auth availability on `wlkrlab`; OpenRouter and project-specific secrets are optional until a project or provider needs them.
- Missing Telegram configuration should be an **MVP Completion Blocker**, not a reason to stop all GitHub-centered daemon work.
- **Daemon GitHub Auth** should prefer an explicit `GITHUB_TOKEN` in the host-local env file, while `gh` authentication may be used for diagnostics and setup assistance.
- The MVP **GitHub Token Boundary** should use the least privilege that still supports managed repositories and **Automatic Repo Creation** after the **Repo Creation Gate**.
- The **Always-on Runtime** is core to Vampyre's identity; the first meaningful version should run as a real long-lived daemon rather than only as a manual CLI loop.
- A **Daemon-first MVP** should include a supervised scheduler loop, persistent state, project registry loading, logs or run journals, crash-safe restart behavior, and CLI commands for operating the daemon.
- `run once` behavior may exist for debugging or administration, but it should not be the main Vampyre product path.
- Each **Project** in the **Project Portfolio** should have a **Project Profile** with its repo identity, local path, mode, cadence, autonomy policy, notification settings, status docs, validation commands, and budget posture.
- **Budget-aware Scheduling** should monitor **Token Budget** for Codex first and likely OpenRouter next, then pace work so Vampyre remains consistently useful without exhausting available capacity.
- The **Central Daemon** should avoid launching many high-cost agents at once across the **Project Portfolio**.
- **Budget Mode** should degrade gracefully: normal mode runs regular Watcher cadence and Builder loops, conservative mode favors blockers and cheap progress, critical mode pauses new builds except urgent safety work, and exhausted mode stops agent launches while keeping the daemon alive.
- The MVP should allow only one **Active Build Agent** at a time, while still allowing cheap monitoring, polling, blocker scanning, and reporting loops.
- An **Owner Check-in Surface** should expose **Budget-aware Scheduling** decisions, including which Projects are selected, deferred, blocked, or held because of **Token Budget** or **Budget Mode**.
- Vampyre should store **Operational State** in local SQLite and store **Project Truth** in GitHub plus repo-local docs.
- If local **Operational State** is lost, Vampyre should recover most project truth from GitHub and repo-local docs, while accepting that some local run history may be gone.
- The MVP should use **Worktree Isolation** for project changes, with **Container Isolation** reserved for later hardening.
- When an **Active Build Agent** fails, Vampyre should write a **Run Journal**, apply **Failure Classification**, preserve useful artifacts when appropriate, and choose a safe next action.
- Failure categories should include validation failure, missing secret or access, merge conflict, agent error or context exhaustion, and unsafe or risky discovery.
- Vampyre should open a **Draft PR** for failed-validation work only when useful implementation exists, failure evidence is clear, and human review could unblock direction.
- Vampyre should keep failed work private when the state is noisy, incomplete, unsafe, or likely fixable by the next run.
- **Project Profiles** should live in the central **Project Registry** for daemon-owned facts, while project-owned truth should live in each project's repo-local docs.
- The first **MVP Proof** should include one Safe/Watcher Mode project and one Builder Mode project, with one **Central Daemon**, one active build limit, GitHub output, Telegram notifications, SQLite state, run journals, and worktree isolation.
- A **Post-MVP Product Loop Proof** follows a closed **MVP Proof** and should prove continuing product value rather than reopening the daemon proof.
- The first **MVP Watcher Project** should be `scwlkr/paletteWOW`, a public GitHub project whose default branch is `main`.
- The first **MVP Builder Project** should be a real intended macOS screenshot tool with quick markup features similar in spirit to ShareX, not a disposable test case.
- A **Project** can be handled in **Safe/Watcher Mode** when it already exists and needs long-term sustainment.
- A **Project** can be handled in **Builder Mode** when it starts as an idea, MVP, or early roadmap.
- In **Builder Mode**, a **Raw Idea** should first be expanded into a **Vision Pair** before Vampyre commits to one product direction.
- Vampyre should perform **Bounded External Research** before creating a **Vision Pair** when the Raw Idea depends on current tools, competitors, technical feasibility, platform constraints, libraries, or reusable skills.
- **Bounded External Research** should produce an **Evidence Brief** with 5-8 key findings, source links, implications for the Vision Options, build constraints, reusable assets, and explicit research limits.
- Pre-repo Builder Mode artifacts should live in the **Builder Intake Area**, such as `docs/builder-intake/<idea-slug>/`, until Automatic Repo Creation.
- Builder Intake Area files should be created by the actual Builder Mode workflow when it runs fresh research, not prefilled during roadmap discussion.
- Each **Vision Option** should include a **Lightweight Brand Direction** with working product name, target user, tone, positioning, core differentiator, MVP scope, and likely repo-name recommendation.
- A **Vision Pair** should contain exactly two meaningfully different **Vision Options**; more than two options is a focus failure unless explicitly requested by the **Owner**.
- Once the **Owner** selects a **Vision Option**, Vampyre enters a **Build Loop** that may continue over many sessions and days depending on scope and token availability.
- **Builder Mode** uses **Project Builds** to take larger product swings and launch real projects; it should not be constrained to the smaller issue-by-issue cadence used for mature project sustainment.
- A **Project Build** is allowed to prioritize momentum, working product shape, and launch progress over perfect early implementation, because quality and details can be improved later through a **Refinement Loop**.
- A **Project Build** should stop at the next useful **Proof Point**, not at a universal fixed stage list.
- For a **Raw Idea**, Vampyre should create comparison artifacts first, then wait for the **Repo Creation Gate** before creating the real project repository.
- After the **Repo Creation Gate**, Vampyre should create a **Repo Plan** for the selected Builder Mode project, then perform **Automatic Repo Creation** only after the plan is approved in a **Formal Approval Record**.
- A **Repo Plan** should include repo name, visibility, description, topics, license, enabled GitHub features, default branch, and initial files or docs.
- The **Repo Plan** should include one **Repo Name Recommendation** that the **Owner** can approve or edit as part of the same approval flow.
- Builder-created repositories should default to private until the **Initial Baseline** is real and a **Launch Visibility Gate** approves making the project public.
- Before implementation begins in **Builder Mode**, the selected **Vision Option** should become a **Project Contract** in the project repository.
- A **Project Contract** should make the repository, not chat history, the canonical source for purpose, roadmap, current status, and owner boundaries.
- Early **Builder Mode** should work primarily from the **Project Contract** and repo-local status docs, using GitHub issues selectively for approvals, blockers, separately tracked work, and later Refinement Loop tasks.
- In **Builder Mode**, Vampyre may commit directly to `main` for initial repo creation and the **Initial Baseline**.
- After the **Initial Baseline** exists, refinements, risky changes, major additions, and Safe/Watcher-style sustainment should use branches and pull requests.
- In **Safe/Watcher Mode**, Vampyre should not commit directly to a mature project's `main` branch.
- **Project Graduation** can happen after the **Initial Baseline** exists, the core workflow runs, project contract and status docs exist, validation is known or blocked explicitly, known gaps are documented, and the **Owner** decides the project is worth sustaining.
- Vampyre should be able to use **Visual Project Reports** when HTML is a better medium than Markdown for inspecting project vision, status, suggestions, implemented work, or feature opportunities.
- **Visual Project Reports** are best for comparison, spatial layout, scanning, roadmap maps, cross-project summaries, product suggestions, before/after notes, and vision boards.
- **Canonical Project Docs** remain the source of truth for contracts, ADRs, changelogs, status logs, and implementation handoffs.
- `docs/STATUS.md` is Vampyre's **Status Handoff** and should be updated after every meaningful implementation session with current phase, completed work, latest proof, blockers, and exact next action.
- GitHub should be the main **Control Surface** for issues, PRs, labels, comments, and approval history.
- The **Owner Check-in Surface** should be a read-only projection over **Operational State**, scheduler decisions, **Run Journals**, open **Project Blockers**, latest review links, and current action needed.
- CLI check-ins, Telegram `/status`, and **Daily Briefs** should render from the same **Check-in Summary**, with different lengths and formatting but the same underlying facts.
- CLI rendering should carry full operator detail, including project, Run Journal, report, validation, and scheduler-cursor detail when useful.
- Telegram `/status` should render a **Compact Telegram Status** by default.
- **Daily Briefs** should be scheduled and action-oriented.
- The first **Check-in Summary** implementation should be **CLI-first** for testability on the Operator Workstation and `wlkrlab`, then reused by Telegram `/status` and **Daily Brief** renderers.
- **CLI-first Check-in Implementation** is an implementation order, not a product priority; the **Mobile Check-in Channel** remains the everyday Owner experience.
- The **Check-in MVP** should ship before returning to `paletteWOW` runtime sync/cleanup and Pinmark hands-on validation.
- The **Check-in MVP** should include the shared **Check-in Summary**, detailed CLI renderer, Authorized Telegram Chat-gated `/status`, and visible **Work Pause** state; Daily Brief scheduling and **Unauthorized Telegram Alert Threshold** enforcement can follow after basic check-in unless they are cheap while wiring Telegram.
- Telegram should be the **Mobile Check-in Channel** for quick updates, daily briefs, alerts, status checks, links or attachments to **Visual Project Reports**, and low-risk **Telegram Operational Commands**.
- A **Daily Brief** should include running state, **Budget Mode**, completed work, selected/deferred/blocked Projects with reasons, open PRs or approvals needing the **Owner**, the next likely action, and useful links.
- A **Daily Brief** should not include raw logs unless Vampyre is degraded, blocked, or failed in a way where the log excerpt explains the needed action.
- **Immediate Alerts** should be limited to daemon down or repeated daemon failure, critical or exhausted **Token Budget**, a **Project Blocker** needing **Owner** input, an approval needed before meaningful progress can continue, a PR ready for review or merge, validation failure after useful work, and **Work Pause** start, expiry, or early resume.
- Routine progress, normal deferrals, healthy heartbeats, and non-actionable summaries should wait for the next **Daily Brief**.
- Initial **Telegram Operational Commands** should use no-space slash command names such as `/status`, `/pause1min`, `/pause1hour`, `/pause1day`, and `/resume`.
- **Telegram Operational Commands** may pause or inspect scheduling, but should not approve major work, merge PRs, expose secrets, or provide a general remote shell.
- The MVP should accept **Telegram Operational Commands** only from the **Authorized Telegram Chat** configured by `TELEGRAM_CHAT_ID`.
- Unknown Telegram chats should receive no useful operational details and should not be able to infer secrets, project state, or runtime status.
- Authorized Telegram `/status`, pause, and `/resume` commands should send a **Telegram Command Confirmation** back to the chat.
- Pause and `/resume` confirmations should include whether new work is paused, the expiry time or resumed state, and whether any **Active Build Agent** is already running and will finish normally.
- Telegram command handling should use **Telegram Command Polling** for the MVP, with processed update offset or idempotency state persisted in SQLite so duplicate Telegram updates do not rerun commands.
- **Unauthorized Telegram Command Attempts** should be logged and counted quietly by default.
- The **Unauthorized Telegram Alert Threshold** should trigger after three **Unauthorized Telegram Command Attempts** within ten minutes.
- After an **Unauthorized Telegram Alert Threshold** alert, repeated alerts should be suppressed for one hour unless the source or rate changes materially.
- `/pause1min`, `/pause1hour`, and `/pause1day` should create a **Work Pause**, not stop the **Central Daemon**.
- A **Work Pause** should block new scheduler-selected project-changing runs while preserving heartbeats, `/status`, daily briefs, notifications, GitHub polling, and urgent blocker reporting.
- The first **Work Pause** implementation should be global across the **Project Portfolio**; per-project pauses can come later only if the command grammar stays clear.
- A **Work Pause** should auto-resume when its duration expires; `/resume` should only end the current **Work Pause** early.
- A **Work Pause** should not interrupt an already-running **Active Build Agent**; the agent should finish, write its **Run Journal** and reports, and surface the outcome normally.
- Emergency cancellation should be a separate later control, not part of `/pause1min`, `/pause1hour`, or `/pause1day`.
- **Work Pause State** should be persisted in SQLite on `wlkrlab` so pause behavior survives daemon restarts and is visible to both the scheduler and **Check-in Summary**.
- **Work Pause State** should include `paused_until`, `source`, `created_at`, and optional `reason`; `source` should identify the command origin without storing secret values or making Telegram the durable ledger.
- **CLI Pause Commands** should exist for `pause 1m|1h|1d`, `resume`, and pause status, writing the same **Work Pause State** used by Telegram commands.
- Telegram pause commands should be a phone-friendly wrapper over the same pause control path, not a separate implementation.
- Significant approvals should be captured in a **Formal Approval Record** on GitHub through issues, PRs, comments, or labels.
- Telegram should link to GitHub issues and PRs when the **Owner** needs to review, approve, reject, or merge work.
- The CLI should serve local administration needs such as daemon setup, doctor checks, local runs, status, and configuration.
- When a **Project** is missing required setup, secrets, access, validation commands, or external credentials, Vampyre should record a **Project Blocker**, notify the **Owner**, and continue work on other Projects.
- When validation is unclear, Vampyre should follow a **Validation Ladder**: use configured commands first, infer standard repo commands second, run available static checks third, and make missing validation visible through a blocker or improvement issue.
- Vampyre should not claim work is safe without reporting what was and was not validated.
- The initial test shape should include one Safe/Watcher Mode project and one Builder Mode project.
- In **Safe/Watcher Mode**, **Daily Forward Motion** should keep a **Project** from stagnating even when there are no active bugs, broken builds, or pending issues.
- In **Safe/Watcher Mode**, Vampyre should optimize healthy-project improvements for **Compounding Product Quality**, prioritizing user-facing bugs, build/test/security issues, small core-value features, UX polish, accessibility, docs, demos, and only then refactors that reduce real risk or unblock future work.
- In **Safe/Watcher Mode**, automatic internal refactors should be **Payoff-backed Refactors**, not stylistic rewrites, framework swaps, folder reorganizations, or broad cleanup passes without a before-and-after validation story.
- The first action on the **MVP Watcher Project** should be a **Watcher Discovery Pass** that inspects the repo, checks GitHub issues and PRs, infers validation commands, records project purpose/status if missing, and then chooses one low-risk first improvement.
- **Auto-safe Work** can be implemented without prior approval, but still ends in a pull request that the **Owner** reviews and merges.
- A **Major Feature Candidate** should be confirmed by the **Owner** before Vampyre spends significant build effort.
- **Work Classification** is based on risk, scope, and reversibility: Auto-safe Work fits in one small PR, is easy to revert, avoids core product-direction changes, and has obvious validation.
- Work becomes a **Major Feature Candidate** when it spans multiple PRs, changes product direction, introduces new user workflows, changes persistence/auth/security/deployment, or would be expensive to revert.
- The **Owner** remains the final authority for direction, risk, approvals, and irreversible actions.

## Example dialogue

> **Dev:** "Should Vampyre only watch this repo and tell the Owner what to do?"
> **Domain expert:** "No. In Safe/Watcher Mode, Vampyre should continuously improve and sustain the Project through issues, PR review, PR creation, feature work, and Daily Forward Motion, while preserving approval gates for risky work."

## Flagged ambiguities

- "PR forge" was rejected as the core product definition. Resolved: Vampyre is an always-on system for creating and sustaining projects; PR creation is one mechanism, not the purpose.
- "Autonomous" does not mean direct merge authority. Resolved: Vampyre can build Auto-safe Work without asking first, but the Owner remains the merge authority.
- "Small" and "large" are not enough to classify work. Resolved: use Work Classification based on risk, scope, and reversibility.
- "Builder Mode" does not mean immediately implementing the first interpretation of a Raw Idea. Resolved: Vampyre should propose multiple Vision Options first, then build the selected direction through a Build Loop.
- "Options" does not mean an open-ended brainstorm. Resolved: Builder Mode should produce a Vision Pair by default.
- "Plan" should not live only in chat. Resolved: Builder Mode should create a Project Contract before implementation begins.
- "Prototype" is the wrong word for Builder Mode. Resolved: Builder Mode creates real projects through Project Builds, with later Refinement Loops to harden and polish.
- "Work Item" should not be the shared execution unit across both modes. Resolved: Builder Mode can use larger Project Builds, while Safe/Watcher Mode should keep work smaller and reviewable for mature project sustainment.
- "Done for now" in Builder Mode does not mean a fixed process stage. Resolved: Builder Mode stops at the next useful Proof Point and leaves a precise next target.
- "Status" and project ideas do not always need to be Markdown. Resolved: Vampyre should be able to use browser-viewable HTML when visual structure would improve human or AI understanding.
- "HTML report" does not replace durable Markdown docs. Resolved: use HTML for visual understanding and Markdown for canonical project truth.
- Status should not live only in chat. Resolved: keep `docs/STATUS.md` current as the Status Handoff after meaningful sessions.
- Status surfaces should not each calculate their own truth. Resolved: CLI check-ins, Telegram `/status`, and **Daily Briefs** render from one **Check-in Summary** model.
- "Same Check-in Summary" does not mean the same output length everywhere. Resolved: Telegram `/status` defaults to **Compact Telegram Status**, while the CLI carries full operator detail.
- Phone-first UX does not require Telegram-first implementation. Resolved: build a **CLI-first Check-in Implementation** for testability, then wire Telegram renderers to the same **Check-in Summary**.
- The check-in surface should not expand into the whole Telegram operations layer before product-loop follow-through resumes. Resolved: ship the **Check-in MVP** first, defer scheduled Daily Brief delivery and unauthorized-attempt threshold enforcement unless cheap, then return to `paletteWOW` sync and Pinmark validation.
- "Logs" are not the same as an Owner check-in. Resolved: logs and SQLite are evidence sources; the **Owner Check-in Surface** should summarize runtime health, schedule, budget posture, recent work, links, blockers, and required action in plain language.
- "Daily brief" does not mean a full report. Resolved: the **Daily Brief** is a short action-oriented Telegram summary, with links to reports or GitHub records when more detail is useful.
- "Alert" does not mean every state change. Resolved: use **Immediate Alerts** only for action-needed or risk events; routine progress belongs in the **Daily Brief**.
- "Phone-first" does not mean any Telegram account can operate Vampyre. Resolved: the MVP accepts **Telegram Operational Commands** only from the configured **Authorized Telegram Chat**.
- Authorized Telegram commands should not be silent. Resolved: send a **Telegram Command Confirmation** for accepted `/status`, pause, and `/resume` commands, while unauthorized chats get no useful operational detail.
- An unauthorized Telegram command does not always need to interrupt the Owner. Resolved: log and count **Unauthorized Telegram Command Attempts** quietly, then alert at the **Unauthorized Telegram Alert Threshold** of three attempts within ten minutes with one-hour alert suppression.
- "Phone-first" does not mean Telegram becomes the approval system. Resolved: Telegram is the **Mobile Check-in Channel** for alerts, daily briefs, status, and low-risk pause commands; GitHub and CLI remain the durable approval and heavier control surfaces.
- "Pause" does not mean stop the daemon, pause one named project, or hold forever by default. Resolved: `/pause1min`, `/pause1hour`, and `/pause1day` create a timed global **Work Pause** that auto-resumes, while `/resume` ends it early.
- Work Pause does not mean cancel in-flight work. Resolved: **Work Pause** blocks new project-changing launches only; an already-running **Active Build Agent** finishes and reports normally.
- Work Pause should not disappear on daemon restart. Resolved: persist **Work Pause State** in SQLite on `wlkrlab`, read it from the scheduler before selecting work, and render it through the shared **Check-in Summary**.
- Work Pause should not be Telegram-only. Resolved: implement **CLI Pause Commands** against the same SQLite-backed **Work Pause State**, then make Telegram pause commands a wrapper over that control path.
- Telegram commands should not require a public endpoint for the Check-in MVP. Resolved: use **Telegram Command Polling** with SQLite offset/idempotency state for the MVP; webhooks can be considered later if needed.
- Telegram is not the primary approval ledger. Resolved: use Telegram for the **Mobile Check-in Channel**, quick updates, blockers, low-risk pause/status commands, and delivery or linking of visual review artifacts.
- Formal approval should not live only in Telegram. Resolved: GitHub is the durable approval source; Telegram sends updates and links to the relevant GitHub issue or PR.
- Vampyre should not require one daemon or Telegram bot per project. Resolved: one Central Daemon manages the Project Portfolio, with early testing on one Safe/Watcher project and one Builder project.
- Vampyre should not depend on the current MacBook as its production runtime. Resolved: run the Central Daemon on the WLKRLAB Runtime Host and use the MacBook as an Operator Workstation via `ssh wlkrlab`.
- Vampyre should not split runtime state between the MacBook and homelab. Resolved: keep the Runtime Workspace on the WLKRLAB Runtime Host.
- Vampyre should not reuse arbitrary existing project checkouts for daemon work. Resolved: keep managed clones and worktrees under one Workspace Root on the WLKRLAB Runtime Host.
- Host readiness should not be assumed. Resolved: add a Host Doctor Check for `wlkrlab` before relying on the daemon runtime.
- Host setup may install missing prerequisites. Resolved: use an explicit Host Setup Command for approved installs or repairs instead of surprising mutation during diagnostics.
- Host setup may use `sudo` when needed. Resolved: privileged changes are limited to approved runtime prerequisites under the Host Setup Sudo Boundary.
- Vampyre should not run as an SSH-session background process. Resolved: use a Systemd User Service for MVP supervision on `wlkrlab`.
- Normal daemon operation should not require remembering raw `systemctl` commands. Resolved: the Daemon CLI wraps the Systemd User Service.
- Vampyre should not split the MVP across multiple implementation languages. Resolved: use TypeScript and Node.js for the first daemon, CLI, integrations, scheduler, and state layer.
- Vampyre should not mix Node package managers in the MVP. Resolved: use `pnpm` and a `pnpm-lock.yaml`.
- Secret handling should start simple and safe. Resolved: use a host-local env file for MVP, track only Secret Presence Metadata, and keep 1Password as a later provider option.
- The daemon should not start with an overpowered GitHub token by default. Resolved: prefer a fine-grained token scoped to managed repositories and explicit MVP permissions.
- One blocked Project should not stop the whole Project Portfolio. Resolved: record a Project Blocker, notify the Owner, and continue with other eligible Projects.
- Vampyre should not start as a manual-only orchestration script. Resolved: the Always-on Runtime is the core product, with CLI commands serving administration and inspection.
- Daemon-first should still be debuggable. Resolved: include CLI tools for status, diagnosis, one-off triggers, pausing, and inspection without making the CLI loop the primary runtime.
- Always-on does not mean spending tokens as fast as possible. Resolved: use Budget-aware Scheduling to pace work and preserve Token Budget across the Project Portfolio.
- Low Token Budget should not stop all useful behavior equally. Resolved: Budget Mode degrades from normal to conservative, critical, and exhausted behavior.
- Failed runs should not disappear or retry blindly. Resolved: use Run Journals and Failure Classification to preserve context and choose the next safe action.
- The first MVP Watcher Project is selected. Resolved: use `scwlkr/paletteWOW` for Safe/Watcher Mode testing.
- The first MVP Builder Project should be real. Resolved: use the macOS screenshot tool idea as an intended project that could be shipped after refinement.
- "Post-MVP follow-through" was too vague after the daemon proof closed. Resolved: the next milestone is a **Post-MVP Product Loop Proof**, not an extension or reopening of the **MVP Proof**.
- Builder Mode should not create repositories for unchosen Vision Options. Resolved: require a Repo Creation Gate after the Owner selects the direction.
- Builder Mode should create the selected repository automatically. Resolved: Automatic Repo Creation is part of the MVP after an approved Repo Plan passes the Repo Creation Gate.
- Builder-created repos should not be public by default. Resolved: start private and use a Launch Visibility Gate before public release.
- Builder Mode brand work should be lightweight but real. Resolved: Vision Options include enough brand direction to guide repo naming, positioning, and first build decisions.
- Builder Mode should not rely only on assumed knowledge for current product spaces. Resolved: use Bounded External Research before Vision Options when market, platform, tooling, or feasibility knowledge matters.
- Pre-repo Builder artifacts need a home. Resolved: keep Evidence Briefs, Vision Pairs, HTML comparisons, Repo Plans, and unselected rationale in the Builder Intake Area until the selected direction becomes the new repo's Project Contract.
- Builder intake docs should not be drafted from stale planning-session assumptions. Resolved: create them when Builder Mode runs fresh research.
- Builder Mode should not create a large issue backlog immediately after repo creation. Resolved: use the Project Contract and status docs as the early build control surface, with selective GitHub issues.
- Builder Mode direct commits are allowed only for the beginning. Resolved: initial repo creation and Initial Baseline may go to `main`, then PRs take over.
- Builder Mode should not last forever. Resolved: use Project Graduation to move a real running project into Safe/Watcher Mode for long-term sustainment.
- Safe/Watcher refactors should not be taste-driven. Resolved: automatic refactors must be payoff-backed and validated.
- The first `paletteWOW` action should not be blind editing. Resolved: run a Watcher Discovery Pass before choosing the first Auto-safe Work.
