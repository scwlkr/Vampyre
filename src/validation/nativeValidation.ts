import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import {
  createGitHubClient,
  dispatchGitHubWorkflow,
  getGitHubWorkflowRun,
  listGitHubWorkflowJobs,
  listGitHubWorkflowRuns,
  type GitHubClient,
  type GitHubFetch,
  type GitHubWorkflowJobSummary,
  type GitHubWorkflowRunSummary,
} from "../github/client.js";
import type { NativeValidationProfile } from "../registry/projectRegistry.js";
import { shellQuote, validateWorkspaceRoot, workspacePath, workspaceRootPrelude } from "../remote/paths.js";
import {
  initializeOperationalState,
  recordExternalValidationRun,
  recordProjectBlocker,
  resolveProjectBlockers,
  type ExternalValidationRunRecord,
  type OperationalStateOptions,
  type OperationalStateReport,
  type ProjectRuntimeStatus,
} from "../state/operationalState.js";

export interface NativeValidationRequestOptions {
  host: string;
  workspaceRoot: string;
  projectId: string;
  ref: string;
  wait?: boolean | undefined;
  timeoutSeconds?: number | undefined;
  local?: boolean | undefined;
  now?: (() => Date) | undefined;
  runner?: RemoteCommandRunner | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  githubClient?: GitHubClient | undefined;
  githubFetch?: GitHubFetch | undefined;
  sleep?: ((milliseconds: number) => Promise<void>) | undefined;
  pollIntervalMs?: number | undefined;
  discoveryTimeoutMs?: number | undefined;
  initializeState?: ((options: OperationalStateOptions) => Promise<OperationalStateReport>) | undefined;
}

export interface NativeValidationRequestReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  blockers: string[];
  requestedAt: string;
  checkedAt: string;
  project?: NativeValidationProjectSummary | undefined;
  validation?: NativeValidationConfigSummary | undefined;
  github?: NativeValidationGitHubSummary | undefined;
  state?: ExternalValidationRunRecord | undefined;
  reportPaths?: NativeValidationReportPaths | undefined;
  details?: string | undefined;
}

export interface NativeValidationProjectSummary {
  id: string;
  displayName: string;
  githubRepo: string;
}

export interface NativeValidationConfigSummary {
  provider: "github-actions";
  workflowId: string;
  ref: string;
  runnerLabel: string;
  requiredConclusion: string;
  timeoutSeconds: number;
  wait: boolean;
}

export interface NativeValidationGitHubSummary {
  dispatchAccepted: boolean;
  status: string;
  conclusion?: string | undefined;
  runId?: string | undefined;
  runUrl?: string | undefined;
  jobs: NativeValidationJobSummary[];
  errorSummary?: string | undefined;
}

export interface NativeValidationJobSummary {
  id: string;
  name: string;
  status: string;
  conclusion?: string | undefined;
  url?: string | undefined;
}

export interface NativeValidationReportPaths {
  markdown: string;
  json: string;
}

type NativeValidationTarget =
  | {
      ok: true;
      project: ProjectRuntimeStatus & { githubRepo: string; nativeValidation: NativeValidationProfile };
    }
  | {
      ok: false;
      blocker: string;
    };

interface WaitResult {
  run: GitHubWorkflowRunSummary;
  timedOut: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 60_000;
const FAILURE_BLOCKER_SUMMARY = "Native validation failure";
const TIMEOUT_BLOCKER_SUMMARY = "Native validation timeout";

export async function runNativeValidationRequest(
  options: NativeValidationRequestOptions,
): Promise<NativeValidationRequestReport> {
  validateOptions(options);

  if (options.local === true) {
    return runLocalNativeValidationRequest(options);
  }

  validateHost(options.host);
  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(nativeValidationRemoteCommand(options));
  const parsed = parseRemoteNativeValidationReport(result.stdout);

  if (parsed.ok) {
    return {
      ...parsed.value,
      host: options.host,
      workspaceRoot: options.workspaceRoot,
    };
  }

  const summary =
    firstLine(result.stderr) || parsed.message || firstLine(result.stdout) || "remote native validation failed";
  const report: NativeValidationRequestReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: [`Native validation: ${summary}`],
    requestedAt: nowIso(options),
    checkedAt: nowIso(options),
  };
  const details = summarizeOutput(result);
  if (details) {
    report.details = details;
  }
  return report;
}

