import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import { shellQuote, validateWorkspaceRoot, workspaceRootPrelude } from "../remote/paths.js";
import { githubPullRequestDecisionLines } from "../telegram/ownerDecision.js";
import {
  createGitHubClient,
  createGitHubPullRequest,
  findOpenGitHubPullRequestForBranch,
  parseGitHubRepo,
  updateGitHubPullRequest,
  type GitHubClient,
  type GitHubFetch,
} from "./client.js";
import type { TelegramFetch, TelegramFetchResponse } from "./reviewWorkflow.js";

export interface PullRequestUpsertOptions {
  host: string;
  workspaceRoot: string;
  repo: string;
  head: string;
  base: string;
  title: string;
  body?: string | undefined;
  draft?: boolean | undefined;
  local?: boolean | undefined;
  runner?: RemoteCommandRunner | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  githubClient?: GitHubClient | undefined;
  githubFetch?: GitHubFetch | undefined;
  telegramFetch?: TelegramFetch | undefined;
}

export interface PullRequestUpsertReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  blockers: string[];
  pullRequest: PullRequestSummary;
  telegram?: PullRequestTelegramSummary | undefined;
  details?: string | undefined;
}

export interface PullRequestSummary {
  repo: string;
  head: string;
  base: string;
  title: string;
  action: "created" | "updated" | "blocked";
  number?: number | undefined;
  url?: string | undefined;
}

export interface PullRequestTelegramSummary {
  status: "sent" | "failed";
  summary: string;
  messageId?: string | undefined;
}

interface TelegramMessageResult {
  messageId: string;
}

export async function runPullRequestUpsert(options: PullRequestUpsertOptions): Promise<PullRequestUpsertReport> {
  validateOptions(options);

  if (options.local === true) {
    return runLocalPullRequestUpsert(options);
  }

  validateHost(options.host);
  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(pullRequestUpsertRemoteCommand(options));
  const parsed = parseRemotePullRequestReport(result.stdout);

  if (parsed.ok) {
    return {
      ...parsed.value,
      host: options.host,
      workspaceRoot: options.workspaceRoot,
    };
  }

  const summary = firstLine(result.stderr) || parsed.message || firstLine(result.stdout) || "remote PR upsert failed";
  const report: PullRequestUpsertReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: [`Pull request upsert: ${summary}`],
    pullRequest: blockedPullRequestSummary(options),
  };
  const details = summarizeOutput(result);
  if (details) {
    report.details = details;
  }
  return report;
}

export function formatPullRequestUpsertReport(report: PullRequestUpsertReport): string {
  const lines: string[] = [
    "Vampyre PR upsert",
    `Host: ${report.host}`,
    `Workspace Root: ${report.workspaceRoot}`,
    `GitHub Repo: ${report.pullRequest.repo}`,
    `Branch: ${report.pullRequest.head} -> ${report.pullRequest.base}`,
    `Title: ${report.pullRequest.title}`,
  ];

  if (report.pullRequest.number && report.pullRequest.url) {
    lines.push("");
    lines.push(`Pull Request: #${report.pullRequest.number} (${report.pullRequest.action})`);
    lines.push(`PR URL: ${report.pullRequest.url}`);
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

export function pullRequestUpsertReportToJson(report: PullRequestUpsertReport): string {
  return JSON.stringify(report, null, 2);
}

async function runLocalPullRequestUpsert(options: PullRequestUpsertOptions): Promise<PullRequestUpsertReport> {
  const env = options.env ?? process.env;
  const base = baseReport(options);

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

  let pullRequest: PullRequestSummary;
  try {
    const existing = await findOpenGitHubPullRequestForBranch(githubClient, {
      repo: options.repo,
      head: options.head,
      base: options.base,
    });
    const result = existing
      ? await updateGitHubPullRequest(githubClient, {
          repo: options.repo,
          pullNumber: existing.number,
          title: options.title,
          body: options.body,
          base: options.base,
        })
      : await createGitHubPullRequest(githubClient, {
          repo: options.repo,
          title: options.title,
          head: options.head,
          base: options.base,
          body: options.body,
          draft: options.draft,
        });

    pullRequest = {
      repo: options.repo,
      head: options.head,
      base: options.base,
      title: options.title,
      action: existing ? "updated" : "created",
      number: result.number,
      url: result.url,
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
      pullRequest,
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
      text: telegramPullRequestMessage(pullRequest),
      fetchImpl: options.telegramFetch,
    });
    return {
      ...base,
      ready: true,
      pullRequest,
      telegram: {
        status: "sent",
        summary: "Telegram notification sent with GitHub PR link",
        messageId: message.messageId,
      },
    };
  } catch (error) {
    return {
      ...base,
      pullRequest,
      telegram: {
        status: "failed",
        summary: sanitizeError(error, env),
      },
      blockers: [`Telegram: ${sanitizeError(error, env)}`],
    };
  }
}

function pullRequestUpsertRemoteCommand(options: PullRequestUpsertOptions): string {
  const args = [
    "pr",
    "upsert",
    "--local",
    "--json",
    "--host",
    options.host,
    "--workspace-root",
    "$root",
    "--repo",
    options.repo,
    "--head",
    options.head,
    "--base",
    options.base,
    "--title",
    options.title,
  ];
  if (options.body !== undefined) {
    args.push("--body", options.body);
  }
  if (options.draft === true) {
    args.push("--draft");
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

function validateOptions(options: PullRequestUpsertOptions): void {
  validateWorkspaceRoot(options.workspaceRoot);
  parseGitHubRepo(options.repo);
  validateRequiredString(options.head, "--head");
  validateRequiredString(options.base, "--base");
  validateRequiredString(options.title, "--title");
}

function baseReport(options: PullRequestUpsertOptions): PullRequestUpsertReport {
  return {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: [],
    pullRequest: blockedPullRequestSummary(options),
  };
}

function blockedPullRequestSummary(options: PullRequestUpsertOptions): PullRequestSummary {
  return {
    repo: options.repo,
    head: options.head,
    base: options.base,
    title: options.title,
    action: "blocked",
  };
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

function telegramPullRequestMessage(pullRequest: PullRequestSummary): string {
  return [
    "Vampyre PR ready",
    `Repo: ${pullRequest.repo}`,
    `Branch: ${pullRequest.head} -> ${pullRequest.base}`,
    `Pull Request: ${pullRequest.url ?? "unknown"}`,
    ...githubPullRequestDecisionLines(),
    "Telegram is notification-only. Review stays in GitHub.",
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

function validateRequiredString(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} requires a value`);
  }
}

type ParseResult =
  | {
      ok: true;
      value: PullRequestUpsertReport;
    }
  | {
      ok: false;
      message: string;
    };

function parseRemotePullRequestReport(stdout: string): ParseResult {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "remote PR upsert returned invalid JSON" };
    }

    const report = parsed as PullRequestUpsertReport;
    if (typeof report.ready !== "boolean" || !Array.isArray(report.blockers) || !report.pullRequest) {
      return { ok: false, message: "remote PR upsert did not return a report" };
    }

    return {
      ok: true,
      value: report,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `remote PR upsert returned invalid JSON: ${message}`,
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
