import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import { shellQuote, validateWorkspaceRoot, workspaceRootPrelude } from "../remote/paths.js";
import { githubReviewDecisionLines } from "../telegram/ownerDecision.js";
import {
  initializeOperationalState,
  type OperationalStateOptions,
  type OperationalStateReport,
  type ProjectRuntimeStatus,
  type SchedulerDecisionRecord,
} from "../state/operationalState.js";
import {
  createGitHubClient,
  createGitHubIssue,
  createGitHubIssueComment,
  ensureGitHubLabel,
  findOpenGitHubIssueByTitle,
  type GitHubClient,
  type GitHubFetch,
} from "./client.js";

export interface ReviewRequestOptions {
  host: string;
  workspaceRoot: string;
  local?: boolean | undefined;
  now?: (() => Date) | undefined;
  runner?: RemoteCommandRunner | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  githubClient?: GitHubClient | undefined;
  githubFetch?: GitHubFetch | undefined;
  telegramFetch?: TelegramFetch | undefined;
  initializeState?: ((options: OperationalStateOptions) => Promise<OperationalStateReport>) | undefined;
}

export interface ReviewRequestReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  blockers: string[];
  selectedProject?: ReviewProjectSummary | undefined;
  scheduler?: ReviewSchedulerSummary | undefined;
  github?: ReviewGitHubSummary | undefined;
  telegram?: ReviewTelegramSummary | undefined;
  details?: string | undefined;
}

export interface ReviewProjectSummary {
  id: string;
  displayName: string;
  mode: string;
  githubRepo: string;
}

export interface ReviewSchedulerSummary {
  lastTickAt: string;
  budget: string;
  selectedProjectId: string;
  decisionReason: string;
}

export interface ReviewGitHubSummary {
  repo: string;
  labelName: string;
  labelAction: "created" | "updated";
  issueNumber: number;
  issueUrl: string;
  issueAction: "created" | "reused";
  commentUrl: string;
}

export interface ReviewTelegramSummary {
  status: "sent" | "failed";
  summary: string;
  messageId?: string | undefined;
}

export interface TelegramFetchInit {
  method: string;
  headers?: Record<string, string> | undefined;
  body: unknown;
}

export interface TelegramFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

export type TelegramFetch = (url: string, init: TelegramFetchInit) => Promise<TelegramFetchResponse>;

interface ReviewTarget {
  project: ProjectRuntimeStatus & { githubRepo: string };
  decision: SchedulerDecisionRecord;
}

interface TelegramMessageResult {
  messageId: string;
}

const REVIEW_LABEL = "vampyre:review";
const REVIEW_LABEL_COLOR = "0e8a16";
const REVIEW_LABEL_DESCRIPTION = "Durable Vampyre review and approval records";

export async function runReviewRequest(options: ReviewRequestOptions): Promise<ReviewRequestReport> {
  validateWorkspaceRoot(options.workspaceRoot);

  if (options.local === true) {
    return runLocalReviewRequest(options);
  }

  validateHost(options.host);
  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(reviewRequestRemoteCommand(options.host, options.workspaceRoot));
  const parsed = parseRemoteReviewReport(result.stdout);

  if (parsed.ok) {
    return {
      ...parsed.value,
      host: options.host,
      workspaceRoot: options.workspaceRoot,
    };
  }

  const summary = firstLine(result.stderr) || parsed.message || firstLine(result.stdout) || "remote review request failed";
  const report: ReviewRequestReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: [`Review request: ${summary}`],
  };
  const details = summarizeOutput(result);
  if (details) {
    report.details = details;
  }
  return report;
}