export function formatNativeValidationRequestReport(report: NativeValidationRequestReport): string {
  const lines: string[] = [
    "Vampyre native validation",
    `Host: ${report.host}`,
    `Workspace Root: ${report.workspaceRoot}`,
    `Requested At: ${report.requestedAt}`,
    `Checked At: ${report.checkedAt}`,
  ];

  if (report.project) {
    lines.push("");
    lines.push(`Project: ${report.project.displayName} (${report.project.id})`);
    lines.push(`GitHub: ${report.project.githubRepo}`);
  }

  if (report.validation) {
    lines.push("");
    lines.push(`Provider: ${report.validation.provider}`);
    lines.push(`Workflow: ${report.validation.workflowId}`);
    lines.push(`Runner: ${report.validation.runnerLabel}`);
    lines.push(`Ref: ${report.validation.ref}`);
    lines.push(`Required Conclusion: ${report.validation.requiredConclusion}`);
    lines.push(`Wait: ${report.validation.wait ? "yes" : "no"}`);
  }

  if (report.github) {
    lines.push("");
    lines.push(`GitHub Dispatch: ${report.github.dispatchAccepted ? "accepted" : "not accepted"}`);
    lines.push(`Status: ${report.github.status}`);
    if (report.github.conclusion) {
      lines.push(`Conclusion: ${report.github.conclusion}`);
    }
    if (report.github.runId) {
      lines.push(`Run ID: ${report.github.runId}`);
    }
    if (report.github.runUrl) {
      lines.push(`Run URL: ${report.github.runUrl}`);
    }
    if (report.github.jobs.length > 0) {
      lines.push("Jobs:");
      for (const job of report.github.jobs) {
        lines.push(`- ${job.name}: ${job.conclusion ? `${job.status}/${job.conclusion}` : job.status}`);
      }
    }
    if (report.github.errorSummary) {
      lines.push(`Failure Summary: ${report.github.errorSummary}`);
    }
  }

  if (report.reportPaths) {
    lines.push("");
    lines.push("Report Files:");
    lines.push(`  Markdown: ${report.reportPaths.markdown}`);
    lines.push(`  JSON: ${report.reportPaths.json}`);
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

export function nativeValidationRequestReportToJson(report: NativeValidationRequestReport): string {
  return JSON.stringify(report, null, 2);
}

async function runLocalNativeValidationRequest(
  options: NativeValidationRequestOptions,
): Promise<NativeValidationRequestReport> {
  const requestedAt = nowIso(options);
  const initializeState = options.initializeState ?? initializeOperationalState;
  const stateOptions: OperationalStateOptions = {
    workspaceRoot: options.workspaceRoot,
  };
  if (options.now) {
    stateOptions.now = options.now;
  }
  const state = await initializeState(stateOptions);
  const target = nativeValidationTarget(state, options.projectId);

  if (!target.ok) {
    return baseReport(options, requestedAt, nowIso(options), {
      blockers: [target.blocker],
    });
  }

  const project = projectSummary(target.project);
  const validation = validationSummary(target.project.nativeValidation, options);
  const env = options.env ?? process.env;
  let githubClient = options.githubClient;
  if (!githubClient) {
    const token = envValue(env, "GITHUB_TOKEN");
    if (!token) {
      return baseReport(options, requestedAt, nowIso(options), {
        project,
        validation,
        blockers: ["GitHub: GITHUB_TOKEN is missing"],
      });
    }
    githubClient = createGitHubClient({ token, fetchImpl: options.githubFetch });
  }

  try {
    const dispatch = await dispatchGitHubWorkflow(githubClient, {
      repo: project.githubRepo,
      workflowId: validation.workflowId,
      ref: validation.ref,
      inputs: {
        ref_name: validation.ref,
      },
    });
    let run = dispatch.run;
    if (!run) {
      run = await findDispatchedWorkflowRun(githubClient, {
        repo: project.githubRepo,
        workflowId: validation.workflowId,
        ref: validation.ref,
        createdAfter: requestedAt,
        sleep: options.sleep,
        pollIntervalMs: options.pollIntervalMs,
        discoveryTimeoutMs: options.discoveryTimeoutMs,
      });
    }

    let timedOut = false;
    if (run && validation.wait) {
      const waitResult = await waitForWorkflowRun(githubClient, {
        repo: project.githubRepo,
        run,
        timeoutSeconds: validation.timeoutSeconds,
        sleep: options.sleep,
        pollIntervalMs: options.pollIntervalMs,
      });
      run = waitResult.run;
      timedOut = waitResult.timedOut;
    }

    const jobs = run ? await safeListJobs(githubClient, project.githubRepo, run.id) : [];
    const checkedAt = nowIso(options);
    const github = githubSummary({
      dispatchAccepted: dispatch.accepted,
      run,
      jobs,
      timedOut,
      requiredConclusion: validation.requiredConclusion,
      wait: validation.wait,
    });
    const blockers = validationBlockers(github, validation);
    const record = externalValidationRecord({
      project,
      validation,
      github,
      requestedAt,
      checkedAt,
    });
    await recordExternalValidationRun(state.databasePath, record);
    await updateValidationBlockers(state.databasePath, project.id, github, validation, checkedAt);

    const report = baseReport(options, requestedAt, checkedAt, {
      ready: blockers.length === 0,
      project,
      validation,
      github,
      state: record,
      blockers,
    });
    const reportPaths = await writeNativeValidationReports(options.workspaceRoot, project.id, report);
    return {
      ...report,
      reportPaths,
    };
  } catch (error) {
    return baseReport(options, requestedAt, nowIso(options), {
      project,
      validation,
      blockers: [`GitHub: ${sanitizeError(error, env)}`],
    });
  }
}

function nativeValidationRemoteCommand(options: NativeValidationRequestOptions): string {
  const args = [
    "validation",
    "request",
    "--local",
    "--json",
    "--host",
    options.host,
    "--workspace-root",
    "$root",
    "--project",
    options.projectId,
    "--ref",
    options.ref,
  ];
  if (options.wait === true) {
    args.push("--wait");
  }
  if (options.timeoutSeconds !== undefined) {
    args.push("--timeout-seconds", String(options.timeoutSeconds));
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

function validateOptions(options: NativeValidationRequestOptions): void {
  validateWorkspaceRoot(options.workspaceRoot);
  validateRequiredString(options.projectId, "--project");
  validateRequiredString(options.ref, "--ref");
  if (options.timeoutSeconds !== undefined && (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds <= 0)) {
    throw new Error("--timeout-seconds must be a positive integer");
  }
}

function nativeValidationTarget(state: OperationalStateReport, projectId: string): NativeValidationTarget {
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
  if (!project.nativeValidation) {
    return {
      ok: false,
      blocker: `Project ${project.displayName}: nativeValidation is not configured`,
    };
  }

  return {
    ok: true,
    project: {
      ...project,
      githubRepo: project.githubRepo,
      nativeValidation: project.nativeValidation,
    },
  };
}

function projectSummary(project: ProjectRuntimeStatus & { githubRepo: string }): NativeValidationProjectSummary {
  return {
    id: project.id,
    displayName: project.displayName,
    githubRepo: project.githubRepo,
  };
}

function validationSummary(
  nativeValidation: NativeValidationProfile,
  options: NativeValidationRequestOptions,
): NativeValidationConfigSummary {
  return {
    provider: nativeValidation.provider,
    workflowId: nativeValidation.workflowId,
    ref: options.ref,
    runnerLabel: nativeValidation.runnerLabel,
    requiredConclusion: nativeValidation.requiredConclusion,
    timeoutSeconds: options.timeoutSeconds ?? nativeValidation.timeoutSeconds,
    wait: options.wait === true,
  };
}

async function findDispatchedWorkflowRun(
  client: GitHubClient,
  options: {
    repo: string;
    workflowId: string;
    ref: string;
    createdAfter: string;
    sleep?: ((milliseconds: number) => Promise<void>) | undefined;
    pollIntervalMs?: number | undefined;
    discoveryTimeoutMs?: number | undefined;
  },
): Promise<GitHubWorkflowRunSummary | undefined> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = Math.max(
    1,
    Math.ceil((options.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS) / pollIntervalMs),
  );
  const branch = branchFromRef(options.ref);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const runs = await listGitHubWorkflowRuns(client, {
      repo: options.repo,
      workflowId: options.workflowId,
      branch,
      event: "workflow_dispatch",
      createdAfter: options.createdAfter,
    });
    const run = runs[0];
    if (run) {
      return run;
    }
    if (attempt < maxAttempts - 1) {
      await sleep(options.sleep, pollIntervalMs);
    }
  }

  return undefined;
}

async function waitForWorkflowRun(
  client: GitHubClient,
  options: {
    repo: string;
    run: GitHubWorkflowRunSummary;
    timeoutSeconds: number;
    sleep?: ((milliseconds: number) => Promise<void>) | undefined;
    pollIntervalMs?: number | undefined;
  },
): Promise<WaitResult> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = Math.max(1, Math.ceil((options.timeoutSeconds * 1000) / pollIntervalMs) + 1);
  let latest = options.run;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    latest = await getGitHubWorkflowRun(client, {
      repo: options.repo,
      runId: latest.id,
    });
    if (latest.status === "completed") {
      return {
        run: latest,
        timedOut: false,
      };
    }
    if (attempt < maxAttempts - 1) {
      await sleep(options.sleep, pollIntervalMs);
    }
  }

  return {
    run: latest,
    timedOut: true,
  };
}

