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
import { blockerDeferReason, hasAutoRecoverableBlockerRepair } from "../blockers/recovery.js";
import {
  DEFAULT_RUNTIME_POLICY,
  parseDurationMs,
  type RuntimePolicy,
  type RuntimePolicyBudget,
} from "../config/runtimePolicy.js";

export const DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY = "continuous-product-loop-direct-main";
export const DEFAULT_PRODUCT_LOOP_MIN_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const DEFAULT_CONSERVATIVE_PRODUCT_LOOP_MIN_INTERVAL_MS = DEFAULT_PRODUCT_LOOP_MIN_INTERVAL_MS;

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
  runtimePolicy?: RuntimePolicy;
  conservativeProductLoopMinIntervalMs?: number;
  recordTick?: (databasePath: string, record: SchedulerTickRecord) => Promise<void>;
}

export function createCodexBudgetProvider(policy = DEFAULT_RUNTIME_POLICY): BudgetProvider {
  return {
    name: policy.budget.provider,
    async readBudget(now: Date): Promise<BudgetSnapshot> {
      const codexUsage = await readCodexBudgetUsageSummary({
        now,
        codexHome: policy.budget.codex.codexHome ?? undefined,
        lookbackDays: policy.budget.codex.lookbackDays,
        maxFiles: policy.budget.codex.maxFiles,
      });
      if (codexUsage) {
        const remainingPercent = codexRemainingPercentFromUsage(codexUsage);
        const snapshot: BudgetSnapshot = {
          provider: policy.budget.provider,
          checkedAt: now.toISOString(),
          codexUsage,
        };
        if (remainingPercent !== undefined) {
          snapshot.remainingPercent = remainingPercent;
        }
        return snapshot;
      }

      return {
        provider: policy.budget.provider,
        checkedAt: now.toISOString(),
        unavailable: true,
      };
    },
  };
}

export const codexBudgetProvider: BudgetProvider = createCodexBudgetProvider();

export async function runSchedulerTick(options: SchedulerTickOptions): Promise<SchedulerTickRecord> {
  const now = options.now?.() ?? new Date();
  const runtimePolicy = options.runtimePolicy ?? options.state.runtimePolicy ?? DEFAULT_RUNTIME_POLICY;
  const budgetProvider = options.budgetProvider ?? createCodexBudgetProvider(runtimePolicy);
  const budgetSnapshot = await budgetProvider.readBudget(now);
  const activeBuildAgentLock =
    options.activeBuildAgentLock ?? (await readActiveBuildAgentLock(options.state.databasePath));

  const tick = planSchedulerTick({
    projects: options.state.projects,
    now,
    budgetSnapshot,
    activeBuildAgentLock,
    workPause: options.state.workPause,
    runtimePolicy,
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
  runtimePolicy?: RuntimePolicy | undefined;
  conservativeProductLoopMinIntervalMs?: number | undefined;
}): SchedulerTickRecord {
  const runtimePolicy = options.runtimePolicy ?? DEFAULT_RUNTIME_POLICY;
  const budgetMode = calculateBudgetMode(options.budgetSnapshot, runtimePolicy.budget);
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
      runtimePolicy,
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
      reason: hasAutoRecoverableBlockerRepair(project) ? "recoverable-blocker-repair" : "eligible",
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

export function calculateBudgetMode(
  snapshot: BudgetSnapshot,
  policy: RuntimePolicyBudget = DEFAULT_RUNTIME_POLICY.budget,
): SchedulerBudgetMode {
  if (snapshot.mode) {
    return snapshot.mode;
  }

  if (snapshot.unavailable === true) {
    return policy.unavailableMode;
  }

  if (snapshot.remainingPercent === undefined) {
    return policy.unknownRateLimitMode;
  }

  if (snapshot.remainingPercent <= policy.thresholds.exhaustedAtOrBelowRemainingPercent) {
    return "exhausted";
  }

  if (snapshot.remainingPercent <= policy.thresholds.criticalAtOrBelowRemainingPercent) {
    return "critical";
  }

  if (snapshot.remainingPercent <= policy.thresholds.conservativeAtOrBelowRemainingPercent) {
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
  runtimePolicy: RuntimePolicy;
  conservativeProductLoopMinIntervalMs?: number | undefined;
}): string | undefined {
  if (options.workPause?.active === true) {
    return "work-paused";
  }

  if (options.project.paused) {
    return "project-paused";
  }

  const blockerReason = blockerDeferReason(options.project);
  if (blockerReason) {
    return blockerReason;
  }

  const recoveryRepair = hasAutoRecoverableBlockerRepair(options.project);

  if (!recoveryRepair) {
    const cadenceReason = cadenceDeferReason(options.project, options.now, options.runtimePolicy);
    if (cadenceReason) {
      return cadenceReason;
    }
  }

  if (options.runtimePolicy.scheduler.budgetModeBehavior[options.budgetMode] === "defer") {
    return `budget-${options.budgetMode}`;
  }

  if (!recoveryRepair) {
    const throttleReason = directMainProductLoopThrottleReason({
      project: options.project,
      now: options.now,
      budgetMode: options.budgetMode,
      runtimePolicy: options.runtimePolicy,
      conservativeProductLoopMinIntervalMs: options.conservativeProductLoopMinIntervalMs,
    });
    if (throttleReason) {
      return throttleReason;
    }
  }

  if (
    !recoveryRepair &&
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

function cadenceDeferReason(project: ProjectRuntimeStatus, now: Date, runtimePolicy: RuntimePolicy): string | undefined {
  if (project.autonomyPolicy === DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY) {
    return undefined;
  }

  const intervalMs = cadenceIntervalMs(project.cadence, runtimePolicy);
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

function directMainProductLoopThrottleReason(options: {
  project: ProjectRuntimeStatus;
  now: Date;
  budgetMode: SchedulerBudgetMode;
  runtimePolicy: RuntimePolicy;
  conservativeProductLoopMinIntervalMs?: number | undefined;
}): string | undefined {
  if (
    options.project.autonomyPolicy !== DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY ||
    (!options.project.latestRunJournalAt &&
      options.runtimePolicy.scheduler.directMainProductLoop.allowImmediateRunWithoutRunJournal)
  ) {
    return undefined;
  }

  const minIntervalMs =
    options.conservativeProductLoopMinIntervalMs ??
    parseDurationMs(
      options.runtimePolicy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode[options.budgetMode],
      `runtimePolicy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode.${options.budgetMode}`,
    );
  if (minIntervalMs <= 0) {
    return undefined;
  }

  if (!options.project.latestRunJournalAt) {
    return `product-loop-throttle-${options.budgetMode}`;
  }

  const latestRunAt = Date.parse(options.project.latestRunJournalAt);
  if (Number.isNaN(latestRunAt)) {
    return "invalid-run-journal-timestamp";
  }

  return options.now.getTime() - latestRunAt >= minIntervalMs
    ? undefined
    : `product-loop-throttle-${options.budgetMode}`;
}

function cadenceIntervalMs(cadence: string, runtimePolicy: RuntimePolicy): number | undefined {
  const interval = runtimePolicy.scheduler.cadenceIntervals[cadence];
  return interval ? parseDurationMs(interval, `runtimePolicy.scheduler.cadenceIntervals.${cadence}`) : undefined;
}

function deferred(project: ProjectRuntimeStatus, reason: string): SchedulerDecisionRecord {
  return {
    projectId: project.id,
    displayName: project.displayName,
    decision: "deferred",
    reason,
  };
}
