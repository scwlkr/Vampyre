import { createHash } from "node:crypto";
import {
  beginIdempotentOperation,
  recordIdempotentOperationResult,
  type OperationalStateReport,
  type SchedulerTickRecord,
} from "../state/operationalState.js";
import {
  runReviewRequest,
  type ReviewRequestOptions,
  type ReviewRequestReport,
} from "../github/reviewWorkflow.js";

export type DaemonControlSurfaceStatus = "invoked" | "skipped" | "blocked" | "failed";

export interface DaemonControlSurfaceResult {
  action: "review-request";
  status: DaemonControlSurfaceStatus;
  summary: string;
  projectId?: string;
  idempotencyKey?: string;
  issueUrl?: string | undefined;
  blockers?: string[] | undefined;
}

export interface DaemonControlSurfaceOptions {
  state: OperationalStateReport;
  schedulerTick: SchedulerTickRecord;
  workspaceRoot?: string;
  now?: () => Date;
  runReviewRequest?: (options: ReviewRequestOptions) => Promise<ReviewRequestReport>;
}

const DAEMON_REVIEW_OPERATION = "daemon-review-request";

export async function runDaemonControlSurface(
  options: DaemonControlSurfaceOptions,
): Promise<DaemonControlSurfaceResult> {
  const selectedProjectId = options.schedulerTick.selectedProjectId;
  if (!selectedProjectId) {
    return {
      action: "review-request",
      status: "skipped",
      summary: "Scheduler selected no project; control surface is idle",
    };
  }

  const project = options.state.projects.find((candidate) => candidate.id === selectedProjectId);
  if (!project) {
    return {
      action: "review-request",
      status: "blocked",
      projectId: selectedProjectId,
      summary: `Scheduler selected missing project ${selectedProjectId}`,
      blockers: [`Scheduler: selected project ${selectedProjectId} is missing from the Project Registry`],
    };
  }

  const idempotencyKey = `${DAEMON_REVIEW_OPERATION}:${project.id}`;
  const now = options.now?.() ?? new Date();
  const operation = await beginIdempotentOperation(options.state.databasePath, {
    idempotencyKey,
    operation: DAEMON_REVIEW_OPERATION,
    projectId: project.id,
    requestHash: controlSurfaceRequestHash({
      action: "review-request",
      projectId: project.id,
    }),
    now: now.toISOString(),
  });

  if (operation.status === "completed") {
    return {
      action: "review-request",
      status: "skipped",
      projectId: project.id,
      idempotencyKey,
      issueUrl: issueUrlFromResponseJson(operation.responseJson),
      summary: `Daemon review request already completed for ${project.displayName}`,
    };
  }

  const runner = options.runReviewRequest ?? runReviewRequest;
  let report: ReviewRequestReport;
  try {
    report = await runner({
      host: "local",
      workspaceRoot: options.workspaceRoot ?? options.state.workspaceRoot,
      local: true,
      now: options.now,
    });
  } catch (error) {
    const message = sanitizeDaemonError(error);
    await recordIdempotentOperationResult(options.state.databasePath, {
      idempotencyKey,
      status: "failed",
      responseJson: JSON.stringify({ error: message }),
      now: (options.now?.() ?? new Date()).toISOString(),
    });
    return {
      action: "review-request",
      status: "failed",
      projectId: project.id,
      idempotencyKey,
      summary: `Daemon review request failed for ${project.displayName}`,
      blockers: [`Review request: ${message}`],
    };
  }

  const idempotencyStatus = report.ready || report.github ? "completed" : "failed";
  await recordIdempotentOperationResult(options.state.databasePath, {
    idempotencyKey,
    status: idempotencyStatus,
    responseJson: JSON.stringify(report),
    now: (options.now?.() ?? new Date()).toISOString(),
  });

  return reviewReportToControlSurfaceResult({
    report,
    projectId: project.id,
    projectName: project.displayName,
    idempotencyKey,
  });
}

function reviewReportToControlSurfaceResult(options: {
  report: ReviewRequestReport;
  projectId: string;
  projectName: string;
  idempotencyKey: string;
}): DaemonControlSurfaceResult {
  const base = {
    action: "review-request" as const,
    projectId: options.projectId,
    idempotencyKey: options.idempotencyKey,
    issueUrl: options.report.github?.issueUrl,
  };

  if (options.report.ready) {
    return {
      ...base,
      status: "invoked",
      summary: `Daemon review request completed for ${options.projectName}`,
    };
  }

  if (options.report.github) {
    return {
      ...base,
      status: "blocked",
      summary: `GitHub review record exists for ${options.projectName}, but notification or completion is blocked`,
      blockers: options.report.blockers,
    };
  }

  return {
    ...base,
    status: "failed",
    summary: `Daemon review request failed before creating a GitHub review record for ${options.projectName}`,
    blockers: options.report.blockers,
  };
}

function controlSurfaceRequestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function issueUrlFromResponseJson(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const github = (parsed as Record<string, unknown>)["github"];
    if (!github || typeof github !== "object" || Array.isArray(github)) {
      return undefined;
    }

    const issueUrl = (github as Record<string, unknown>)["issueUrl"];
    return typeof issueUrl === "string" && issueUrl.length > 0 ? issueUrl : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeDaemonError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);

  for (const key of ["GITHUB_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    const value = process.env[key]?.trim();
    if (value) {
      message = message.replaceAll(value, "[redacted]");
    }
  }

  return message.replace(/bot[A-Za-z0-9:_-]+\/sendMessage/g, "bot[redacted]/sendMessage");
}