async function safeListJobs(
  client: GitHubClient,
  repo: string,
  runId: string,
): Promise<GitHubWorkflowJobSummary[]> {
  try {
    return await listGitHubWorkflowJobs(client, { repo, runId });
  } catch {
    return [];
  }
}

function githubSummary(options: {
  dispatchAccepted: boolean;
  run?: GitHubWorkflowRunSummary | undefined;
  jobs: GitHubWorkflowJobSummary[];
  timedOut: boolean;
  requiredConclusion: string;
  wait: boolean;
}): NativeValidationGitHubSummary {
  const status = options.timedOut ? "timed_out" : (options.run?.status ?? "requested");
  const summary: NativeValidationGitHubSummary = {
    dispatchAccepted: options.dispatchAccepted,
    status,
    jobs: options.jobs.map(jobSummary),
  };
  if (options.run?.conclusion) {
    summary.conclusion = options.run.conclusion;
  }
  if (options.run?.id) {
    summary.runId = options.run.id;
  }
  if (options.run?.htmlUrl) {
    summary.runUrl = options.run.htmlUrl;
  }
  const errorSummary = nativeValidationErrorSummary(summary, options.requiredConclusion, options.wait);
  if (errorSummary) {
    summary.errorSummary = errorSummary;
  }
  return summary;
}

