import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import {
  createGitHubClient,
  createGitHubIssue,
  createGitHubIssueComment,
  createGitHubPullRequest,
  ensureGitHubLabel,
  findOpenGitHubIssueByTitle,
  findOpenGitHubPullRequestForBranch,
  updateGitHubPullRequest,
  type GitHubClient,
  type GitHubFetch,
} from "../github/client.js";
import type { TelegramFetch, TelegramFetchResponse } from "../github/reviewWorkflow.js";
import { shellQuote, validateWorkspaceRoot, workspacePath, workspaceRootPrelude } from "../remote/paths.js";
import { runSchedulerTick as defaultRunSchedulerTick } from "../scheduler/scheduler.js";
import {
  createRunJournal,
  initializeOperationalState,
  recordProjectBlocker,
  releaseActiveBuildAgentLock,
  resolveProjectBlockers,
  tryAcquireActiveBuildAgentLock,
  updateRunJournal,
  type OperationalStateOptions,
  type OperationalStateReport,
  type ProjectRuntimeStatus,
  type RunJournalStatus,
  type SchedulerDecisionRecord,
  type SchedulerTickRecord,
} from "../state/operationalState.js";

export interface BuildAgentRunOptions {
  host: string;
  workspaceRoot: string;
  local?: boolean | undefined;
  projectId?: string | undefined;
  now?: (() => Date) | undefined;
  runner?: RemoteCommandRunner | undefined;
  commandRunner?: BuildAgentCommandRunner | undefined;
  workerCommand?: string | undefined;
  task?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  githubClient?: GitHubClient | undefined;
  githubFetch?: GitHubFetch | undefined;
  telegramFetch?: TelegramFetch | undefined;
  initializeState?: ((options: OperationalStateOptions) => Promise<OperationalStateReport>) | undefined;
  runSchedulerTick?: typeof defaultRunSchedulerTick | undefined;
}

export interface BuildAgentRunReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  blockers: string[];
  startedAt: string;
  completedAt?: string | undefined;
  project?: BuildAgentProjectSummary | undefined;
  scheduler?: BuildAgentSchedulerSummary | undefined;
  runJournal?: BuildAgentRunJournalSummary | undefined;
  worktree?: BuildAgentWorktreeSummary | undefined;
  taskContext?: BuildAgentTaskContextSummary | undefined;
  worker?: BuildAgentWorkerLaunchSummary | undefined;
  branchOutput?: BuildAgentBranchOutputSummary | undefined;
  validation?: BuildAgentValidationSummary | undefined;
  workerStep?: BuildAgentWorkerStepSummary | undefined;
  pullRequest?: BuildAgentPullRequestSummary | undefined;
  github?: BuildAgentGitHubSummary | undefined;
  telegram?: BuildAgentTelegramSummary | undefined;
  reportPaths?: BuildAgentReportPaths | undefined;
  proof: string[];
  details?: string | undefined;
}

export interface BuildAgentProjectSummary {
  id: string;
  displayName: string;
  mode: string;
  githubRepo: string;
}

export interface BuildAgentSchedulerSummary {
  tickedAt: string;
  budget: string;
  selectedProjectId: string;
  decisionReason: string;
}

export interface BuildAgentRunJournalSummary {
  id: string;
  phase: string;
  status: RunJournalStatus;
  summary: string;
}

export interface BuildAgentWorktreeSummary {
  repoPath: string;
  worktreePath: string;
  branch: string;
  baseRef: string;
  cleanup: "not-started" | "removed" | "preserved";
}

export interface BuildAgentTaskContextSummary {
  path: string;
  task: string;
}

export interface BuildAgentWorkerLaunchSummary {
  status: "skipped" | "completed" | "failed" | "context-exhausted";
  summary: string;
  command?: string | undefined;
  exitCode?: number | undefined;
  stdoutSummary?: string | undefined;
  stderrSummary?: string | undefined;
  stdoutPath?: string | undefined;
  stderrPath?: string | undefined;
}

export interface BuildAgentBranchOutputSummary {
  status: "no-changes" | "committed" | "pushed" | "pushed-main";
  branch: string;
  changedFiles: string[];
  commit?: string | undefined;
}

export interface BuildAgentWorkerStepSummary {
  kind: "configured-validation";
  command: string;
  exitCode: number;
  summary: string;
  stdoutSummary?: string | undefined;
  stderrSummary?: string | undefined;
}

export interface BuildAgentValidationSummary {
  source: "project-registry" | "watcher-discovery";
  status: "passed" | "failed";
  commands: BuildAgentValidationCommandSummary[];
}

export interface BuildAgentValidationCommandSummary {
  kind: "configured-validation";
  command: string;
  exitCode: number;
  summary: string;
  stdoutSummary?: string | undefined;
  stderrSummary?: string | undefined;
}

export interface BuildAgentGitHubSummary {
  repo: string;
  labelName: string;
  labelAction: "created" | "updated";
  issueNumber: number;
  issueUrl: string;
  issueAction: "created" | "reused";
  commentUrl: string;
}

export interface BuildAgentPullRequestSummary {
  repo: string;
  head: string;
  base: string;
  title: string;
  action: "created" | "updated";
  number: number;
  url: string;
  draft: boolean;
}

export interface BuildAgentTelegramSummary {
  status: "sent" | "failed";
  summary: string;
  messageId?: string | undefined;
}

export interface BuildAgentReportPaths {
  markdown: string;
  json: string;
}

export interface BuildAgentCommandSpec {
  command: string;
  args: string[];
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface BuildAgentCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type BuildAgentCommandRunner = (spec: BuildAgentCommandSpec) => Promise<BuildAgentCommandResult>;

interface BuildTarget {
  project: ProjectRuntimeStatus & { githubRepo: string };
  decision: SchedulerDecisionRecord;
}

interface TelegramMessageResult {
  messageId: string;
}

type BuildAgentFailureClassification =
  | "missing-secret-or-access"
  | "merge-conflict"
  | "validation-failure"
  | "agent-error"
  | "context-exhaustion";

const AGENT_PHASE = "worktree-build-agent";
const BUILD_AGENT_LABEL = "vampyre:review";
const BUILD_AGENT_LABEL_COLOR = "0e8a16";
const BUILD_AGENT_LABEL_DESCRIPTION = "Durable Vampyre review and approval records";

export async function runBuildAgent(options: BuildAgentRunOptions): Promise<BuildAgentRunReport> {
  validateWorkspaceRoot(options.workspaceRoot);

  if (options.local === true) {
    return runLocalBuildAgent(options);
  }

  validateHost(options.host);
  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(buildAgentRemoteCommand(options));
  const parsed = parseRemoteBuildAgentReport(result.stdout);

  if (parsed.ok) {
    return {
      ...parsed.value,
      host: options.host,
      workspaceRoot: options.workspaceRoot,
    };
  }

  const summary = firstLine(result.stderr) || parsed.message || firstLine(result.stdout) || "remote build-agent run failed";
  const report: BuildAgentRunReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: [`Build agent: ${summary}`],
    startedAt: nowIso(options),
    proof: [],
  };
  const details = summarizeOutput(result);
  if (details) {
    report.details = details;
  }
  return report;
}

