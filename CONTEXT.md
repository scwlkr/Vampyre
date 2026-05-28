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
- Vampyre should store **Operational State** in local SQLite and store **Project Truth** in GitHub plus repo-local docs.
- If local **Operational State** is lost, Vampyre should recover most project truth from GitHub and repo-local docs, while accepting that some local run history may be gone.
- The MVP should use **Worktree Isolation** for project changes, with **Container Isolation** reserved for later hardening.
- When an **Active Build Agent** fails, Vampyre should write a **Run Journal**, apply **Failure Classification**, preserve useful artifacts when appropriate, and choose a safe next action.
- Failure categories should include validation failure, missing secret or access, merge conflict, agent error or context exhaustion, and unsafe or risky discovery.
- Vampyre should open a **Draft PR** for failed-validation work only when useful implementation exists, failure evidence is clear, and human review could unblock direction.
- Vampyre should keep failed work private when the state is noisy, incomplete, unsafe, or likely fixable by the next run.
- **Project Profiles** should live in the central **Project Registry** for daemon-owned facts, while project-owned truth should live in each project's repo-local docs.
- The first **MVP Proof** should include one Safe/Watcher Mode project and one Builder Mode project, with one **Central Daemon**, one active build limit, GitHub output, Telegram notifications, SQLite state, run journals, and worktree isolation.
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
- Telegram should act primarily as a **Notification Channel** for quick updates, blocker alerts, status pings, and links or attachments to **Visual Project Reports**.
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
- Telegram is not the primary approval ledger. Resolved: use Telegram mainly for notifications, quick updates, blockers, and delivery or linking of visual review artifacts.
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
