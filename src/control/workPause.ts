import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import { shellQuote, validateWorkspaceRoot, workspaceRootPrelude } from "../remote/paths.js";
import {
  clearWorkPauseState,
  initializeOperationalState,
  readActiveBuildAgentLock,
  setWorkPauseState,
  type ActiveBuildAgentLockSnapshot,
  type OperationalStateOptions,
  type OperationalStateReport,
  type WorkPauseRuntimeStatus,
} from "../state/operationalState.js";

export type WorkPauseAction = "pause" | "resume" | "status";
export type WorkPauseDuration = "1m" | "1h" | "1d";

export interface WorkPauseCommandOptions {
  action: WorkPauseAction;
  host: string;
  workspaceRoot: string;
  duration?: WorkPauseDuration | undefined;
  reason?: string | undefined;
  local?: boolean | undefined;
  json?: boolean | undefined;
  source?: string | undefined;
  now?: (() => Date) | undefined;
  runner?: RemoteCommandRunner | undefined;
  initializeState?: ((options: OperationalStateOptions) => Promise<OperationalStateReport>) | undefined;
}

export interface WorkPauseCommandReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  action: WorkPauseAction;
  summary: string;
  blockers: string[];
  workPause: WorkPauseRuntimeStatus;
  activeBuildAgentLock: ActiveBuildAgentLockSnapshot;
  details?: string | undefined;
}

export function isWorkPauseDuration(value: string): value is WorkPauseDuration {
  return value === "1m" || value === "1h" || value === "1d";
}

export async function runWorkPauseCommand(options: WorkPauseCommandOptions): Promise<WorkPauseCommandReport> {
  validateWorkspaceRoot(options.workspaceRoot);

  if (options.local === true) {
    return runLocalWorkPauseCommand(options);
  }

  validateHost(options.host);
  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(workPauseRemoteCommand(options));
  const parsed = parseRemoteWorkPauseReport(result.stdout);

  if (parsed.ok) {
    return {
      ...parsed.value,
      host: options.host,
      workspaceRoot: options.workspaceRoot,
    };
  }

  const summary = firstLine(result.stderr) || parsed.message || firstLine(result.stdout) || "remote pause command failed";
  const report: WorkPauseCommandReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    action: options.action,
    summary,
    blockers: [`Work Pause: ${summary}`],
    workPause: { active: false },
    activeBuildAgentLock: { held: false },
  };
  const details = summarizeOutput(result);
  if (details) {
    report.details = details;
  }
  return report;
}

