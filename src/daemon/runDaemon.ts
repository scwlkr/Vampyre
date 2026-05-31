import {
  runBuildAgent,
  type BuildAgentRunOptions,
  type BuildAgentRunReport,
} from "../agent/buildAgent.js";
import {
  initializeOperationalState,
  type OperationalStateReport,
  type ProjectRuntimeStatus,
  type SchedulerTickRecord,
} from "../state/operationalState.js";
import { DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY, runSchedulerTick } from "../scheduler/scheduler.js";
import {
  runTelegramOperationalCommands,
  type TelegramOperationalCommandOptions,
  type TelegramOperationalCommandResult,
} from "../telegram/commands.js";
import { DEFAULT_RUNTIME_POLICY, parseDurationMs } from "../config/runtimePolicy.js";
import {
  runDaemonControlSurface,
  type DaemonControlSurfaceResult,
} from "./controlSurface.js";
import { shellQuote, workspacePath } from "../remote/paths.js";

interface DaemonRuntimeOptions {
  workspaceRoot: string;
  now?: () => Date;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  initializeState?: (workspaceRoot: string) => Promise<OperationalStateReport>;
  runSchedulerTick?: typeof runSchedulerTick;
  runControlSurface?: typeof runDaemonControlSurface;
  runBuildAgent?: DaemonBuildAgentRunner;
  runTelegramCommands?: DaemonTelegramCommandRunner;
}

export interface DaemonTickResult {
  state: OperationalStateReport;
  telegramResult: TelegramOperationalCommandResult;
  schedulerTick: SchedulerTickRecord;
  controlSurfaceResult: DaemonControlSurfaceResult;
  buildAgentResult: DaemonBuildAgentResult;
}

type DaemonBuildAgentRunner = (options: BuildAgentRunOptions) => Promise<BuildAgentRunReport>;
type DaemonTelegramCommandRunner = (
  options: TelegramOperationalCommandOptions,
) => Promise<TelegramOperationalCommandResult>;

export type DaemonBuildAgentStatus = "invoked" | "skipped" | "blocked" | "failed";

export interface DaemonBuildAgentResult {
  action: "build-agent-run";
  status: DaemonBuildAgentStatus;
  summary: string;
  projectId?: string | undefined;
  runJournalId?: string | undefined;
  reportMarkdown?: string | undefined;
  blockers?: string[] | undefined;
}