function jobSummary(job: GitHubWorkflowJobSummary): NativeValidationJobSummary {
  const summary: NativeValidationJobSummary = {
    id: job.id,
    name: job.name,
    status: job.status,
  };
  if (job.conclusion) {
    summary.conclusion = job.conclusion;
  }
  if (job.htmlUrl) {
    summary.url = job.htmlUrl;
  }
  return summary;
}

function nativeValidationErrorSummary(
  github: NativeValidationGitHubSummary,
  requiredConclusion: string,
  wait: boolean,
): string | undefined {
  if (github.status === "timed_out") {
    return "Workflow did not complete before the configured timeout";
  }
  if (!wait || github.status !== "completed") {
    return undefined;
  }
  if (github.conclusion === requiredConclusion) {
    return undefined;
  }

  const failedJobs = github.jobs
    .filter((job) => job.conclusion && job.conclusion !== requiredConclusion)
    .map((job) => `${job.name}:${job.conclusion}`);
  const suffix = failedJobs.length > 0 ? `; jobs ${failedJobs.join(", ")}` : "";
  return `Expected conclusion ${requiredConclusion}, got ${github.conclusion ?? "unknown"}${suffix}`;
}

function validationBlockers(
  github: NativeValidationGitHubSummary,
  validation: NativeValidationConfigSummary,
): string[] {
  if (!validation.wait) {
    return [];
  }
  if (github.status === "timed_out") {
    return [`Native validation: ${github.errorSummary ?? "workflow timed out"}`];
  }
  if (github.status !== "completed") {
    return [`Native validation: workflow did not complete; status ${github.status}`];
  }
  if (github.conclusion !== validation.requiredConclusion) {
    return [`Native validation: ${github.errorSummary ?? `expected ${validation.requiredConclusion}`}`];
  }
  return [];
}

