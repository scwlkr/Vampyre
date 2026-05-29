import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import { validateWorkspaceRoot, workspaceRootPrelude } from "../remote/paths.js";
import {
  buildCheckInSummary,
  formatCliCheckInSummary,
  type CheckInSummary,
} from "../checkin/checkInSummary.js";
import {
  initializeOperationalState,
  type OperationalStateOptions,
  type OperationalStateReport,
} from "../state/operationalState.js";

export interface VampyreStatusOptions {
  host: string;
  workspaceRoot: string;
  local?: boolean;
  now?: () => Date;
  runner?: RemoteCommandRunner;
}

export interface VampyreStatusReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  blockers: string[];
  state?: OperationalStateReport;
  checkIn?: CheckInSummary;
  details?: string;
}

export async function runVampyreStatus(options: VampyreStatusOptions): Promise<VampyreStatusReport> {
  validateWorkspaceRoot(options.workspaceRoot);

  if (options.local === true) {
    const stateOptions: OperationalStateOptions = {
      workspaceRoot: options.workspaceRoot,
    };
    if (options.now) {
      stateOptions.now = options.now;
    }
    const state = await initializeOperationalState(stateOptions);

    return {
      host: options.host,
      workspaceRoot: options.workspaceRoot,
      ready: true,
      blockers: [],
      state,
      checkIn: buildCheckInSummary({ state, now: options.now }),
    };
  }

  validateHost(options.host);
  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(`
${workspaceRootPrelude(options.workspaceRoot)}
cli="$root/app/dist/cli.js"
if [ ! -f "$cli" ]; then
  printf 'remote-app-missing:%s\\n' "$cli"
  exit 2
fi
node "$cli" status --local --json --workspace-root "$root"
`);

  if (result.exitCode !== 0) {
    const summary = firstLine(result.stderr) || firstLine(result.stdout) || "remote status command failed";
    const report: VampyreStatusReport = {
      host: options.host,
      workspaceRoot: options.workspaceRoot,
      ready: false,
      blockers: [`Status: ${summary}`],
    };
    const details = summarizeOutput(result);
    if (details) {
      report.details = details;
    }
    return report;
  }

  const state = tryParseRemoteStatus(result.stdout);
  if (!state.ok) {
    return {
      host: options.host,
      workspaceRoot: options.workspaceRoot,
      ready: false,
      blockers: [`Status: ${state.message}`],
      details: result.stdout,
    };
  }

  return {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: true,
    blockers: [],
    state: state.value,
    checkIn: buildCheckInSummary({ state: state.value, now: options.now }),
  };
}

export function formatStatusReport(report: VampyreStatusReport): string {
  const lines: string[] = [
    "Vampyre status",
    `Host: ${report.host}`,
    `Workspace Root: ${report.workspaceRoot}`,
    "",
  ];

  if (!report.state) {
    lines.push("Status: failed");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
    if (report.details) {
      lines.push("", report.details);
    }
    return lines.join("\n");
  }

  const summary = report.checkIn ?? buildCheckInSummary({ state: report.state });
  return formatCliCheckInSummary(summary, {
    host: report.host,
    workspaceRoot: report.workspaceRoot,
  });
}

export function statusReportToJson(report: VampyreStatusReport): string {
  return JSON.stringify(report.state ?? report, null, 2);
}

type RemoteStatusParseResult =
  | {
      ok: true;
      value: OperationalStateReport;
    }
  | {
      ok: false;
      message: string;
    };

function tryParseRemoteStatus(stdout: string): RemoteStatusParseResult {
  try {
    return {
      ok: true,
      value: JSON.parse(stdout) as OperationalStateReport,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `remote status returned invalid JSON: ${message}`,
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