export function createHeartbeatPayload(
  workspaceRoot: string,
  now = new Date(),
  state?: OperationalStateReport,
  schedulerTick?: SchedulerTickRecord,
  controlSurface?: DaemonControlSurfaceResult,
  buildAgent?: DaemonBuildAgentResult,
  telegramCommands?: TelegramOperationalCommandResult,
): string {
  const payload: Record<string, unknown> = {
    event: "heartbeat",
    component: "vampyre-daemon",
    workspaceRoot,
    scheduler: schedulerTick ? "ready" : "not-started",
    agent: buildAgent ? buildAgent.status : "not-started",
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

  if (buildAgent) {
    payload["agentAction"] = buildAgent.action;
    if (buildAgent.projectId) {
      payload["agentProjectId"] = buildAgent.projectId;
    }
    if (buildAgent.runJournalId) {
      payload["agentRunJournalId"] = buildAgent.runJournalId;
    }
    if (buildAgent.reportMarkdown) {
      payload["agentReportMarkdown"] = buildAgent.reportMarkdown;
    }
    if (buildAgent.blockers) {
      payload["agentBlockerCount"] = buildAgent.blockers.length;
    }
  }

  if (telegramCommands) {
    payload["telegramCommands"] = telegramCommands.status;
    payload["telegramCommandProcessedUpdateCount"] = telegramCommands.processedUpdateCount;
    payload["telegramCommandSentMessageCount"] = telegramCommands.sentMessageCount;
    if (telegramCommands.blockers) {
      payload["telegramCommandBlockerCount"] = telegramCommands.blockers.length;
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
  runBuildAgent?: DaemonBuildAgentRunner;
  runTelegramCommands?: DaemonTelegramCommandRunner;
}): Promise<DaemonTickResult> {
  const schedulerRunner = options.runSchedulerTick ?? runSchedulerTick;
  const controlSurfaceRunner = options.runControlSurface ?? runDaemonControlSurface;
  const buildAgentRunner = options.runBuildAgent ?? runBuildAgent;
  const telegramRunner = options.runTelegramCommands ?? runTelegramOperationalCommands;
  let state = options.state;
  let telegramResult: TelegramOperationalCommandResult;

  try {
    telegramResult = await telegramRunner({
      state,
      workspaceRoot: options.workspaceRoot,
      now: () => options.now,
    });
    if (telegramResult.stateChanged) {
      state = await initializeOperationalState({
        workspaceRoot: options.workspaceRoot,
        now: () => options.now,
      });
    }
  } catch (error) {
    const message = sanitizeDaemonError(error);
    telegramResult = {
      status: "failed",
      summary: "Telegram operational command polling failed",
      processedUpdateCount: 0,
      sentMessageCount: 0,
      stateChanged: false,
      blockers: [`Telegram commands: ${message}`],
    };
  }

  const schedulerTick = await schedulerRunner({
    state,
    now: () => options.now,
  });

  let controlSurfaceResult: DaemonControlSurfaceResult;
  try {
    controlSurfaceResult = await controlSurfaceRunner({
      state,
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

  const buildAgentResult = await runDaemonBuildAgent({
    state,
    schedulerTick,
    workspaceRoot: options.workspaceRoot,
    now: options.now,
    runBuildAgent: buildAgentRunner,
  });

  return {
    state,
    telegramResult,
    schedulerTick,
    controlSurfaceResult,
    buildAgentResult,
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
  const runBuildAgentFn = options.runBuildAgent ?? runBuildAgent;
  const runTelegramCommands = options.runTelegramCommands ?? runTelegramOperationalCommands;
  const initializeState =
    options.initializeState ??
    ((root: string): Promise<OperationalStateReport> =>
      initializeOperationalState({
        workspaceRoot: root,
        now,
      }));
  let state = await initializeState(workspaceRoot);
  let schedulerTick: SchedulerTickRecord | undefined;
  let controlSurfaceResult: DaemonControlSurfaceResult | undefined;
  let buildAgentResult: DaemonBuildAgentResult | undefined;
  let telegramResult: TelegramOperationalCommandResult | undefined;
  let schedulerRunning = false;

  async function writeHeartbeat(): Promise<void> {
    if (schedulerRunning) {
      return;
    }

    schedulerRunning = true;
    const tickNow = now();
    try {
      state = await initializeState(workspaceRoot);
      const tick = await runDaemonTick({
        workspaceRoot,
        state,
        now: tickNow,
        runSchedulerTick: runSchedulerTickFn,
        runControlSurface,
        runBuildAgent: runBuildAgentFn,
        runTelegramCommands,
      });
      state = tick.state;
      telegramResult = tick.telegramResult;
      schedulerTick = tick.schedulerTick;
      controlSurfaceResult = tick.controlSurfaceResult;
      buildAgentResult = tick.buildAgentResult;
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

    stdout.write(
      `${createHeartbeatPayload(
        workspaceRoot,
        tickNow,
        state,
        schedulerTick,
        controlSurfaceResult,
        buildAgentResult,
        telegramResult,
      )}\n`,
    );
  }

  await writeHeartbeat();

  await new Promise<void>((resolve) => {
    const heartbeatIntervalMs = parseDurationMs(
      state.runtimePolicy?.runtime.heartbeatInterval ?? DEFAULT_RUNTIME_POLICY.runtime.heartbeatInterval,
      "runtimePolicy.runtime.heartbeatInterval",
    );
    const interval = setIntervalFn(() => {
      void writeHeartbeat();
    }, heartbeatIntervalMs);

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

async function runDaemonBuildAgent(options: {
  state: OperationalStateReport;
  schedulerTick: SchedulerTickRecord;
  workspaceRoot: string;
  now: Date;
  runBuildAgent: DaemonBuildAgentRunner;
}): Promise<DaemonBuildAgentResult> {
  const selectedProjectId = options.schedulerTick.selectedProjectId;
  if (!selectedProjectId) {
    return {
      action: "build-agent-run",
      status: "skipped",
      summary: "Scheduler selected no project; build agent is idle",
    };
  }

  const project = options.state.projects.find((candidate) => candidate.id === selectedProjectId);
  if (!project) {
    return {
      action: "build-agent-run",
      status: "blocked",
      projectId: selectedProjectId,
      summary: `Scheduler selected missing project ${selectedProjectId}`,
      blockers: [`Scheduler: selected project ${selectedProjectId} is missing from the Project Registry`],
    };
  }

  if (options.state.runtimePolicy?.buildAgent.autoRunSelectedProjects === false) {
    return {
      action: "build-agent-run",
      status: "skipped",
      projectId: project.id,
      summary: "Runtime Policy disabled automatic Build Agent launches for selected projects",
    };
  }

  const decision = options.schedulerTick.decisions.find((candidate) => candidate.projectId === selectedProjectId);
  if (decision?.decision !== "selected") {
    return {
      action: "build-agent-run",
      status: "skipped",
      projectId: selectedProjectId,
      summary: `Scheduler did not mark ${project.displayName} as eligible for a Build Agent run`,
    };
  }

  try {
    const agentOptions: BuildAgentRunOptions = {
      host: "local",
      workspaceRoot: options.workspaceRoot,
      local: true,
      projectId: project.id,
      now: () => options.now,
    };
    const task = selectDaemonAutoSafeTask(project);
    if (task && !usesContinuousProductLoop(project)) {
      agentOptions.task = task;
    }
    const workerCommand = selectDaemonWorkerCommand(project, options.workspaceRoot, options.state);
    if (workerCommand) {
      agentOptions.workerCommand = workerCommand;
    }

    const report = await options.runBuildAgent(agentOptions);

    return buildAgentReportToDaemonResult(report, project.id);
  } catch (error) {
    const message = sanitizeDaemonError(error);
    return {
      action: "build-agent-run",
      status: "failed",
      projectId: project.id,
      summary: `Build Agent invocation failed for ${project.displayName}`,
      blockers: [`Build Agent: ${message}`],
    };
  }
}

function selectDaemonAutoSafeTask(project: ProjectRuntimeStatus): string | undefined {
  return project.autoSafeTasks?.find((task) => task.trim().length > 0)?.trim();
}

function selectDaemonWorkerCommand(
  project: ProjectRuntimeStatus,
  workspaceRoot: string,
  state: OperationalStateReport,
): string | undefined {
  if (!usesContinuousProductLoop(project)) {
    return undefined;
  }

  const codexPath = workspacePath(workspaceRoot, "artifacts", "npm-global", "node_modules", ".bin", "codex");
  const workerPolicy = state.runtimePolicy?.buildAgent.worker ?? DEFAULT_RUNTIME_POLICY.buildAgent.worker;
  const model = process.env["VAMPYRE_CODEX_MODEL"]?.trim() || workerPolicy.model;
  const reasoningEffort = process.env["VAMPYRE_CODEX_REASONING_EFFORT"]?.trim() || workerPolicy.reasoningEffort;

  return [
    shellQuote(codexPath),
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    "-m",
    shellQuote(model),
    "-c",
    shellQuote(`model_reasoning_effort=${reasoningEffort}`),
    "--cd",
    '"$VAMPYRE_WORKTREE_PATH"',
    "--output-last-message",
    '"$VAMPYRE_REPORT_DIR/$VAMPYRE_RUN_JOURNAL_ID-codex-final.txt"',
    '"$(cat "$VAMPYRE_TASK_CONTEXT_PATH")"',
  ].join(" ");
}

function usesContinuousProductLoop(project: ProjectRuntimeStatus): boolean {
  return project.autonomyPolicy === DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY;
}

function buildAgentReportToDaemonResult(report: BuildAgentRunReport, fallbackProjectId: string): DaemonBuildAgentResult {
  const status: DaemonBuildAgentStatus = report.ready ? "invoked" : "blocked";
  const summary = report.runJournal?.summary ?? report.blockers[0] ?? "Build Agent run completed without a Run Journal";
  const result: DaemonBuildAgentResult = {
    action: "build-agent-run",
    status,
    summary,
    projectId: report.project?.id ?? fallbackProjectId,
  };

  if (report.runJournal?.id) {
    result.runJournalId = report.runJournal.id;
  }
  if (report.reportPaths?.markdown) {
    result.reportMarkdown = report.reportPaths.markdown;
  }
  if (report.blockers.length > 0) {
    result.blockers = report.blockers;
  }

  return result;
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

if (import.meta.url === `file://${process.argv[1]}`) {
  await runForegroundDaemon({
    workspaceRoot: process.env["VAMPYRE_WORKSPACE_ROOT"] ?? "/home/wlkrlab/vampyre",
  });
}