export function formatBuildAgentRunReport(report: BuildAgentRunReport): string {
  const lines: string[] = [
    "Vampyre build-agent run",
    `Host: ${report.host}`,
    `Workspace Root: ${report.workspaceRoot}`,
    `Started At: ${report.startedAt}`,
  ];

  if (report.completedAt) {
    lines.push(`Completed At: ${report.completedAt}`);
  }

  if (report.project) {
    lines.push("");
    lines.push(`Project: ${report.project.displayName} (${report.project.id})`);
    lines.push(`Mode: ${report.project.mode}`);
    lines.push(`GitHub: ${report.project.githubRepo}`);
  }

  if (report.scheduler) {
    lines.push("");
    lines.push(`Scheduler: ${report.scheduler.budget}; ${report.scheduler.decisionReason}`);
  }

  if (report.runJournal) {
    lines.push("");
    lines.push(`Run Journal: ${report.runJournal.id}`);
    lines.push(`Status: ${report.runJournal.status}`);
    lines.push(`Summary: ${report.runJournal.summary}`);
  }

  if (report.worktree) {
    lines.push("");
    lines.push("Worktree:");
    lines.push(`  Repo: ${report.worktree.repoPath}`);
    lines.push(`  Path: ${report.worktree.worktreePath}`);
    lines.push(`  Branch: ${report.worktree.branch}`);
    lines.push(`  Base: ${report.worktree.baseRef}`);
    lines.push(`  Cleanup: ${report.worktree.cleanup}`);
  }

  if (report.taskContext) {
    lines.push("");
    lines.push("Task Context:");
    lines.push(`  Task: ${report.taskContext.task}`);
    lines.push(`  Path: ${report.taskContext.path}`);
  }

  if (report.worker) {
    lines.push("");
    lines.push("Worker:");
    lines.push(`  Status: ${report.worker.status}`);
    lines.push(`  Summary: ${report.worker.summary}`);
    if (report.worker.command) {
      lines.push(`  Command: ${report.worker.command}`);
    }
    if (report.worker.exitCode !== undefined) {
      lines.push(`  Exit Code: ${report.worker.exitCode}`);
    }
    if (report.worker.stdoutSummary) {
      lines.push(`  Stdout: ${report.worker.stdoutSummary}`);
    }
    if (report.worker.stderrSummary) {
      lines.push(`  Stderr: ${report.worker.stderrSummary}`);
    }
  }

  if (report.branchOutput) {
    lines.push("");
    lines.push("Branch Output:");
    lines.push(`  Status: ${report.branchOutput.status}`);
    lines.push(`  Branch: ${report.branchOutput.branch}`);
    if (report.branchOutput.commit) {
      lines.push(`  Commit: ${report.branchOutput.commit}`);
    }
    if (report.branchOutput.changedFiles.length > 0) {
      lines.push(`  Changed Files: ${report.branchOutput.changedFiles.join(", ")}`);
    }
  }

  if (report.workerStep) {
    lines.push("");
    lines.push("Validation:");
    if (report.validation) {
      lines.push(`  Source: ${report.validation.source}`);
      lines.push(`  Status: ${report.validation.status}`);
    }
    lines.push(`  Kind: ${report.workerStep.kind}`);
    lines.push(`  Command: ${report.workerStep.command}`);
    lines.push(`  Exit Code: ${report.workerStep.exitCode}`);
    lines.push(`  Summary: ${report.workerStep.summary}`);
  }

  if (report.pullRequest) {
    lines.push("");
    lines.push(`Pull Request: #${report.pullRequest.number} (${report.pullRequest.action})`);
    lines.push(`PR URL: ${report.pullRequest.url}`);
    lines.push(`Draft: ${report.pullRequest.draft ? "yes" : "no"}`);
  }

  if (report.github) {
    lines.push("");
    lines.push(`GitHub Issue: #${report.github.issueNumber} (${report.github.issueAction})`);
    lines.push(`Issue URL: ${report.github.issueUrl}`);
    lines.push(`Comment URL: ${report.github.commentUrl}`);
  }

  if (report.telegram) {
    lines.push("");
    lines.push(`Telegram: ${report.telegram.status} - ${report.telegram.summary}`);
    if (report.telegram.messageId) {
      lines.push(`Telegram Message: ${report.telegram.messageId}`);
    }
  }

  if (report.reportPaths) {
    lines.push("");
    lines.push("Report Files:");
    lines.push(`  Markdown: ${report.reportPaths.markdown}`);
    lines.push(`  JSON: ${report.reportPaths.json}`);
  }

  if (report.proof.length > 0) {
    lines.push("");
    lines.push("Proof:");
    for (const proof of report.proof) {
      lines.push(`- ${proof}`);
    }
  }

  if (report.blockers.length > 0) {
    lines.push("");
    lines.push("Blockers:");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  return lines.join("\n");
}

export function buildAgentRunReportToJson(report: BuildAgentRunReport): string {
  return JSON.stringify(report, null, 2);
}

async function runLocalBuildAgent(options: BuildAgentRunOptions): Promise<BuildAgentRunReport> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const env = options.env ?? process.env;
  const commandRunner = options.commandRunner ?? runLocalCommand;
  const initializeState = options.initializeState ?? initializeOperationalState;
  const schedulerRunner = options.runSchedulerTick ?? defaultRunSchedulerTick;
  const state = await initializeState({
    workspaceRoot: options.workspaceRoot,
    now,
  });
  const schedulerTick = await schedulerRunner({
    state,
    now,
  });
  const target = selectBuildTarget(state, schedulerTick, options.projectId);
  const report: BuildAgentRunReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: [],
    startedAt,
    proof: [`Recorded scheduler tick ${schedulerTick.tickedAt}`],
  };

  if (!target.ok) {
    report.blockers.push(target.blocker);
    return report;
  }

  const project = target.value.project;
  const runId = runJournalId(project.id, startedAt);
  const runJournal: BuildAgentRunJournalSummary = {
    id: runId,
    phase: AGENT_PHASE,
    status: "started",
    summary: `Started Worktree Build Agent run for ${project.displayName}`,
  };
  report.project = projectSummary(project);
  report.scheduler = schedulerSummary(schedulerTick, target.value.decision);
  report.runJournal = runJournal;

  await createRunJournal(state.databasePath, {
    id: runId,
    projectId: project.id,
    phase: AGENT_PHASE,
    status: "started",
    summary: runJournal.summary,
    journalJson: JSON.stringify(report),
    now: startedAt,
  });

  let lockAcquired = false;
  let failure: BuildAgentFailure | undefined;

  try {
    const lock = await tryAcquireActiveBuildAgentLock(state.databasePath, {
      projectId: project.id,
      runJournalId: runId,
      acquiredAt: startedAt,
    });
    lockAcquired = lock.held === true && lock.runJournalId === runId;
    if (!lockAcquired) {
      throw new BuildAgentFailure(
        "agent-error",
        `Active Build Agent lock is held by ${lock.projectId ?? "another project"}`,
      );
    }
    report.proof.push(`Acquired Active Build Agent lock for ${project.id}`);

    const token = envValue(env, "GITHUB_TOKEN");
    if (!token) {
      throw new BuildAgentFailure("missing-secret-or-access", "GITHUB_TOKEN is missing");
    }

    const repoPath = workspacePath(options.workspaceRoot, "repos", project.id);
    const repoResult = await ensureRuntimeRepo({
      repo: project.githubRepo,
      repoPath,
      token,
      commandRunner,
    });
    report.proof.push(...repoResult.proof);

    const worktree = await createWorktree({
      workspaceRoot: options.workspaceRoot,
      projectId: project.id,
      repoPath,
      branch: runBranchName(project.id, startedAt),
      commandRunner,
    });
    report.worktree = worktree;
    report.proof.push(`Created isolated worktree ${worktree.worktreePath}`);

    const validationPlan = await resolveValidationPlan({
      workspaceRoot: options.workspaceRoot,
      project,
    });
    report.proof.push(`Loaded ${validationPlan.commands.length} validation command(s) from ${validationPlan.source}`);

    const baselineValidation = await runConfiguredValidation({
      worktreePath: worktree.worktreePath,
      commands: validationPlan.commands,
      source: validationPlan.source,
      bundlePath: workspacePath(options.workspaceRoot, "artifacts", "bundles", project.id),
      commandRunner,
      redactions: gitAuthRedactions(token),
    });
    report.validation = baselineValidation;
    report.workerStep = baselineValidation.commands.at(-1);
    const failedBaselineValidation = baselineValidation.commands.find((command) => command.exitCode !== 0);
    if (failedBaselineValidation) {
      throw new BuildAgentFailure("validation-failure", failedBaselineValidation.summary);
    }
    for (const command of baselineValidation.commands) {
      report.proof.push(`Baseline validation command exited 0: ${command.command}`);
    }

    const taskContext = await writeTaskContext({
      workspaceRoot: options.workspaceRoot,
      project,
      runId,
      worktree,
      task: await resolveWorkerTask({
        options,
        env,
        project,
        worktreePath: worktree.worktreePath,
      }),
      validationPlan,
    });
    report.taskContext = taskContext;
    report.proof.push(`Wrote worker task context ${taskContext.path}`);

    const workerPlan = resolveWorkerPlan(options, env);
    if (!workerPlan) {
      report.worker = {
        status: "skipped",
        summary: "No Active Build Agent worker command configured; validation-only boundary completed",
      };
      report.branchOutput = {
        status: "no-changes",
        branch: worktree.branch,
        changedFiles: [],
      };
    } else {
      const worker = await runWorkerLaunch({
        workspaceRoot: options.workspaceRoot,
        projectId: project.id,
        runId,
        worktree,
        taskContext,
        command: workerPlan.command,
        commandRunner,
        env,
      });
      report.worker = worker;
      if (worker.status !== "completed") {
        throw new BuildAgentFailure(
          worker.status === "context-exhausted" ? "context-exhaustion" : "agent-error",
          worker.summary,
        );
      }

      const changedFiles = await readWorktreeChangedFiles({
        worktreePath: worktree.worktreePath,
        commandRunner,
      });
      if (changedFiles.length === 0) {
        report.branchOutput = {
          status: "no-changes",
          branch: worktree.branch,
          changedFiles,
        };
        report.proof.push("Worker completed with no worktree changes");
      } else {
        if (usesDirectMainOutput(project)) {
          report.branchOutput = await commitWorktreeChanges({
            project,
            worktree,
            changedFiles,
            commandRunner,
          });
          report.proof.push(`Committed worker output on ${worktree.branch}`);

          const failedFinalValidation = await runFinalValidation({
            report,
            worktreePath: worktree.worktreePath,
            validationPlan,
            bundlePath: workspacePath(options.workspaceRoot, "artifacts", "bundles", project.id),
            commandRunner,
            token,
          });
          if (failedFinalValidation) {
            throw new BuildAgentFailure("validation-failure", failedFinalValidation.summary);
          }

          report.branchOutput = await pushWorktreeHeadToMain({
            previousOutput: report.branchOutput,
            worktree,
            token,
            commandRunner,
          });
          report.proof.push(`Pushed approved direct-main output to ${project.githubRepo} main`);
        } else {
          report.branchOutput = await commitAndPushWorktreeChanges({
            project,
            worktree,
            changedFiles,
            token,
            commandRunner,
          });
          report.proof.push(`Pushed worker branch ${worktree.branch}`);

          const failedFinalValidation = await runFinalValidation({
            report,
            worktreePath: worktree.worktreePath,
            validationPlan,
            bundlePath: workspacePath(options.workspaceRoot, "artifacts", "bundles", project.id),
            commandRunner,
            token,
          });

          report.pullRequest = await upsertBuildAgentPullRequest({
            project,
            report,
            draft: Boolean(failedFinalValidation),
            githubClient: options.githubClient,
            githubFetch: options.githubFetch,
            env,
          });
          report.proof.push(
            `${report.pullRequest.draft ? "Draft PR" : "PR"} ${report.pullRequest.action}: ${report.pullRequest.url}`,
          );

          if (failedFinalValidation) {
            throw new BuildAgentFailure("validation-failure", failedFinalValidation.summary);
          }
        }
      }
    }

    await cleanupSuccessfulWorktreeAndResolveValidationBlockers({
      state,
      projectId: project.id,
      worktree,
      repoPath,
      commandRunner,
      now: now().toISOString(),
      report,
      env,
    });
  } catch (error) {
    failure = buildAgentFailure(error);
    report.blockers.push(`${failure.classification}: ${sanitizeError(failure.message, env)}`);
    if (report.worktree) {
      report.worktree.cleanup = "preserved";
      report.proof.push(`Preserved worktree ${report.worktree.worktreePath} for failure inspection`);
    }
    try {
      await recordProjectBlocker(state.databasePath, {
        id: `${runId}:${failure.classification}`,
        projectId: project.id,
        summary: `Build Agent ${failure.classification}`,
        details: sanitizeError(failure.message, env),
        now: now().toISOString(),
      });
    } catch (blockerError) {
      report.blockers.push(
        `agent-error: ${sanitizeError(
          blockerError instanceof Error ? blockerError.message : String(blockerError),
          env,
        )}`,
      );
    }
  }

  const completedAt = now().toISOString();
  report.completedAt = completedAt;

  try {
    await surfaceBuildAgentOutcome({
      report,
      env,
      githubClient: options.githubClient,
      githubFetch: options.githubFetch,
      telegramFetch: options.telegramFetch,
    });
  } catch (error) {
    report.blockers.push(`surface-outcome: ${sanitizeError(error instanceof Error ? error.message : String(error), env)}`);
  }

  if (lockAcquired) {
    try {
      await releaseActiveBuildAgentLock(state.databasePath);
      report.proof.push(`Released Active Build Agent lock for ${project.id}`);
    } catch (error) {
      report.blockers.push(
        `agent-error: ${sanitizeError(error instanceof Error ? error.message : String(error), env)}`,
      );
    }
  }

  const finalStatus: RunJournalStatus = failure || report.blockers.length > 0 ? "blocked" : "completed";
  const finalSummary =
    finalStatus === "completed"
      ? `Completed Worktree Build Agent validation for ${project.displayName}`
      : `Build Agent run for ${project.displayName} needs follow-up`;
  await finalizeRunJournal({
    databasePath: state.databasePath,
    workspaceRoot: options.workspaceRoot,
    projectId: project.id,
    report,
    status: finalStatus,
    summary: finalSummary,
    now: completedAt,
  });

  report.ready = finalStatus === "completed" && report.blockers.length === 0;
  return report;
}