function externalValidationRecord(options: {
  project: NativeValidationProjectSummary;
  validation: NativeValidationConfigSummary;
  github: NativeValidationGitHubSummary;
  requestedAt: string;
  checkedAt: string;
}): ExternalValidationRunRecord {
  const id = `native-validation:${options.project.id}:${options.github.runId ?? safeId(options.requestedAt)}`;
  const record: ExternalValidationRunRecord = {
    id,
    projectId: options.project.id,
    provider: options.validation.provider,
    repo: options.project.githubRepo,
    workflowId: options.validation.workflowId,
    ref: options.validation.ref,
    status: options.github.status,
    requestedAt: options.requestedAt,
    checkedAt: options.checkedAt,
  };
  if (options.github.runId) {
    record.providerRunId = options.github.runId;
  }
  if (options.github.runUrl) {
    record.providerUrl = options.github.runUrl;
  }
  if (options.github.conclusion) {
    record.conclusion = options.github.conclusion;
  }
  if (options.github.status === "completed") {
    record.completedAt = options.checkedAt;
  }
  if (options.github.status !== "requested") {
    record.startedAt = options.requestedAt;
  }
  if (options.github.errorSummary) {
    record.errorSummary = options.github.errorSummary;
  }
  return record;
}

async function updateValidationBlockers(
  databasePath: string,
  projectId: string,
  github: NativeValidationGitHubSummary,
  validation: NativeValidationConfigSummary,
  now: string,
): Promise<void> {
  if (!validation.wait || (github.status === "completed" && github.conclusion === validation.requiredConclusion)) {
    await resolveProjectBlockers(databasePath, {
      projectId,
      summary: FAILURE_BLOCKER_SUMMARY,
      now,
    });
    await resolveProjectBlockers(databasePath, {
      projectId,
      summary: TIMEOUT_BLOCKER_SUMMARY,
      now,
    });
    return;
  }

  if (github.status === "timed_out") {
    await recordProjectBlocker(databasePath, {
      id: `native-validation:${projectId}:${github.runId ?? safeId(now)}:timeout`,
      projectId,
      summary: TIMEOUT_BLOCKER_SUMMARY,
      details: github.errorSummary,
      now,
    });
    return;
  }

  if (github.status === "completed" && github.conclusion !== validation.requiredConclusion) {
    await recordProjectBlocker(databasePath, {
      id: `native-validation:${projectId}:${github.runId ?? safeId(now)}:failure`,
      projectId,
      summary: FAILURE_BLOCKER_SUMMARY,
      details: github.errorSummary,
      now,
    });
  }
}

