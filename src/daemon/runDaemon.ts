import {
  initializeOperationalState,
  type OperationalStateReport,
  type SchedulerTickRecord,
} from "../state/operationalState.js";
import { runSchedulerTick } from "../scheduler/scheduler.js";
import {
  runDaemonControlSurface,
  type DaemonControlSurfaceResult,
} from "./controlSurface.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface DaemonRuntimeOptions {
  workspaceRoot: string;
  now?: () => Date;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  initializeState?: (workspaceRoot: string) => Promise<OperationalStateReport>;
  runSchedulerTick?: typeof runSchedulerTick;
  runControlSurface?: typeof runDaemonControlSurface;
}

export interface DaemonTickResult {
  schedulerTick: SchedulerTickRecord;
  controlSurfaceResult: DaemonControlSurfaceResult;
}

export function createHeartbeatPayload(
  workspaceRoot: string,
  now = new Date(),
  state?: OperationalStateReport,
  schedulerTick?: SchedulerTickRecord,
  controlSurface?: DaemonControlSurfaceResult,
): string {
  const payload: Record<string, unknown> = {
    event: "heartbeat",
    component: "vampyre-daemon",
    workspaceRoot,
    scheduler: schedulerTick ? "ready" : "not-started",
    agent: "not-started",
    at: now.toISOString(),
  };

  if (state) {
    payload["operationalState"] = "ready";
    payload["projectCount"] = state.projects.length;
    payload["databasePath"] = state.databasePath;
    payload["registryPath"] = state.registryPath;
  }

  if (schedulerTick) {
    payload["budgetMode"] = schedulerTick.budgetMode;
    payload["activeBuildAgentLock"] = schedulerTick.activeBuildAgentLock;
    payload["selectedProjectId"] = schedulerTick.selectedProjectId ?? null;
    payload["schedulerDecisionCount"] = schedulerTick.decisions.length;
  }

  if (controlSurface) {
    payload["controlSurface"] = controlSurface.status;
    payload["controlSurfaceAction"] = controlSurface.action;
    if (controlSurface.projectId) {
      payload["controlSurfaceProjectId"] = controlSurface.projectId;
    }
    if (controlSurface.issueUrl) {
      payload["controlSurfaceIssueUrl"] = controlSurface.issueUrl;
    }
    if (controlSurface.blockers) {
      payload["controlSurfaceBlockerCount"] = controlSurface.blockers.length;
    }
  }

  return JSON.stringify(payload);
}

export async function runDaemonTick(options: {
  workspaceRoot: string;
  state: OperationalStateReport;
  now: Date;
  runSchedulerTick?: typeof runSchedulerTick;
  runControlSurface?: typeof runDaemonControlSurface;
}): Promise<DaemonTickResult> {
  const schedulerRunner = options.runSchedulerTick ?? runSchedulerTick;
  const controlSurfaceRunner = options.runControlSurface ?? runDaemonControlSurface;
  const schedulerTick = await schedulerRunner({
    state: options.state,
    now: () => options.now,
  });

  let controlSurfaceResult: DaemonControlSurfaceResult;
  try {
    controlSurfaceResult = await controlSurfaceRunner({
      state: options.state,
      schedulerTick,
      workspaceRoot: options.workspaceRoot,
      now: () => options.now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    controlSurfaceResult = {
      action: "review-request",
      status: "failed",
      summary: "Daemon control surface failed after scheduler tick",
      blockers: [`Control surface: ${message}`],
    };
  }

  return {
    schedulerTick,
    controlSurfaceResult,
  };
}

export async function runForegroundDaemon(options: DaemonRuntimeOptions): Promise<void> {
  const workspaceRoot = options.workspaceRoot;
  const now = options.now ?? (() => new Date());
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const stdout = options.stdout ?? process.stdout;
  const runSchedulerTickFn = options.runSchedulerTick ?? runSchedulerTick;
  const runControlSurface = options.runControlSurface ?? runDaemonControlSurface;
  const initializeState =
    options.initializeState ??
    ((root: string): Promise<OperationalStateReport> =>
      initializeOperationalState({
        workspaceRoot: root,
        now,
      }));
  const state = await initializeState(workspaceRoot);
  let schedulerTick: SchedulerTickRecord | undefined;
  let controlSurfaceResult: DaemonControlSurfaceResult | undefined;
  let schedulerRunning = false;

  async function writeHeartbeat(): Promise<void> {
    if (schedulerRunning) {
      return;
    }

    schedulerRunning = true;
    const tickNow = now();
    try {
      const tick = await runDaemonTick({
        workspaceRoot,
        state,
        now: tickNow,
        runSchedulerTick: runSchedulerTickFn,
        runControlSurface,
      });
      schedulerTick = tick.schedulerTick;
      controlSurfaceResult = tick.controlSurfaceResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stdout.write(
        `${JSON.stringify({
          event: "scheduler-error",
          component: "vampyre-daemon",
          workspaceRoot,
          message,
          at: tickNow.toISOString(),
        })}\n`,
      );
    } finally {
      schedulerRunning = false;
    }

    stdout.write(`${createHeartbeatPayload(workspaceRoot, tickNow, state, schedulerTick, controlSurfaceResult)}\n`);
  }

  await writeHeartbeat();

  await new Promise<void>((resolve) => {
    const interval = setIntervalFn(() => {
      void writeHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    const stop = (): void => {
      clearIntervalFn(interval);
      stdout.write(
        `${JSON.stringify({
          event: "shutdown",
          component: "vampyre-daemon",
          workspaceRoot,
          at: now().toISOString(),
        })}\n`,
      );
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runForegroundDaemon({
    workspaceRoot: process.env["VAMPYRE_WORKSPACE_ROOT"] ?? "/home/wlkrlab/vampyre",
  });
}