async function runFinalValidation(options: {
  report: BuildAgentRunReport;
  worktreePath: string;
  validationPlan: BuildAgentValidationPlan;
  bundlePath: string;
  commandRunner: BuildAgentCommandRunner;
  token: string;
}): Promise<BuildAgentValidationCommandSummary | undefined> {
  const finalValidation = await runConfiguredValidation({
    worktreePath: options.worktreePath,
    commands: options.validationPlan.commands,
    source: options.validationPlan.source,
    bundlePath: options.bundlePath,
    commandRunner: options.commandRunner,
    redactions: gitAuthRedactions(options.token),
  });
  options.report.validation = finalValidation;
  options.report.workerStep = finalValidation.commands.at(-1);
  const failedFinalValidation = finalValidation.commands.find((command) => command.exitCode !== 0);
  for (const command of finalValidation.commands) {
    options.report.proof.push(
      command.exitCode === 0
        ? `Final validation command exited 0: ${command.command}`
        : `Final validation command failed: ${command.command}`,
    );
  }

  return failedFinalValidation;
}

function usesDirectMainOutput(project: ProjectRuntimeStatus): boolean {
  return project.autonomyPolicy === "continuous-product-loop-direct-main";
}

function buildAgentRemoteCommand(options: BuildAgentRunOptions): string {
  const args = [
    "agent",
    "run",
    "--local",
    "--json",
    "--host",
    options.host,
    "--workspace-root",
    "$root",
  ];
  if (options.projectId) {
    args.push("--project", options.projectId);
  }
  if (options.task) {
    args.push("--task", options.task);
  }
  if (options.workerCommand) {
    args.push("--worker-command", options.workerCommand);
  }

  return `
${workspaceRootPrelude(options.workspaceRoot)}
env_file="$root/config/vampyre.env"
cli="$root/app/dist/cli.js"
if [ ! -f "$cli" ]; then
  printf 'remote-app-missing:%s\\n' "$cli"
  exit 2
fi
if [ ! -f "$env_file" ]; then
  printf 'env-missing\\n'
  exit 3
fi
set -a
. "$env_file"
set +a
node "$cli" ${args.map((arg) => (arg === "$root" ? '"$root"' : shellQuote(arg))).join(" ")}
`;
}

type BuildTargetResult =
  | {
      ok: true;
      value: BuildTarget;
    }
  | {
      ok: false;
      blocker: string;
    };

function selectBuildTarget(
  state: OperationalStateReport,
  schedulerTick: SchedulerTickRecord,
  requestedProjectId: string | undefined,
): BuildTargetResult {
  const projectId = requestedProjectId ?? schedulerTick.selectedProjectId;
  if (!projectId) {
    return {
      ok: false,
      blocker: "Scheduler: no project selected for a Worktree Build Agent run",
    };
  }

  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    return {
      ok: false,
      blocker: `Project Registry: project ${projectId} is missing`,
    };
  }

  if (!project.githubRepo) {
    return {
      ok: false,
      blocker: `Project ${project.displayName}: no GitHub repository is configured`,
    };
  }

  const decision =
    schedulerTick.decisions.find((candidate) => candidate.projectId === project.id) ??
    ({
      projectId: project.id,
      displayName: project.displayName,
      decision: requestedProjectId ? "selected" : "deferred",
      reason: requestedProjectId ? "operator-requested" : "missing-scheduler-decision",
    } satisfies SchedulerDecisionRecord);

  return {
    ok: true,
    value: {
      project: {
        ...project,
        githubRepo: project.githubRepo,
      },
      decision,
    },
  };
}