export function formatReviewRequestReport(report: ReviewRequestReport): string {
  const lines: string[] = [
    "Vampyre review request",
    `Host: ${report.host}`,
    `Workspace Root: ${report.workspaceRoot}`,
    "",
  ];

  if (report.selectedProject) {
    lines.push(`Project: ${report.selectedProject.displayName} (${report.selectedProject.id})`);
    lines.push(`Mode: ${report.selectedProject.mode}`);
    lines.push(`GitHub: ${report.selectedProject.githubRepo}`);
  }

  if (report.scheduler) {
    lines.push(`Scheduler: ${report.scheduler.budget}; ${report.scheduler.decisionReason}`);
  }

  if (report.github) {
    lines.push("");
    lines.push(`GitHub Label: ${report.github.labelName} (${report.github.labelAction})`);
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

  if (report.blockers.length > 0) {
    lines.push("");
    lines.push("Blockers:");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  return lines.join("\n");
}

export function reviewRequestReportToJson(report: ReviewRequestReport): string {
  return JSON.stringify(report, null, 2);
}

async function runLocalReviewRequest(options: ReviewRequestOptions): Promise<ReviewRequestReport> {
  const now = options.now ?? (() => new Date());
  const initializeState = options.initializeState ?? initializeOperationalState;
  const env = options.env ?? process.env;
  const state = await initializeState({
    workspaceRoot: options.workspaceRoot,
    now,
  });
  const target = selectReviewTarget(state);

  if (!target.ok) {
    return baseReport(options, {
      blockers: [target.blocker],
    });
  }

  const project = projectSummary(target.value.project);
  const scheduler = schedulerSummary(state, target.value.decision);
  const base = baseReport(options, {
    selectedProject: project,
    scheduler,
  });
  const issueTitle = reviewIssueTitle(target.value.project);
  const createdAt = now().toISOString();

  let githubClient = options.githubClient;
  if (!githubClient) {
    const token = envValue(env, "GITHUB_TOKEN");
    if (!token) {
      return {
        ...base,
        blockers: ["GitHub: GITHUB_TOKEN is missing"],
      };
    }

    githubClient = createGitHubClient({
      token,
      fetchImpl: options.githubFetch,
    });
  }

  let github: ReviewGitHubSummary;
  try {
    const label = await ensureGitHubLabel(githubClient, {
      repo: target.value.project.githubRepo,
      name: REVIEW_LABEL,
      color: REVIEW_LABEL_COLOR,
      description: REVIEW_LABEL_DESCRIPTION,
    });
    const existingIssue = await findOpenGitHubIssueByTitle(githubClient, {
      repo: target.value.project.githubRepo,
      title: issueTitle,
      label: REVIEW_LABEL,
    });
    const issue =
      existingIssue ??
      (await createGitHubIssue(githubClient, {
        repo: target.value.project.githubRepo,
        title: issueTitle,
        body: reviewIssueBody(target.value.project, target.value.decision, state, createdAt),
        labels: [REVIEW_LABEL],
      }));
    const comment = await createGitHubIssueComment(githubClient, {
      repo: target.value.project.githubRepo,
      issueNumber: issue.number,
      body: reviewCommentBody(target.value.project, target.value.decision, state, createdAt),
    });

    github = {
      repo: target.value.project.githubRepo,
      labelName: label.name,
      labelAction: label.action,
      issueNumber: issue.number,
      issueUrl: issue.url,
      issueAction: existingIssue ? "reused" : "created",
      commentUrl: comment.url,
    };
  } catch (error) {
    return {
      ...base,
      blockers: [`GitHub: ${sanitizeError(error, env)}`],
    };
  }

  const telegramToken = envValue(env, "TELEGRAM_BOT_TOKEN");
  const telegramChatId = envValue(env, "TELEGRAM_CHAT_ID");
  if (!telegramToken || !telegramChatId) {
    return {
      ...base,
      github,
      telegram: {
        status: "failed",
        summary: "Telegram config is missing",
      },
      blockers: ["Telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing"],
    };
  }

  try {
    const message = await sendTelegramMessage({
      token: telegramToken,
      chatId: telegramChatId,
      text: telegramReviewMessage(target.value.project, github),
      fetchImpl: options.telegramFetch,
    });
    return {
      ...base,
      ready: true,
      github,
      telegram: {
        status: "sent",
        summary: "Telegram notification sent with GitHub review link",
        messageId: message.messageId,
      },
    };
  } catch (error) {
    return {
      ...base,
      github,
      telegram: {
        status: "failed",
        summary: sanitizeError(error, env),
      },
      blockers: [`Telegram: ${sanitizeError(error, env)}`],
    };
  }
}

function reviewRequestRemoteCommand(host: string, workspaceRoot: string): string {
  return `
${workspaceRootPrelude(workspaceRoot)}
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
node "$cli" review request --local --json --host ${shellQuote(host)} --workspace-root "$root"
`;
}

type ReviewTargetResult =
  | {
      ok: true;
      value: ReviewTarget;
    }
  | {
      ok: false;
      blocker: string;
    };

function selectReviewTarget(state: OperationalStateReport): ReviewTargetResult {
  if (!state.scheduler) {
    return {
      ok: false,
      blocker: "Scheduler: no recorded scheduler tick is available",
    };
  }

  const selectedProjectId = state.scheduler.selectedProjectId;
  if (!selectedProjectId) {
    return {
      ok: false,
      blocker: "Scheduler: no project is currently selected",
    };
  }

  const project = state.projects.find((candidate) => candidate.id === selectedProjectId);
  if (!project) {
    return {
      ok: false,
      blocker: `Scheduler: selected project ${selectedProjectId} is missing from the Project Registry`,
    };
  }

  if (!project.githubRepo) {
    return {
      ok: false,
      blocker: `Project ${project.displayName}: no GitHub repository is configured for review records`,
    };
  }

  const decision =
    state.scheduler.decisions.find((candidate) => candidate.projectId === selectedProjectId) ??
    ({
      projectId: project.id,
      displayName: project.displayName,
      decision: "selected",
      reason: "selected-project",
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

function baseReport(
  options: ReviewRequestOptions,
  fields: {
    blockers?: string[] | undefined;
    selectedProject?: ReviewProjectSummary | undefined;
    scheduler?: ReviewSchedulerSummary | undefined;
  },
): ReviewRequestReport {
  const report: ReviewRequestReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: fields.blockers ?? [],
  };

  if (fields.selectedProject) {
    report.selectedProject = fields.selectedProject;
  }
  if (fields.scheduler) {
    report.scheduler = fields.scheduler;
  }

  return report;
}

function projectSummary(project: ProjectRuntimeStatus & { githubRepo: string }): ReviewProjectSummary {
  return {
    id: project.id,
    displayName: project.displayName,
    mode: project.modeLabel,
    githubRepo: project.githubRepo,
  };
}

function schedulerSummary(
  state: OperationalStateReport,
  decision: SchedulerDecisionRecord,
): ReviewSchedulerSummary | undefined {
  if (!state.scheduler?.selectedProjectId) {
    return undefined;
  }

  return {
    lastTickAt: state.scheduler.lastTickAt,
    budget: `${state.scheduler.budgetProvider}/${state.scheduler.budgetMode}`,
    selectedProjectId: state.scheduler.selectedProjectId,
    decisionReason: `${decision.decision}:${decision.reason}`,
  };
}

function reviewIssueTitle(project: ProjectRuntimeStatus): string {
  return `Vampyre review: ${project.displayName}`;
}

function reviewIssueBody(
  project: ProjectRuntimeStatus,
  decision: SchedulerDecisionRecord,
  state: OperationalStateReport,
  createdAt: string,
): string {
  return [
    "Vampyre selected this project for a reviewable project action.",
    "",
    `- Project: ${project.displayName} (${project.id})`,
    `- Mode: ${project.modeLabel}`,
    `- Scheduler tick: ${state.scheduler?.lastTickAt ?? "unknown"}`,
    `- Scheduler decision: ${decision.decision} (${decision.reason})`,
    `- Budget mode: ${state.scheduler ? `${state.scheduler.budgetProvider}/${state.scheduler.budgetMode}` : "unknown"}`,
    `- Created at: ${createdAt}`,
    "",
    "This GitHub issue is the durable review record. Telegram notifications may link here, but Telegram is not the approval ledger.",
    "",
    nextActionLine(project),
    "",
    ...githubReviewDecisionLines(),
  ].join("\n");
}

function reviewCommentBody(
  project: ProjectRuntimeStatus,
  decision: SchedulerDecisionRecord,
  state: OperationalStateReport,
  createdAt: string,
): string {
  return [
    `Vampyre scheduler selected ${project.displayName} at ${state.scheduler?.lastTickAt ?? createdAt}.`,
    "",
    `Decision: ${decision.decision}`,
    `Reason: ${decision.reason}`,
    `Budget: ${state.scheduler ? `${state.scheduler.budgetProvider}/${state.scheduler.budgetMode}` : "unknown"}`,
    `Active Build Agent Lock: ${state.scheduler?.activeBuildAgentLock ?? "unknown"}`,
    "",
    nextActionLine(project),
    "",
    ...githubReviewDecisionLines(),
    "",
    "Approval and review decisions must stay in GitHub. Telegram is notification-only.",
  ].join("\n");
}

function nextActionLine(project: ProjectRuntimeStatus): string {
  if (project.mode === "builder") {
    return "Next action: request GitHub approval before Builder Mode spends significant build effort.";
  }

  return "Next action: prepare the next Safe/Watcher review item; project-changing work must end in an Owner-reviewed PR.";
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

function telegramReviewMessage(project: ProjectRuntimeStatus, github: ReviewGitHubSummary): string {
  return [
    "Vampyre review record ready",
    `Project: ${project.displayName}`,
    `GitHub: ${github.issueUrl}`,
    ...githubReviewDecisionLines(),
    "Telegram is notification-only. Approval and review stay in GitHub.",
  ].join("\n");
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
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>)["ok"] === true);
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

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function sanitizeError(error: unknown, env: NodeJS.ProcessEnv): string {
  let message = error instanceof Error ? error.message : String(error);

  for (const key of ["GITHUB_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    const value = envValue(env, key);
    if (value) {
      message = message.replaceAll(value, "[redacted]");
    }
  }

  return message.replace(/bot[A-Za-z0-9:_-]+\/sendMessage/g, "bot[redacted]/sendMessage");
}

type ParseResult =
  | {
      ok: true;
      value: ReviewRequestReport;
    }
  | {
      ok: false;
      message: string;
    };

function parseRemoteReviewReport(stdout: string): ParseResult {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "remote review request returned invalid JSON" };
    }

    const report = parsed as ReviewRequestReport;
    if (typeof report.ready !== "boolean" || !Array.isArray(report.blockers)) {
      return { ok: false, message: "remote review request did not return a report" };
    }

    return {
      ok: true,
      value: report,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `remote review request returned invalid JSON: ${message}`,
    };
  }
}

function summarizeOutput(result: { stdout: string; stderr: string }): string | undefined {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return output.length > 0 ? output : undefined;
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