export function formatWorkPauseReport(report: WorkPauseCommandReport): string {
  const lines: string[] = [
    "Vampyre Work Pause",
    `Host: ${report.host}`,
    `Workspace Root: ${report.workspaceRoot}`,
    `Action: ${report.action}`,
    `Status: ${report.ready ? "ready" : "failed"}`,
    `Summary: ${report.summary}`,
    `Work Pause: ${formatWorkPause(report.workPause)}`,
    `Active Build Agent: ${formatActiveBuildAgent(report.activeBuildAgentLock)}`,
  ];

  if (report.blockers.length > 0) {
    lines.push("", "Blockers:");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  if (report.details) {
    lines.push("", report.details);
  }

  return lines.join("\n");
}

export function workPauseCommandReportToJson(report: WorkPauseCommandReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatWorkPauseConfirmation(report: WorkPauseCommandReport): string {
  return [
    report.summary,
    `Work Pause: ${formatWorkPause(report.workPause)}`,
    `Active Agent: ${formatActiveBuildAgent(report.activeBuildAgentLock)}`,
  ].join("\n");
}

async function runLocalWorkPauseCommand(options: WorkPauseCommandOptions): Promise<WorkPauseCommandReport> {
  const now = options.now ?? (() => new Date());
  const initializeState = options.initializeState ?? initializeOperationalState;
  let state = await initializeState({
    workspaceRoot: options.workspaceRoot,
    now,
  });

  if (options.action === "pause") {
    if (!options.duration) {
      return failureReport(options, state, "pause duration is required");
    }

    const createdAt = now();
    await setWorkPauseState(state.databasePath, {
      pausedUntil: new Date(createdAt.getTime() + durationMs(options.duration)).toISOString(),
      source: options.source ?? "cli",
      createdAt: createdAt.toISOString(),
      reason: options.reason,
    });
    state = await initializeState({
      workspaceRoot: options.workspaceRoot,
      now,
    });
  }

  if (options.action === "resume") {
    await clearWorkPauseState(state.databasePath);
    state = await initializeState({
      workspaceRoot: options.workspaceRoot,
      now,
    });
  }

  const activeBuildAgentLock = await readActiveBuildAgentLock(state.databasePath);
  const workPause = state.workPause ?? { active: false };
  return {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: true,
    action: options.action,
    summary: summaryForAction(options.action, workPause, activeBuildAgentLock),
    blockers: [],
    workPause,
    activeBuildAgentLock,
  };
}

function failureReport(
  options: WorkPauseCommandOptions,
  state: OperationalStateReport,
  message: string,
): WorkPauseCommandReport {
  return {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    action: options.action,
    summary: message,
    blockers: [`Work Pause: ${message}`],
    workPause: state.workPause ?? { active: false },
    activeBuildAgentLock: { held: false },
  };
}

function summaryForAction(
  action: WorkPauseAction,
  workPause: WorkPauseRuntimeStatus,
  activeBuildAgentLock: ActiveBuildAgentLockSnapshot,
): string {
  if (action === "pause") {
    const activeAgent = activeBuildAgentLock.held ? " An active Build Agent is already running and will finish." : "";
    return `Work Pause active until ${workPause.pausedUntil ?? "unknown"}.${activeAgent}`;
  }

  if (action === "resume") {
    return "Work Pause cleared; future scheduler ticks may select eligible project-changing work.";
  }

  if (workPause.active) {
    return `Work Pause is active until ${workPause.pausedUntil ?? "unknown"}.`;
  }

  return "Work Pause is not active.";
}

function durationMs(duration: WorkPauseDuration): number {
  if (duration === "1m") {
    return 60 * 1000;
  }
  if (duration === "1h") {
    return 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

function workPauseRemoteCommand(options: WorkPauseCommandOptions): string {
  const args = options.action === "resume" ? ["resume"] : ["pause", options.action === "status" ? "status" : options.duration];
  const cliArgs = args.filter((arg): arg is string => typeof arg === "string");
  cliArgs.push("--local", "--json", "--workspace-root", "$root");
  if (options.reason && options.action === "pause") {
    cliArgs.push("--reason", options.reason);
  }

  return `
${workspaceRootPrelude(options.workspaceRoot)}
cli="$root/app/dist/cli.js"
if [ ! -f "$cli" ]; then
  printf 'remote-app-missing:%s\\n' "$cli"
  exit 2
fi
node "$cli" ${cliArgs.map((arg) => (arg === "$root" ? '"$root"' : shellQuote(arg))).join(" ")}
`;
}

type RemoteWorkPauseParseResult =
  | {
      ok: true;
      value: WorkPauseCommandReport;
    }
  | {
      ok: false;
      message: string;
    };

function parseRemoteWorkPauseReport(stdout: string): RemoteWorkPauseParseResult {
  try {
    return {
      ok: true,
      value: JSON.parse(stdout) as WorkPauseCommandReport,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `remote pause returned invalid JSON: ${message}`,
    };
  }
}

function formatWorkPause(workPause: WorkPauseRuntimeStatus): string {
  if (workPause.active) {
    const parts = [`active until ${workPause.pausedUntil ?? "unknown"}`];
    if (workPause.source) {
      parts.push(`source ${workPause.source}`);
    }
    if (workPause.reason) {
      parts.push(`reason ${workPause.reason}`);
    }
    return parts.join("; ");
  }

  if (workPause.expired) {
    return `expired at ${workPause.pausedUntil ?? "unknown"}`;
  }

  return "not paused";
}

function formatActiveBuildAgent(lock: ActiveBuildAgentLockSnapshot): string {
  if (!lock.held) {
    return "available";
  }

  const parts = ["held"];
  if (lock.projectId) {
    parts.push(`project ${lock.projectId}`);
  }
  if (lock.runJournalId) {
    parts.push(`run ${lock.runJournalId}`);
  }
  return parts.join("; ");
}

function summarizeOutput(result: { stdout: string; stderr: string }): string | undefined {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return output.length > 0 ? output : undefined;
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
