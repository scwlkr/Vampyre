import {
  readActiveBuildAgentLock,
  recordSchedulerTick,
  type ActiveBuildAgentLockSnapshot,
  type CodexBudgetUsageSummary,
  type OperationalStateReport,
  type ProjectRuntimeStatus,
  type SchedulerBudgetMode,
  type SchedulerDecisionRecord,
  type SchedulerTickRecord,
  type WorkPauseRuntimeStatus,
} from "../state/operationalState.js";
import { codexRemainingPercentFromUsage, readCodexBudgetUsageSummary } from "../budget/codexUsage.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY = "continuous-product-loop-direct-main";
export const DEFAULT_CONSERVATIVE_PRODUCT_LOOP_MIN_INTERVAL_MS = 60 * 60 * 1000;

export interface BudgetSnapshot {
  provider: string;
  checkedAt: string;
  mode?: SchedulerBudgetMode;
  remainingPercent?: number;
  unavailable?: boolean;
  codexUsage?: CodexBudgetUsageSummary;
}

export interface BudgetProvider {
  name: string;
  readBudget(now: Date): Promise<BudgetSnapshot> | BudgetSnapshot;
}

export interface SchedulerTickOptions {
  state: OperationalStateReport;
  now?: () => Date;
  budgetProvider?: BudgetProvider;
  activeBuildAgentLock?: ActiveBuildAgentLockSnapshot;
  conservativeProductLoopMinIntervalMs?: number;
  recordTick?: (databasePath: string, record: SchedulerTickRecord) => Promise<void>;
}

export const codexBudgetProvider: BudgetProvider = {
  name: "codex",
  async readBudget(now: Date): Promise<BudgetSnapshot> {
    const codexUsage = await readCodexBudgetUsageSummary({ now });
    if (codexUsage) {
      const remainingPercent = codexRemainingPercentFromUsage(codexUsage);
      const snapshot: BudgetSnapshot = {
        provider: "codex",
        checkedAt: now.toISOString(),
        codexUsage,
      };
      if (remainingPercent === undefined) {
        snapshot.unavailable = true;
      } else {
        snapshot.remainingPercent = remainingPercent;
      }
      return snapshot;
    }

    return {
      provider: "codex",
      checkedAt: now.toISOString(),
      unavailable: true,
    };
  },
};

export async function runSchedulerTick(options: SchedulerTickOptions): Promise<SchedulerTickRecord> {
  const now = options.now?.() ?? new Date();
  const budgetProvider = options.budgetProvider ?? codexBudgetProvider;
  const budgetSnapshot = await budgetProvider.readBudget(now);
  const activeBuildAgentLock =
    options.activeBuildAgentLock ?? (await readActiveBuildAgentLock(options.state.databasePath));

  const tick = planSchedulerTick({
    projects: options.state.projects,
    now,
    budgetSnapshot,
    activeBuildAgentLock,
    workPause: options.state.workPause,
    conservativeProductLoopMinIntervalMs: options.conservativeProductLoopMinIntervalMs,
  });

  const writeTick = options.recordTick ?? recordSchedulerTick;
  await writeTick(options.state.databasePath, tick);

  return tick;
}

export function planSchedulerTick(options: {
  projects: ProjectRuntimeStatus[];
  now: Date;
  budgetSnapshot: BudgetSnapshot;
  activeBuildAgentLock: ActiveBuildAgentLockSnapshot;
  workPause?: WorkPauseRuntimeStatus | undefined;
  conservativeProductLoopMinIntervalMs?: number | undefined;
}): SchedulerTickRecord {
  const budgetMode = calculateBudgetMode(options.budgetSnapshot);
  const activeBuildAgentLock = options.activeBuildAgentLock.held ? "held" : "available";
  const decisions: SchedulerDecisionRecord[] = [];
  let selectedProjectId: string | undefined;

  for (const project of options.projects) {
    const deferReason = projectDeferReason({
      project,
      now: options.now,
      budgetMode,
      activeBuildAgentLock,
      workPause: options.workPause,
      conservativeProductLoopMinIntervalMs: options.conservativeProductLoopMinIntervalMs,
    });

    if (deferReason) {
      decisions.push(deferred(project, deferReason));
      continue;
    }

    if (selectedProjectId) {
      decisions.push(deferred(project, "active-build-agent-limit"));
      continue;
    }

    selectedProjectId = project.id;
    decisions.push({
      projectId: project.id,
      displayName: project.displayName,
      decision: "selected",
      reason: "eligible",
    });
  }

  const tick: SchedulerTickRecord = {
    tickedAt: options.now.toISOString(),
    budgetProvider: options.budgetSnapshot.provider,
    budgetMode,
    activeBuildAgentLock,
    decisions,
  };

  if (options.budgetSnapshot.codexUsage) {
    tick.codexUsage = options.budgetSnapshot.codexUsage;
  }

  if (selectedProjectId) {
    tick.selectedProjectId = selectedProjectId;
  }

  return tick;
}