async function ensureRuntimeRepo(options: {
  repo: string;
  repoPath: string;
  token: string;
  commandRunner: BuildAgentCommandRunner;
}): Promise<{ proof: string[] }> {
  await mkdir(dirname(options.repoPath), { recursive: true });
  const gitDirExists = await pathExists(join(options.repoPath, ".git"));
  const authArgs = gitAuthArgs(options.token);
  const redactions = gitAuthRedactions(options.token);

  if (!gitDirExists) {
    const clone = await options.commandRunner({
      command: "git",
      args: [...authArgs, "clone", `https://github.com/${options.repo}.git`, options.repoPath],
    });
    if (clone.exitCode !== 0) {
      throw new BuildAgentFailure("missing-secret-or-access", `Git clone: ${sanitizeOutput(errorSummary(clone), redactions)}`);
    }
    return {
      proof: [`Cloned ${options.repo} into runtime workspace path ${options.repoPath}`],
    };
  }

  const fetch = await options.commandRunner({
    command: "git",
    args: [...authArgs, "-C", options.repoPath, "fetch", "--prune", "origin"],
  });
  if (fetch.exitCode !== 0) {
    throw new BuildAgentFailure("missing-secret-or-access", `Git fetch: ${sanitizeOutput(errorSummary(fetch), redactions)}`);
  }
  return {
    proof: [`Fetched existing runtime workspace clone at ${options.repoPath}`],
  };
}

async function createWorktree(options: {
  workspaceRoot: string;
  projectId: string;
  repoPath: string;
  branch: string;
  commandRunner: BuildAgentCommandRunner;
}): Promise<BuildAgentWorktreeSummary> {
  const worktreePath = workspacePath(options.workspaceRoot, "worktrees", `${options.projectId}-${branchLeaf(options.branch)}`);
  const baseRef = "origin/main";
  await mkdir(dirname(worktreePath), { recursive: true });
  await rm(worktreePath, { recursive: true, force: true });

  const result = await options.commandRunner({
    command: "git",
    args: ["-C", options.repoPath, "worktree", "add", "-b", options.branch, worktreePath, baseRef],
  });
  if (result.exitCode !== 0) {
    const classification = errorSummary(result).toLowerCase().includes("conflict") ? "merge-conflict" : "agent-error";
    throw new BuildAgentFailure(classification, `Git worktree add: ${errorSummary(result)}`);
  }

  return {
    repoPath: options.repoPath,
    worktreePath,
    branch: options.branch,
    baseRef,
    cleanup: "not-started",
  };
}

interface BuildAgentValidationPlan {
  source: "project-registry" | "watcher-discovery";
  commands: string[];
}

async function resolveValidationPlan(options: {
  workspaceRoot: string;
  project: ProjectRuntimeStatus & { githubRepo: string };
}): Promise<BuildAgentValidationPlan> {
  const registryCommands = normalizedCommands(options.project.validationCommands ?? []);
  if (registryCommands.length > 0) {
    return {
      source: "project-registry",
      commands: registryCommands,
    };
  }

  const discoveryCommands = await readWatcherDiscoveryValidationCommands(options.workspaceRoot, options.project.id);
  if (discoveryCommands.length > 0) {
    return {
      source: "watcher-discovery",
      commands: discoveryCommands,
    };
  }

  throw new BuildAgentFailure(
    "validation-failure",
    `No validation commands configured for ${options.project.displayName}; run watcher discovery or set validationCommands in the Project Registry`,
  );
}

