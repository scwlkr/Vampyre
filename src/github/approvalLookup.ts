import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import { shellQuote, validateWorkspaceRoot, workspaceRootPrelude } from "../remote/paths.js";
import {
  createGitHubClient,
  listGitHubIssueComments,
  listGitHubIssuesByLabel,
  parseGitHubRepo,
  type GitHubClient,
  type GitHubFetch,
  type GitHubIssueSummary,
} from "./client.js";

export const APPROVAL_KINDS = ["builder-vision", "builder-repo-plan", "major-feature"] as const;

export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export interface ApprovalCheckOptions {
  host: string;
  workspaceRoot: string;
  repo: string;
  projectId: string;
  kind: ApprovalKind;
  key: string;
  local?: boolean | undefined;
  runner?: RemoteCommandRunner | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  githubClient?: GitHubClient | undefined;
  githubFetch?: GitHubFetch | undefined;
}

export interface ApprovalCheckReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  approved: boolean;
  blockers: string[];
  approval: ApprovalTargetSummary;
  github?: ApprovalGitHubSummary | undefined;
  details?: string | undefined;
}

export interface ApprovalTargetSummary {
  repo: string;
  projectId: string;
  kind: ApprovalKind;
  key: string;
  label: string;
  approvedMarker: string;
}

export interface ApprovalGitHubSummary {
  issueNumber: number;
  issueUrl: string;
  issueTitle: string;
  issueState: string;
  evidence: "issue-body" | "issue-comment";
  commentUrl?: string | undefined;
}

interface ApprovalMatch {
  issue: GitHubIssueSummary;
  evidence: "issue-body" | "issue-comment";
  commentUrl?: string | undefined;
}

const APPROVAL_LABEL = "vampyre:approval";
const APPROVED_MARKER = "VAMPYRE_APPROVED";

export async function runApprovalCheck(options: ApprovalCheckOptions): Promise<ApprovalCheckReport> {
  validateApprovalOptions(options);

  if (options.local === true) {
    return runLocalApprovalCheck(options);
  }

  validateHost(options.host);
  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(approvalCheckRemoteCommand(options));
  const parsed = parseRemoteApprovalReport(result.stdout);

  if (parsed.ok) {
    return {
      ...parsed.value,
      host: options.host,
      workspaceRoot: options.workspaceRoot,
    };
  }

  const summary = firstLine(result.stderr) || parsed.message || firstLine(result.stdout) || "remote approval check failed";
  const report: ApprovalCheckReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    approved: false,
    blockers: [`Approval check: ${summary}`],
    approval: approvalTarget(options),
  };
  const details = summarizeOutput(result);
  if (details) {
    report.details = details;
  }
  return report;
}