async function writeNativeValidationReports(
  workspaceRoot: string,
  projectId: string,
  report: NativeValidationRequestReport,
): Promise<NativeValidationReportPaths> {
  const reportDir = workspacePath(workspaceRoot, "reports", "native-validation", projectId);
  await mkdir(reportDir, { recursive: true, mode: 0o700 });
  const markdownPath = join(reportDir, "latest.md");
  const jsonPath = join(reportDir, "latest.json");
  const withPaths: NativeValidationRequestReport = {
    ...report,
    reportPaths: {
      markdown: markdownPath,
      json: jsonPath,
    },
  };
  await writeFile(markdownPath, nativeValidationMarkdown(withPaths), { mode: 0o644 });
  await writeFile(jsonPath, `${nativeValidationRequestReportToJson(withPaths)}\n`, { mode: 0o644 });
  return withPaths.reportPaths!;
}

function nativeValidationMarkdown(report: NativeValidationRequestReport): string {
  const lines = [
    `# Native Validation: ${report.project?.displayName ?? "unknown project"}`,
    "",
    `Requested: ${report.requestedAt}`,
    `Checked: ${report.checkedAt}`,
    "",
    "## Workflow",
    "",
    `- Provider: ${report.validation?.provider ?? "unknown"}`,
    `- Workflow: ${report.validation?.workflowId ?? "unknown"}`,
    `- Runner: ${report.validation?.runnerLabel ?? "unknown"}`,
    `- Ref: ${report.validation?.ref ?? "unknown"}`,
    "",
    "## Result",
    "",
    `- Status: ${report.github?.status ?? "unknown"}`,
    `- Conclusion: ${report.github?.conclusion ?? "none"}`,
    `- Run URL: ${report.github?.runUrl ?? "none"}`,
  ];

  if (report.github?.jobs.length) {
    lines.push("", "## Jobs", "");
    for (const job of report.github.jobs) {
      lines.push(`- ${job.name}: ${job.conclusion ? `${job.status}/${job.conclusion}` : job.status}`);
    }
  }

  if (report.github?.errorSummary) {
    lines.push("", "## Failure Summary", "", report.github.errorSummary);
  }

  if (report.blockers.length > 0) {
    lines.push("", "## Blockers", "");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function baseReport(
  options: NativeValidationRequestOptions,
  requestedAt: string,
  checkedAt: string,
  fields: {
    ready?: boolean | undefined;
    blockers?: string[] | undefined;
    project?: NativeValidationProjectSummary | undefined;
    validation?: NativeValidationConfigSummary | undefined;
    github?: NativeValidationGitHubSummary | undefined;
    state?: ExternalValidationRunRecord | undefined;
  },
): NativeValidationRequestReport {
  const report: NativeValidationRequestReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: fields.ready ?? false,
    blockers: fields.blockers ?? [],
    requestedAt,
    checkedAt,
  };
  if (fields.project) {
    report.project = fields.project;
  }
  if (fields.validation) {
    report.validation = fields.validation;
  }
  if (fields.github) {
    report.github = fields.github;
  }
  if (fields.state) {
    report.state = fields.state;
  }
  return report;
}

function branchFromRef(ref: string): string | undefined {
  if (/^[0-9a-f]{40}$/i.test(ref)) {
    return undefined;
  }
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }
  if (ref.startsWith("refs/")) {
    return undefined;
  }
  return ref;
}

async function sleep(sleepImpl: ((milliseconds: number) => Promise<void>) | undefined, milliseconds: number): Promise<void> {
  if (sleepImpl) {
    await sleepImpl(milliseconds);
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function nowIso(options: Pick<NativeValidationRequestOptions, "now">): string {
  return (options.now ?? (() => new Date()))().toISOString();
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

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "");
}

function validateRequiredString(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} requires a value`);
  }
}

type ParseResult =
  | {
      ok: true;
      value: NativeValidationRequestReport;
    }
  | {
      ok: false;
      message: string;
    };

function parseRemoteNativeValidationReport(stdout: string): ParseResult {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "remote native validation returned invalid JSON" };
    }

    const report = parsed as NativeValidationRequestReport;
    if (typeof report.ready !== "boolean" || !Array.isArray(report.blockers)) {
      return { ok: false, message: "remote native validation did not return a report" };
    }

    return {
      ok: true,
      value: report,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `remote native validation returned invalid JSON: ${message}`,
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