export function calculateBudgetMode(snapshot: BudgetSnapshot): SchedulerBudgetMode {
  if (snapshot.mode) {
    return snapshot.mode;
  }

  if (snapshot.unavailable === true || snapshot.remainingPercent === undefined) {
    return "conservative";
  }

  if (snapshot.remainingPercent <= 0) {
    return "exhausted";
  }

  if (snapshot.remainingPercent <= 10) {
    return "critical";
  }

  if (snapshot.remainingPercent <= 30) {
    return "conservative";
  }

  return "normal";
}

function projectDeferReason(options: {
  project: ProjectRuntimeStatus;
  now: Date;
  budgetMode: SchedulerBudgetMode;
  activeBuildAgentLock: "available" | "held";
  workPause?: WorkPauseRuntimeStatus | undefined;
  conservativeProductLoopMinIntervalMs?: number | undefined;
}): string | undefined {
  if (options.workPause?.active === true) {
    return "work-paused";
  }

  if (options.project.paused) {
    return "project-paused";
  }

  if (options.project.openBlockerCount > 0) {
    return "project-blocked";
  }

  const cadenceReason = cadenceDeferReason(options.project, options.now);
  if (cadenceReason) {
    return cadenceReason;
  }

  if (options.budgetMode === "exhausted") {
    return "budget-exhausted";
  }

  if (options.budgetMode === "critical") {
    return "budget-critical";
  }

  const throttleReason = conservativeProductLoopThrottleReason({
    project: options.project,
    now: options.now,
    budgetMode: options.budgetMode,
    conservativeProductLoopMinIntervalMs: options.conservativeProductLoopMinIntervalMs,
  });
  if (throttleReason) {
    return throttleReason;
  }

  if (
    options.budgetMode === "conservative" &&
    options.project.mode === "builder" &&
    options.project.autonomyPolicy !== DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY
  ) {
    return "budget-conservative-builder-deferred";
  }

  if (options.activeBuildAgentLock === "held") {
    return "active-build-agent-lock-held";
  }

  return undefined;
}

function cadenceDeferReason(project: ProjectRuntimeStatus, now: Date): string | undefined {
  if (project.autonomyPolicy === DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY) {
    return undefined;
  }

  const intervalMs = cadenceIntervalMs(project.cadence);
  if (intervalMs === undefined) {
    return "unsupported-cadence";
  }

  if (!project.latestRunJournalAt) {
    return undefined;
  }

  const latestRunAt = Date.parse(project.latestRunJournalAt);
  if (Number.isNaN(latestRunAt)) {
    return "invalid-run-journal-timestamp";
  }

  return now.getTime() - latestRunAt >= intervalMs ? undefined : "cadence-not-due";
}

function conservativeProductLoopThrottleReason(options: {
  project: ProjectRuntimeStatus;
  now: Date;
  budgetMode: SchedulerBudgetMode;
  conservativeProductLoopMinIntervalMs?: number | undefined;
}): string | undefined {
  if (
    options.budgetMode !== "conservative" ||
    options.project.autonomyPolicy !== DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY ||
    !options.project.latestRunJournalAt
  ) {
    return undefined;
  }

  const minIntervalMs =
    options.conservativeProductLoopMinIntervalMs ?? DEFAULT_CONSERVATIVE_PRODUCT_LOOP_MIN_INTERVAL_MS;
  if (minIntervalMs <= 0) {
    return undefined;
  }

  const latestRunAt = Date.parse(options.project.latestRunJournalAt);
  if (Number.isNaN(latestRunAt)) {
    return "invalid-run-journal-timestamp";
  }

  return options.now.getTime() - latestRunAt >= minIntervalMs
    ? undefined
    : "product-loop-throttle-conservative";
}

function cadenceIntervalMs(cadence: string): number | undefined {
  if (cadence === "daily-forward-motion" || cadence === "builder-loop-after-owner-approval") {
    return DAY_MS;
  }

  return undefined;
}

function deferred(project: ProjectRuntimeStatus, reason: string): SchedulerDecisionRecord {
  return {
    projectId: project.id,
    displayName: project.displayName,
    decision: "deferred",
    reason,
  };
}
