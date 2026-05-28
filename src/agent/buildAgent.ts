import { spawn } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import {
  createGitHubClient,
  createGitHubIssue,
  createGitHubIssueComment,
  ensureGitHubLabel,
  findOpenGitHubIssueByTitle,
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
  workerStep?: BuildAgentWorkerStepSummary | undefined;
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

export interface BuildAgentWorkerStepSummary {
  kind: "dry-run-validation";
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
  | "agent-error";

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

  if (report.workerStep) {
    lines.push("");
    lines.push("Worker Step:");
    lines.push(`  Kind: ${report.workerStep.kind}`);
    lines.push(`  Command: ${report.workerStep.command}`);
    lines.push(`  Exit Code: ${report.workerStep.exitCode}`);
    lines.push(`  Summary: ${report.workerStep.summary}`);
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

    const workerStep = await runDryRunValidation({
      worktreePath: worktree.worktreePath,
      commandRunner,
      redactions: gitAuthRedactions(token),
    });
    report.workerStep = workerStep;
    if (workerStep.exitCode !== 0) {
      throw new BuildAgentFailure("validation-failure", workerStep.summary);
    }
    report.proof.push("Dry-run validation step exited 0");

    await cleanupWorktree({
      repoPath,
      worktree,
      commandRunner,
    });
    worktree.cleanup = "removed";
    report.proof.push(`Removed successful dry-run worktree ${worktree.worktreePath}`);
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
      ? `Completed Worktree Build Agent dry-run for ${project.displayName}`
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

async function runDryRunValidation(options: {
  worktreePath: string;
  commandRunner: BuildAgentCommandRunner;
  redactions: string[];
}): Promise<BuildAgentWorkerStepSummary> {
  const result = await options.commandRunner({
    command: "git",
    args: ["status", "--short"],
    cwd: options.worktreePath,
  });
  const stdoutSummary = summarizeCommandOutput(sanitizeOutput(result.stdout, options.redactions));
  const stderrSummary = summarizeCommandOutput(sanitizeOutput(result.stderr, options.redactions));

  const step: BuildAgentWorkerStepSummary = {
    kind: "dry-run-validation",
    command: "git status --short",
    exitCode: result.exitCode,
    summary:
      result.exitCode === 0
        ? stdoutSummary
          ? "dry-run worktree status collected"
          : "dry-run worktree is clean"
        : `dry-run validation failed: ${stderrSummary || stdoutSummary || "command failed"}`,
  };

  if (stdoutSummary) {
    step.stdoutSummary = stdoutSummary;
  }
  if (stderrSummary) {
    step.stderrSummary = stderrSummary;
  }

  return step;
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
  if (report.workerStep) {
    lines.push(`- Worker Step: ${report.workerStep.command}`);
    lines.push(`- Worker Exit Code: ${report.workerStep.exitCode}`);
    lines.push(`- Worker Summary: ${report.workerStep.summary}`);
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
    `Worker Step: ${report.workerStep?.command ?? "not-run"}`,
    `Worker Result: ${report.workerStep?.summary ?? "not-run"}`,
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
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
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