export function formatApprovalCheckReport(report: ApprovalCheckReport): string {
  const lines: string[] = [
    "Vampyre approval check",
    `Host: ${report.host}`,
    `Workspace Root: ${report.workspaceRoot}`,
    `GitHub Repo: ${report.approval.repo}`,
    `Project: ${report.approval.projectId}`,
    `Approval Kind: ${report.approval.kind}`,
    `Approval Key: ${report.approval.key}`,
    `Status: ${report.approved ? "approved" : "missing"}`,
  ];

  if (report.github) {
    lines.push("");
    lines.push(`GitHub Issue: #${report.github.issueNumber} (${report.github.issueState})`);
    lines.push(`Issue URL: ${report.github.issueUrl}`);
    lines.push(`Evidence: ${report.github.evidence}`);
    if (report.github.commentUrl) {
      lines.push(`Comment URL: ${report.github.commentUrl}`);
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

export function approvalCheckReportToJson(report: ApprovalCheckReport): string {
  return JSON.stringify(report, null, 2);
}

export function isApprovalKind(value: string): value is ApprovalKind {
  return APPROVAL_KINDS.some((kind) => kind === value);
}

function validateApprovalOptions(options: ApprovalCheckOptions): void {
  validateWorkspaceRoot(options.workspaceRoot);
  parseGitHubRepo(options.repo);
  validateRequiredString(options.projectId, "--project");
  validateRequiredString(options.key, "--key");
}

async function runLocalApprovalCheck(options: ApprovalCheckOptions): Promise<ApprovalCheckReport> {
  const base = baseReport(options);
  const env = options.env ?? process.env;
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

  try {
    const match = await findApproval(githubClient, options);
    if (!match) {
      return {
        ...base,
        blockers: [missingApprovalBlocker(options)],
      };
    }

    return {
      ...base,
      ready: true,
      approved: true,
      github: githubSummary(match),
    };
  } catch (error) {
    return {
      ...base,
      blockers: [`GitHub: ${sanitizeError(error, env)}`],
    };
  }
}

async function findApproval(
  githubClient: GitHubClient,
  options: ApprovalCheckOptions,
): Promise<ApprovalMatch | undefined> {
  const issues = await listGitHubIssuesByLabel(githubClient, {
    repo: options.repo,
    label: APPROVAL_LABEL,
    state: "all",
  });

  for (const issue of issues) {
    if (!issue.labels.includes(APPROVAL_LABEL)) {
      continue;
    }

    const issueText = `${issue.title}\n${issue.body}`;
    const issueTargetsApproval = approvalTargetMatches(issueText, options);
    if (issueTargetsApproval && containsApprovedMarker(issueText)) {
      return {
        issue,
        evidence: "issue-body",
      };
    }

    const comments = await listGitHubIssueComments(githubClient, {
      repo: options.repo,
      issueNumber: issue.number,
    });

    for (const comment of comments) {
      const commentTargetsApproval = issueTargetsApproval || approvalTargetMatches(comment.body, options);
      if (commentTargetsApproval && containsApprovedMarker(comment.body)) {
        return {
          issue,
          evidence: "issue-comment",
          commentUrl: comment.url,
        };
      }
    }
  }

  return undefined;
}

function approvalTargetMatches(text: string, options: ApprovalCheckOptions): boolean {
  return (
    hasField(text, "Project", options.projectId) &&
    hasField(text, "Approval Kind", options.kind) &&
    hasField(text, "Approval Key", options.key)
  );
}

function hasField(text: string, field: string, value: string): boolean {
  const pattern = new RegExp(`^\\s*${escapeRegExp(field)}\\s*:\\s*${escapeRegExp(value)}\\s*$`, "im");
  return pattern.test(text);
}

function containsApprovedMarker(text: string): boolean {
  return new RegExp(`^\\s*${APPROVED_MARKER}(?:\\s*:.*)?\\s*$`, "im").test(text);
}

function approvalCheckRemoteCommand(options: ApprovalCheckOptions): string {
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
node "$cli" approval check --local --json --host ${shellQuote(options.host)} --workspace-root "$root" --repo ${shellQuote(
    options.repo,
  )} --project ${shellQuote(options.projectId)} --kind ${shellQuote(options.kind)} --key ${shellQuote(options.key)}
`;
}

function baseReport(options: ApprovalCheckOptions): ApprovalCheckReport {
  return {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    approved: false,
    blockers: [],
    approval: approvalTarget(options),
  };
}

function approvalTarget(options: ApprovalCheckOptions): ApprovalTargetSummary {
  return {
    repo: options.repo,
    projectId: options.projectId,
    kind: options.kind,
    key: options.key,
    label: APPROVAL_LABEL,
    approvedMarker: APPROVED_MARKER,
  };
}

function githubSummary(match: ApprovalMatch): ApprovalGitHubSummary {
  const summary: ApprovalGitHubSummary = {
    issueNumber: match.issue.number,
    issueUrl: match.issue.url,
    issueTitle: match.issue.title,
    issueState: match.issue.state,
    evidence: match.evidence,
  };

  if (match.commentUrl) {
    summary.commentUrl = match.commentUrl;
  }

  return summary;
}

function missingApprovalBlocker(options: ApprovalCheckOptions): string {
  return [
    `GitHub approval: no issue labeled ${APPROVAL_LABEL} in ${options.repo} proves approval for ${options.projectId}`,
    `kind ${options.kind}`,
    `key ${options.key}`,
    `required marker ${APPROVED_MARKER}`,
  ].join("; ");
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function sanitizeError(error: unknown, env: NodeJS.ProcessEnv): string {
  let message = error instanceof Error ? error.message : String(error);
  const token = envValue(env, "GITHUB_TOKEN");
  if (token) {
    message = message.replaceAll(token, "[redacted]");
  }
  return message;
}

function validateRequiredString(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} requires a value`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type ParseResult =
  | {
      ok: true;
      value: ApprovalCheckReport;
    }
  | {
      ok: false;
      message: string;
    };

function parseRemoteApprovalReport(stdout: string): ParseResult {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "remote approval check returned invalid JSON" };
    }

    const report = parsed as ApprovalCheckReport;
    if (typeof report.ready !== "boolean" || typeof report.approved !== "boolean" || !Array.isArray(report.blockers)) {
      return { ok: false, message: "remote approval check did not return a report" };
    }

    return {
      ok: true,
      value: report,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `remote approval check returned invalid JSON: ${message}`,
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