async function readWatcherDiscoveryValidationCommands(workspaceRoot: string, projectId: string): Promise<string[]> {
  const reportPath = workspacePath(workspaceRoot, "reports", "watcher-discovery", projectId, "latest.json");

  try {
    const parsed = JSON.parse(await readFile(reportPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }

    const validation = (parsed as Record<string, unknown>)["validation"];
    if (!validation || typeof validation !== "object" || Array.isArray(validation)) {
      return [];
    }

    const commands = (validation as Record<string, unknown>)["commands"];
    return Array.isArray(commands) ? normalizedCommands(commands) : [];
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw new BuildAgentFailure(
      "validation-failure",
      `Watcher discovery validation report could not be read for ${projectId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function normalizedCommands(commands: unknown[]): string[] {
  return commands
    .filter((command): command is string => typeof command === "string")
    .map((command) => command.trim())
    .filter((command) => command.length > 0);
}

async function runConfiguredValidation(options: {
  worktreePath: string;
  commands: string[];
  source: BuildAgentValidationPlan["source"];
  bundlePath: string;
  commandRunner: BuildAgentCommandRunner;
  redactions: string[];
}): Promise<BuildAgentValidationSummary> {
  const results: BuildAgentValidationCommandSummary[] = [];

  for (const command of options.commands) {
    const result = await options.commandRunner({
      command: "sh",
      args: ["-lc", validationShellCommand(command, options.bundlePath)],
      cwd: options.worktreePath,
    });
    const stdoutSummary = summarizeCommandOutput(sanitizeOutput(result.stdout, options.redactions));
    const stderrSummary = summarizeCommandOutput(sanitizeOutput(result.stderr, options.redactions));
    const step: BuildAgentValidationCommandSummary = {
      kind: "configured-validation",
      command,
      exitCode: result.exitCode,
      summary:
        result.exitCode === 0
          ? `validation passed: ${command}`
          : `validation failed: ${command}: ${stderrSummary || stdoutSummary || "command failed"}`,
    };

    if (stdoutSummary) {
      step.stdoutSummary = stdoutSummary;
    }
    if (stderrSummary) {
      step.stderrSummary = stderrSummary;
    }

    results.push(step);

    if (result.exitCode !== 0) {
      break;
    }
  }

  return {
    source: options.source,
    status: results.some((result) => result.exitCode !== 0) ? "failed" : "passed",
    commands: results,
  };
}

function validationShellCommand(command: string, bundlePath: string): string {
  return [
    'for dir in "$HOME"/.local/bin "$HOME"/.local/share/gem/ruby/*/bin; do',
    '  [ -d "$dir" ] && PATH="$dir:$PATH";',
    "done;",
    `bundle_path=${shellQuote(bundlePath)};`,
    '[ -d "$bundle_path" ] && export BUNDLE_PATH="$bundle_path";',
    "export PATH;",
    command,
  ].join(" ");
}

async function cleanupWorktree(options: {
  repoPath: string;
  worktree: BuildAgentWorktreeSummary;
  commandRunner: BuildAgentCommandRunner;
}): Promise<void> {
  const remove = await options.commandRunner({
    command: "git",
    args: ["-C", options.repoPath, "worktree", "remove", "--force", options.worktree.worktreePath],
  });
  if (remove.exitCode !== 0) {
    throw new BuildAgentFailure("agent-error", `Git worktree remove: ${errorSummary(remove)}`);
  }

  const deleteBranch = await options.commandRunner({
    command: "git",
    args: ["-C", options.repoPath, "branch", "-D", options.worktree.branch],
  });
  if (deleteBranch.exitCode !== 0) {
    throw new BuildAgentFailure("agent-error", `Git branch cleanup: ${errorSummary(deleteBranch)}`);
  }
}

async function cleanupSuccessfulWorktreeAndResolveValidationBlockers(options: {
  state: OperationalStateReport;
  projectId: string;
  worktree: BuildAgentWorktreeSummary;
  repoPath: string;
  commandRunner: BuildAgentCommandRunner;
  now: string;
  report: BuildAgentRunReport;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  await cleanupWorktree({
    repoPath: options.repoPath,
    worktree: options.worktree,
    commandRunner: options.commandRunner,
  });
  options.worktree.cleanup = "removed";
  options.report.proof.push(`Removed successful worker worktree ${options.worktree.worktreePath}`);

  try {
    const resolvedBlockers = await resolveProjectBlockers(options.state.databasePath, {
      projectId: options.projectId,
      summary: "Build Agent validation-failure",
      now: options.now,
    });
    if (resolvedBlockers > 0) {
      options.report.proof.push(`Resolved ${resolvedBlockers} prior validation blocker(s) for ${options.projectId}`);
    }
  } catch (error) {
    options.report.blockers.push(
      `agent-error: ${sanitizeError(error instanceof Error ? error.message : String(error), options.env)}`,
    );
  }
}

async function writeTaskContext(options: {
  workspaceRoot: string;
  project: ProjectRuntimeStatus & { githubRepo: string };
  runId: string;
  worktree: BuildAgentWorktreeSummary;
  task: string;
  validationPlan: BuildAgentValidationPlan;
}): Promise<BuildAgentTaskContextSummary> {
  const reportDir = workspacePath(options.workspaceRoot, "reports", "build-agent", options.project.id);
  const contextPath = join(reportDir, `${options.runId}-task-context.md`);
  await mkdir(reportDir, { recursive: true });
  await writeFile(contextPath, `${taskContextMarkdown(options)}\n`);
  return {
    path: contextPath,
    task: options.task,
  };
}

function taskContextMarkdown(options: {
  project: ProjectRuntimeStatus & { githubRepo: string };
  runId: string;
  worktree: BuildAgentWorktreeSummary;
  task: string;
  validationPlan: BuildAgentValidationPlan;
}): string {
  return [
    `# Active Build Agent Task: ${options.project.displayName}`,
    "",
    `- Run Journal: ${options.runId}`,
    `- Project: ${options.project.displayName} (${options.project.id})`,
    `- Mode: ${options.project.modeLabel}`,
    `- GitHub Repository: ${options.project.githubRepo}`,
    `- Worktree: ${options.worktree.worktreePath}`,
    `- Branch: ${options.worktree.branch}`,
    `- Base: ${options.worktree.baseRef}`,
    "",
    "## Task",
    options.task,
    "",
    "## Guardrails",
    "- Work only inside the provided worktree.",
    "- Do not merge, push, or create pull requests yourself.",
    outputGuardrail(options.project),
    ...productLoopGuardrails(options.project),
    "- Do not print, persist, or request secret values.",
    "",
    "## Validation Commands",
    `- Source: ${options.validationPlan.source}`,
    ...options.validationPlan.commands.map((command) => `- ${command}`),
  ].join("\n");
}

interface BuildAgentWorkerPlan {
  command: string;
}

function resolveWorkerPlan(options: BuildAgentRunOptions, env: NodeJS.ProcessEnv): BuildAgentWorkerPlan | undefined {
  const command = (options.workerCommand ?? envValue(env, "VAMPYRE_AGENT_COMMAND"))?.trim();
  if (!command) {
    return undefined;
  }

  return { command };
}

async function resolveWorkerTask(fields: {
  options: BuildAgentRunOptions;
  env: NodeJS.ProcessEnv;
  project: ProjectRuntimeStatus;
  worktreePath: string;
}): Promise<string> {
  const task = (fields.options.task ?? envValue(fields.env, "VAMPYRE_AGENT_TASK"))?.trim();
  if (task) {
    return task;
  }

  if (usesDirectMainOutput(fields.project)) {
    const statusTask = await readStatusNextAction(fields.worktreePath);
    if (statusTask) {
      return statusTask;
    }
  }

  const autoSafeTask = fields.project.autoSafeTasks?.find((candidate) => candidate.trim().length > 0)?.trim();
  if (autoSafeTask) {
    return autoSafeTask;
  }

  return "No project-changing task is configured. Inspect the task context, report no-change findings, and do not edit files.";
}

async function readStatusNextAction(worktreePath: string): Promise<string | undefined> {
  try {
    const statusMarkdown = await readFile(join(worktreePath, "docs", "STATUS.md"), "utf8");
    return extractStatusNextAction(statusMarkdown);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

function extractStatusNextAction(markdown: string): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^##\s+Next action\s*$/i.test(line.trim()));
  if (headingIndex === -1) {
    return undefined;
  }

  const body: string[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (/^##\s+/.test(line.trim())) {
      break;
    }
    const normalized = line.trim().replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
    if (normalized.length > 0) {
      body.push(normalized);
    }
  }

  return body.length > 0 ? body.join(" ") : undefined;
}

function outputGuardrail(project: ProjectRuntimeStatus): string {
  if (usesDirectMainOutput(project)) {
    return "- Vampyre will run validation, commit useful changes, push directly to main under the approved product loop, and update the GitHub run issue.";
  }

  return "- Vampyre will run validation, commit useful changes, push the branch, and open or update the Owner-reviewed PR.";
}

function productLoopGuardrails(project: ProjectRuntimeStatus): string[] {
  if (!usesDirectMainOutput(project)) {
    return [];
  }

  return [
    "- Keep docs/STATUS.md handoff-ready with the latest proof and one exact next product action.",
    "- If this Linux runtime cannot run native platform validation, record that limitation, but do not make Mac validation the only next action unless product-changing work is blocked.",
    "- Do not load or use scwlkr-context, context.scwlkr.com, context-inbox, or other retired global context sources; rely on repo-local docs and the task context, and report ambiguity instead.",
  ];
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function runWorkerLaunch(options: {
  workspaceRoot: string;
  projectId: string;
  runId: string;
  worktree: BuildAgentWorktreeSummary;
  taskContext: BuildAgentTaskContextSummary;
  command: string;
  commandRunner: BuildAgentCommandRunner;
  env: NodeJS.ProcessEnv;
}): Promise<BuildAgentWorkerLaunchSummary> {
  const reportDir = workspacePath(options.workspaceRoot, "reports", "build-agent", options.projectId);
  const stdoutPath = join(reportDir, `${options.runId}-worker.stdout.log`);
  const stderrPath = join(reportDir, `${options.runId}-worker.stderr.log`);
  await mkdir(reportDir, { recursive: true });

  const result = await options.commandRunner({
    command: "sh",
    args: ["-lc", options.command],
    cwd: options.worktree.worktreePath,
    env: workerEnvironment(options.env, {
      projectId: options.projectId,
      runId: options.runId,
      worktreePath: options.worktree.worktreePath,
      branch: options.worktree.branch,
      taskContextPath: options.taskContext.path,
      reportDir,
    }),
  });
  const redactions = secretRedactions(options.env);
  const stdout = sanitizeOutput(result.stdout, redactions);
  const stderr = sanitizeOutput(result.stderr, redactions);
  await writeFile(stdoutPath, stdout.length > 0 ? `${stdout}\n` : "");
  await writeFile(stderrPath, stderr.length > 0 ? `${stderr}\n` : "");

  const stdoutSummary = summarizeCommandOutput(stdout);
  const stderrSummary = summarizeCommandOutput(stderr);
  const failedStatus = classifyWorkerExit(result);
  const summary =
    result.exitCode === 0
      ? "Active Build Agent worker command completed"
      : `${failedStatus === "context-exhausted" ? "Active Build Agent context exhausted" : "Active Build Agent command failed"}: ${
          stderrSummary || stdoutSummary || "command failed"
        }`;

  const worker: BuildAgentWorkerLaunchSummary = {
    status: result.exitCode === 0 ? "completed" : failedStatus,
    command: options.command,
    exitCode: result.exitCode,
    summary,
    stdoutPath,
    stderrPath,
  };
  if (stdoutSummary) {
    worker.stdoutSummary = stdoutSummary;
  }
  if (stderrSummary) {
    worker.stderrSummary = stderrSummary;
  }
  return worker;
}

function workerEnvironment(
  env: NodeJS.ProcessEnv,
  context: {
    projectId: string;
    runId: string;
    worktreePath: string;
    branch: string;
    taskContextPath: string;
    reportDir: string;
  },
): NodeJS.ProcessEnv {
  const workerEnv: NodeJS.ProcessEnv = {};
  for (const key of ["HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM"]) {
    const value = env[key];
    if (value) {
      workerEnv[key] = value;
    }
  }
  if (!workerEnv["PATH"]) {
    workerEnv["PATH"] = "/usr/local/bin:/usr/bin:/bin";
  }
  workerEnv["VAMPYRE_PROJECT_ID"] = context.projectId;
  workerEnv["VAMPYRE_RUN_JOURNAL_ID"] = context.runId;
  workerEnv["VAMPYRE_WORKTREE_PATH"] = context.worktreePath;
  workerEnv["VAMPYRE_BRANCH"] = context.branch;
  workerEnv["VAMPYRE_TASK_CONTEXT_PATH"] = context.taskContextPath;
  workerEnv["VAMPYRE_REPORT_DIR"] = context.reportDir;
  return workerEnv;
}

function classifyWorkerExit(result: BuildAgentCommandResult): BuildAgentWorkerLaunchSummary["status"] {
  const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
  if (
    output.includes("context exhausted") ||
    output.includes("context length") ||
    output.includes("maximum context") ||
    output.includes("token limit")
  ) {
    return "context-exhausted";
  }
  return "failed";
}

async function readWorktreeChangedFiles(options: {
  worktreePath: string;
  commandRunner: BuildAgentCommandRunner;
}): Promise<string[]> {
  const status = await options.commandRunner({
    command: "git",
    args: ["-C", options.worktreePath, "status", "--porcelain"],
  });
  if (status.exitCode !== 0) {
    throw new BuildAgentFailure("agent-error", `Git status: ${errorSummary(status)}`);
  }

  return status.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(porcelainPath)
    .filter((line) => line.length > 0);
}

function porcelainPath(line: string): string {
  const match = line.match(/^(?:[ MADRCU?!]{2}\s+|[A-Z?]\s+)(.+)$/);
  return (match?.[1] ?? line).trim();
}

async function commitAndPushWorktreeChanges(options: {
  project: ProjectRuntimeStatus & { githubRepo: string };
  worktree: BuildAgentWorktreeSummary;
  changedFiles: string[];
  token: string;
  commandRunner: BuildAgentCommandRunner;
}): Promise<BuildAgentBranchOutputSummary> {
  const output = await commitWorktreeChanges({
    project: options.project,
    worktree: options.worktree,
    changedFiles: options.changedFiles,
    commandRunner: options.commandRunner,
  });

  return pushWorktreeBranch({
    previousOutput: output,
    worktree: options.worktree,
    token: options.token,
    commandRunner: options.commandRunner,
  });
}

async function commitWorktreeChanges(options: {
  project: ProjectRuntimeStatus & { githubRepo: string };
  worktree: BuildAgentWorktreeSummary;
  changedFiles: string[];
  commandRunner: BuildAgentCommandRunner;
}): Promise<BuildAgentBranchOutputSummary> {
  const add = await options.commandRunner({
    command: "git",
    args: ["-C", options.worktree.worktreePath, "add", "-A"],
  });
  if (add.exitCode !== 0) {
    throw new BuildAgentFailure("agent-error", `Git add: ${errorSummary(add)}`);
  }

  const diff = await options.commandRunner({
    command: "git",
    args: ["-C", options.worktree.worktreePath, "diff", "--cached", "--quiet"],
  });
  if (diff.exitCode === 0) {
    return {
      status: "no-changes",
      branch: options.worktree.branch,
      changedFiles: [],
    };
  }
  if (diff.exitCode !== 1) {
    throw new BuildAgentFailure("agent-error", `Git diff: ${errorSummary(diff)}`);
  }

  const commit = await options.commandRunner({
    command: "git",
    args: [
      "-c",
      "user.name=Vampyre",
      "-c",
      "user.email=vampyre@users.noreply.github.com",
      "-C",
      options.worktree.worktreePath,
      "commit",
      "-m",
      `Vampyre work for ${options.project.displayName}`,
    ],
  });
  if (commit.exitCode !== 0) {
    throw new BuildAgentFailure("agent-error", `Git commit: ${errorSummary(commit)}`);
  }

  const revParse = await options.commandRunner({
    command: "git",
    args: ["-C", options.worktree.worktreePath, "rev-parse", "--short", "HEAD"],
  });
  if (revParse.exitCode !== 0) {
    throw new BuildAgentFailure("agent-error", `Git rev-parse: ${errorSummary(revParse)}`);
  }

  return {
    status: "committed",
    branch: options.worktree.branch,
    changedFiles: options.changedFiles,
    commit: revParse.stdout.trim(),
  };
}

async function pushWorktreeBranch(options: {
  previousOutput: BuildAgentBranchOutputSummary;
  worktree: BuildAgentWorktreeSummary;
  token: string;
  commandRunner: BuildAgentCommandRunner;
}): Promise<BuildAgentBranchOutputSummary> {
  const push = await options.commandRunner({
    command: "git",
    args: [...gitAuthArgs(options.token), "-C", options.worktree.worktreePath, "push", "-u", "origin", options.worktree.branch],
  });
  if (push.exitCode !== 0) {
    throw new BuildAgentFailure(
      "missing-secret-or-access",
      `Git push: ${sanitizeOutput(errorSummary(push), gitAuthRedactions(options.token))}`,
    );
  }

  return {
    ...options.previousOutput,
    status: "pushed",
  };
}

async function pushWorktreeHeadToMain(options: {
  previousOutput: BuildAgentBranchOutputSummary;
  worktree: BuildAgentWorktreeSummary;
  token: string;
  commandRunner: BuildAgentCommandRunner;
}): Promise<BuildAgentBranchOutputSummary> {
  const push = await options.commandRunner({
    command: "git",
    args: [...gitAuthArgs(options.token), "-C", options.worktree.worktreePath, "push", "origin", "HEAD:main"],
  });
  if (push.exitCode !== 0) {
    throw new BuildAgentFailure(
      "missing-secret-or-access",
      `Git push main: ${sanitizeOutput(errorSummary(push), gitAuthRedactions(options.token))}`,
    );
  }

  return {
    ...options.previousOutput,
    status: "pushed-main",
  };
}

async function upsertBuildAgentPullRequest(options: {
  project: ProjectRuntimeStatus & { githubRepo: string };
  report: BuildAgentRunReport;
  draft: boolean;
  githubClient?: GitHubClient | undefined;
  githubFetch?: GitHubFetch | undefined;
  env: NodeJS.ProcessEnv;
}): Promise<BuildAgentPullRequestSummary> {
  let githubClient = options.githubClient;
  if (!githubClient) {
    const token = envValue(options.env, "GITHUB_TOKEN");
    if (!token) {
      throw new BuildAgentFailure("missing-secret-or-access", "GITHUB_TOKEN is missing");
    }

    githubClient = createGitHubClient({
      token,
      fetchImpl: options.githubFetch,
    });
  }

  const branch = options.report.worktree?.branch;
  if (!branch) {
    throw new BuildAgentFailure("agent-error", "Cannot create PR without a Build Agent branch");
  }

  const title = `Vampyre work for ${options.project.displayName}`;
  const body = buildAgentPullRequestBody(options.report, options.draft);
  const existing = await findOpenGitHubPullRequestForBranch(githubClient, {
    repo: options.project.githubRepo,
    head: branch,
    base: "main",
  });
  const pull = existing
    ? await updateGitHubPullRequest(githubClient, {
        repo: options.project.githubRepo,
        pullNumber: existing.number,
        title,
        body,
        base: "main",
      })
    : await createGitHubPullRequest(githubClient, {
        repo: options.project.githubRepo,
        title,
        head: branch,
        base: "main",
        body,
        draft: options.draft,
      });

  return {
    repo: options.project.githubRepo,
    head: branch,
    base: "main",
    title,
    action: existing ? "updated" : "created",
    number: pull.number,
    url: pull.url,
    draft: options.draft,
  };
}

function buildAgentPullRequestBody(report: BuildAgentRunReport, draft: boolean): string {
  return [
    "Vampyre created this branch from an isolated Worktree Build Agent run.",
    "",
    `Run Journal: ${report.runJournal?.id ?? "unknown"}`,
    `Task Context: ${report.taskContext?.path ?? "unknown"}`,
    `Worker Status: ${report.worker?.status ?? "not-run"}`,
    `Validation Status: ${report.validation?.status ?? "not-run"}`,
    `Review Mode: ${draft ? "Draft PR because final validation did not pass" : "Owner-reviewed PR; Vampyre will not merge it"}`,
    "",
    "Changed files:",
    ...(report.branchOutput?.changedFiles.length
      ? report.branchOutput.changedFiles.map((file) => `- ${file}`)
      : ["- none recorded"]),
    "",
    "Proof:",
    ...report.proof.map((proof) => `- ${proof}`),
    ...(report.reportPaths
      ? ["", "Run Journal files:", `- ${report.reportPaths.markdown}`, `- ${report.reportPaths.json}`]
      : []),
  ].join("\n");
}

async function surfaceBuildAgentOutcome(options: {
  report: BuildAgentRunReport;
  env: NodeJS.ProcessEnv;
  githubClient?: GitHubClient | undefined;
  githubFetch?: GitHubFetch | undefined;
  telegramFetch?: TelegramFetch | undefined;
}): Promise<void> {
  const project = options.report.project;
  if (!project) {
    return;
  }

  let githubClient = options.githubClient;
  const token = envValue(options.env, "GITHUB_TOKEN");
  if (!githubClient) {
    if (!token) {
      options.report.blockers.push("GitHub: GITHUB_TOKEN is missing");
      return;
    }

    githubClient = createGitHubClient({
      token,
      fetchImpl: options.githubFetch,
    });
  }

  const label = await ensureGitHubLabel(githubClient, {
    repo: project.githubRepo,
    name: BUILD_AGENT_LABEL,
    color: BUILD_AGENT_LABEL_COLOR,
    description: BUILD_AGENT_LABEL_DESCRIPTION,
  });
  const title = buildAgentIssueTitle(project);
  const existingIssue = await findOpenGitHubIssueByTitle(githubClient, {
    repo: project.githubRepo,
    title,
    label: BUILD_AGENT_LABEL,
  });
  const issue =
    existingIssue ??
    (await createGitHubIssue(githubClient, {
      repo: project.githubRepo,
      title,
      body: buildAgentIssueBody(project, options.report),
      labels: [BUILD_AGENT_LABEL],
    }));
  const comment = await createGitHubIssueComment(githubClient, {
    repo: project.githubRepo,
    issueNumber: issue.number,
    body: buildAgentCommentBody(options.report),
  });

  options.report.github = {
    repo: project.githubRepo,
    labelName: label.name,
    labelAction: label.action,
    issueNumber: issue.number,
    issueUrl: issue.url,
    issueAction: existingIssue ? "reused" : "created",
    commentUrl: comment.url,
  };

  const telegramToken = envValue(options.env, "TELEGRAM_BOT_TOKEN");
  const telegramChatId = envValue(options.env, "TELEGRAM_CHAT_ID");
  if (!telegramToken || !telegramChatId) {
    options.report.telegram = {
      status: "failed",
      summary: "Telegram config is missing",
    };
    options.report.blockers.push("Telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing");
    return;
  }

  try {
    const message = await sendTelegramMessage({
      token: telegramToken,
      chatId: telegramChatId,
      text: telegramBuildAgentMessage(options.report),
      fetchImpl: options.telegramFetch,
    });
    options.report.telegram = {
      status: "sent",
      summary: "Telegram notification sent with GitHub run link",
      messageId: message.messageId,
    };
  } catch (error) {
    const summary = sanitizeError(error instanceof Error ? error.message : String(error), options.env);
    options.report.telegram = {
      status: "failed",
      summary,
    };
    options.report.blockers.push(`Telegram: ${summary}`);
  }
}

async function finalizeRunJournal(options: {
  databasePath: string;
  workspaceRoot: string;
  projectId: string;
  report: BuildAgentRunReport;
  status: RunJournalStatus;
  summary: string;
  now: string;
}): Promise<void> {
  if (!options.report.runJournal) {
    return;
  }

  options.report.completedAt = options.now;
  options.report.runJournal.status = options.status;
  options.report.runJournal.summary = options.summary;
  options.report.reportPaths = await writeRunReports(options.workspaceRoot, options.projectId, options.report);

  await updateRunJournal(options.databasePath, {
    id: options.report.runJournal.id,
    phase: AGENT_PHASE,
    status: options.status,
    summary: options.summary,
    journalJson: JSON.stringify(options.report),
    now: options.now,
  });
}

async function writeRunReports(
  workspaceRoot: string,
  projectId: string,
  report: BuildAgentRunReport,
): Promise<BuildAgentReportPaths> {
  const runId = report.runJournal?.id ?? "unknown-run";
  const reportDir = workspacePath(workspaceRoot, "reports", "build-agent", projectId);
  const jsonPath = join(reportDir, `${runId}.json`);
  const markdownPath = join(reportDir, `${runId}.md`);
  await mkdir(reportDir, { recursive: true });
  const paths = {
    markdown: markdownPath,
    json: jsonPath,
  };
  report.reportPaths = paths;
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, `${formatBuildAgentMarkdown(report)}\n`);
  return paths;
}

function formatBuildAgentMarkdown(report: BuildAgentRunReport): string {
  const lines = [`# Build Agent Run: ${report.project?.displayName ?? "Unknown Project"}`, ""];
  lines.push(`- Run Journal: ${report.runJournal?.id ?? "unknown"}`);
  lines.push(`- Status: ${report.runJournal?.status ?? "unknown"}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Completed: ${report.completedAt ?? "unknown"}`);
  if (report.project) {
    lines.push(`- Project: ${report.project.displayName} (${report.project.id})`);
    lines.push(`- GitHub: ${report.project.githubRepo}`);
  }
  if (report.worktree) {
    lines.push(`- Worktree: ${report.worktree.worktreePath}`);
    lines.push(`- Branch: ${report.worktree.branch}`);
    lines.push(`- Cleanup: ${report.worktree.cleanup}`);
  }
  if (report.taskContext) {
    lines.push(`- Task Context: ${report.taskContext.path}`);
  }
  if (report.worker) {
    lines.push(`- Worker Status: ${report.worker.status}`);
    lines.push(`- Worker Summary: ${report.worker.summary}`);
    if (report.worker.stdoutPath) {
      lines.push(`- Worker Stdout: ${report.worker.stdoutPath}`);
    }
    if (report.worker.stderrPath) {
      lines.push(`- Worker Stderr: ${report.worker.stderrPath}`);
    }
  }
  if (report.branchOutput) {
    lines.push(`- Branch Output: ${report.branchOutput.status}`);
    if (report.branchOutput.changedFiles.length > 0) {
      for (const file of report.branchOutput.changedFiles) {
        lines.push(`  - Changed: ${file}`);
      }
    }
  }
  if (report.workerStep) {
    lines.push(`- Validation Source: ${report.validation?.source ?? "unknown"}`);
    lines.push(`- Validation Status: ${report.validation?.status ?? "unknown"}`);
    for (const command of report.validation?.commands ?? [report.workerStep]) {
      lines.push(`- Validation Command: ${command.command}`);
      lines.push(`  - Exit Code: ${command.exitCode}`);
      lines.push(`  - Summary: ${command.summary}`);
    }
  }
  if (report.pullRequest) {
    lines.push(`- Pull Request: ${report.pullRequest.url}`);
    lines.push(`- Pull Request Draft: ${report.pullRequest.draft ? "yes" : "no"}`);
  }
  if (report.github) {
    lines.push(`- GitHub Comment: ${report.github.commentUrl}`);
  }
  if (report.telegram) {
    lines.push(`- Telegram: ${report.telegram.status}`);
  }
  lines.push("");
  lines.push("## Proof");
  for (const proof of report.proof) {
    lines.push(`- ${proof}`);
  }
  if (report.blockers.length > 0) {
    lines.push("");
    lines.push("## Blockers");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }
  return lines.join("\n");
}

function projectSummary(project: ProjectRuntimeStatus & { githubRepo: string }): BuildAgentProjectSummary {
  return {
    id: project.id,
    displayName: project.displayName,
    mode: project.modeLabel,
    githubRepo: project.githubRepo,
  };
}

function schedulerSummary(
  schedulerTick: SchedulerTickRecord,
  decision: SchedulerDecisionRecord,
): BuildAgentSchedulerSummary {
  return {
    tickedAt: schedulerTick.tickedAt,
    budget: `${schedulerTick.budgetProvider}/${schedulerTick.budgetMode}`,
    selectedProjectId: schedulerTick.selectedProjectId ?? decision.projectId,
    decisionReason: `${decision.decision}:${decision.reason}`,
  };
}

function buildAgentIssueTitle(project: BuildAgentProjectSummary): string {
  return `Vampyre review: ${project.displayName}`;
}

function buildAgentIssueBody(project: BuildAgentProjectSummary, report: BuildAgentRunReport): string {
  return [
    "Vampyre records scheduler-selected Worktree Build Agent outcomes here.",
    "",
    `- Project: ${project.displayName} (${project.id})`,
    `- Mode: ${project.mode}`,
    `- Latest Run Journal: ${report.runJournal?.id ?? "unknown"}`,
    "",
    "This GitHub issue is the durable review record. Telegram notifications may link here, but Telegram is not the approval ledger.",
  ].join("\n");
}

function buildAgentCommentBody(report: BuildAgentRunReport): string {
  return [
    `Worktree Build Agent run ${report.runJournal?.id ?? "unknown"} ${report.blockers.length === 0 ? "completed" : "needs follow-up"}.`,
    "",
    `Project: ${report.project ? `${report.project.displayName} (${report.project.id})` : "unknown"}`,
    `Status: ${report.blockers.length === 0 ? "completed" : "blocked"}`,
    `Started: ${report.startedAt}`,
    `Completed: ${report.completedAt ?? "pending"}`,
    `Scheduler: ${report.scheduler?.budget ?? "unknown"}; ${report.scheduler?.decisionReason ?? "unknown"}`,
    `Worktree: ${report.worktree?.worktreePath ?? "not-created"}`,
    `Task Context: ${report.taskContext?.path ?? "not-written"}`,
    `Worker Status: ${report.worker?.status ?? "not-run"}`,
    `Worker Result: ${report.worker?.summary ?? "not-run"}`,
    `Branch Output: ${report.branchOutput?.status ?? "not-run"}`,
    `Pull Request: ${report.pullRequest?.url ?? "not-created"}`,
    `Validation Source: ${report.validation?.source ?? "not-run"}`,
    `Validation Status: ${report.validation?.status ?? "not-run"}`,
    `Validation Step: ${report.workerStep?.command ?? "not-run"}`,
    `Validation Result: ${report.workerStep?.summary ?? "not-run"}`,
    "",
    "Proof:",
    ...report.proof.map((proof) => `- ${proof}`),
    ...(report.reportPaths
      ? ["", "Run Journal files:", `- ${report.reportPaths.markdown}`, `- ${report.reportPaths.json}`]
      : []),
    ...(report.blockers.length > 0 ? ["", "Blockers:", ...report.blockers.map((blocker) => `- ${blocker}`)] : []),
  ].join("\n");
}

function telegramBuildAgentMessage(report: BuildAgentRunReport): string {
  return [
    report.blockers.length === 0 ? "Vampyre build-agent run completed" : "Vampyre build-agent run needs follow-up",
    `Project: ${report.project?.displayName ?? "unknown"}`,
    `Run Journal: ${report.runJournal?.id ?? "unknown"}`,
    ...(report.pullRequest ? [`PR: ${report.pullRequest.url}`] : []),
    `GitHub: ${report.github?.commentUrl ?? report.github?.issueUrl ?? "unknown"}`,
    "Telegram is notification-only. Review stays in GitHub.",
  ].join("\n");
}

async function sendTelegramMessage(options: {
  token: string;
  chatId: string;
  text: string;
  fetchImpl?: TelegramFetch | undefined;
}): Promise<TelegramMessageResult> {
  const fetchImpl = options.fetchImpl ?? defaultTelegramFetch();
  const response = await fetchImpl(`https://api.telegram.org/bot${options.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: options.chatId,
      text: options.text,
      disable_web_page_preview: true,
    }),
  });
  const body = await parseTelegramResponseBody(response);

  if (!response.ok || !isTelegramOk(body)) {
    const description = telegramDescription(body) ?? response.statusText;
    throw new Error(`Telegram sendMessage failed with HTTP ${response.status}: ${description}`);
  }

  return {
    messageId: telegramMessageId(body),
  };
}

function parseRemoteBuildAgentReport(
  stdout: string,
):
  | {
      ok: true;
      value: BuildAgentRunReport;
    }
  | {
      ok: false;
      message?: string | undefined;
    } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { ok: false };
  }

  try {
    const parsed = JSON.parse(trimmed) as BuildAgentRunReport;
    if (!parsed || typeof parsed !== "object" || !("ready" in parsed)) {
      return {
        ok: false,
        message: "remote build-agent JSON had an unexpected shape",
      };
    }
    return {
      ok: true,
      value: parsed,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runLocalCommand(spec: BuildAgentCommandSpec): Promise<BuildAgentCommandResult> {
  return new Promise<BuildAgentCommandResult>((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

class BuildAgentFailure extends Error {
  constructor(
    readonly classification: BuildAgentFailureClassification,
    message: string,
  ) {
    super(message);
    this.name = "BuildAgentFailure";
  }
}

function buildAgentFailure(error: unknown): BuildAgentFailure {
  if (error instanceof BuildAgentFailure) {
    return error;
  }

  return new BuildAgentFailure("agent-error", error instanceof Error ? error.message : String(error));
}

function runJournalId(projectId: string, iso: string): string {
  return `run-${timestampSlug(iso)}-${projectId}`;
}

function runBranchName(projectId: string, iso: string): string {
  return `vampyre/build-agent/${projectId}/${timestampSlug(iso)}`;
}

function timestampSlug(iso: string): string {
  return iso.replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

function branchLeaf(branch: string): string {
  return branch.split("/").filter(Boolean).at(-1) ?? "worktree";
}

function gitAuthArgs(token: string): string[] {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return ["-c", `http.extraHeader=AUTHORIZATION: basic ${basic}`];
}

function gitAuthRedactions(token: string): string[] {
  return [token, Buffer.from(`x-access-token:${token}`).toString("base64")];
}

function secretRedactions(env: NodeJS.ProcessEnv): string[] {
  const redactions: string[] = [];
  for (const key of ["GITHUB_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    const value = envValue(env, key);
    if (value) {
      redactions.push(value);
      if (key === "GITHUB_TOKEN") {
        redactions.push(Buffer.from(`x-access-token:${value}`).toString("base64"));
      }
    }
  }
  return redactions;
}

function sanitizeOutput(value: string, redactions: string[]): string {
  let output = value;
  for (const redaction of redactions) {
    output = output.replaceAll(redaction, "[redacted]");
  }
  return output;
}

function summarizeCommandOutput(value: string): string | undefined {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);
  if (lines.length === 0) {
    return undefined;
  }
  const summary = lines.join(" | ");
  return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
}

function errorSummary(result: BuildAgentCommandResult): string {
  const lines = [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("Cloning into "));

  return lines.at(-1) ?? "command failed";
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function sanitizeError(message: string, env: NodeJS.ProcessEnv): string {
  let sanitized = message;

  for (const key of ["GITHUB_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    const value = envValue(env, key);
    if (value) {
      sanitized = sanitized.replaceAll(value, "[redacted]");
      if (key === "GITHUB_TOKEN") {
        sanitized = sanitized.replaceAll(Buffer.from(`x-access-token:${value}`).toString("base64"), "[redacted]");
      }
    }
  }

  return sanitized.replace(/bot[A-Za-z0-9:_-]+\/sendMessage/g, "bot[redacted]/sendMessage");
}

function nowIso(options: Pick<BuildAgentRunOptions, "now">): string {
  return (options.now ?? (() => new Date()))().toISOString();
}

function defaultTelegramFetch(): TelegramFetch {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("global fetch is not available for Telegram API calls");
  }

  return globalThis.fetch as unknown as TelegramFetch;
}

async function parseTelegramResponseBody(response: TelegramFetchResponse): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { description: text };
  }
}

function isTelegramOk(value: unknown): boolean {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>)["ok"] === true,
  );
}

function telegramDescription(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const description = (value as Record<string, unknown>)["description"];
  return typeof description === "string" && description.length > 0 ? description : undefined;
}

function telegramMessageId(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "unknown";
  }

  const result = (value as Record<string, unknown>)["result"];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return "unknown";
  }

  const id = (result as Record<string, unknown>)["message_id"];
  return typeof id === "number" || typeof id === "string" ? String(id) : "unknown";
}

function summarizeOutput(result: { stdout: string; stderr: string }): string | undefined {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return output.length > 0 ? output : undefined;
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
