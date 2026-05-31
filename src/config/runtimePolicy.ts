import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { workspacePath } from "../remote/paths.js";

export const RUNTIME_POLICY_VERSION = 1;

export type RuntimePolicyBudgetMode = "normal" | "conservative" | "critical" | "exhausted";
export type RuntimePolicyBudgetModeBehavior = "allow" | "defer";

export type RuntimePolicyTelegramCommandKey =
  | "status"
  | "policy"
  | "pause1min"
  | "pause1hour"
  | "pause1day"
  | "resume";

export interface RuntimePolicy {
  version: 1;
  runtime: RuntimePolicyRuntime;
  budget: RuntimePolicyBudget;
  scheduler: RuntimePolicyScheduler;
  buildAgent: RuntimePolicyBuildAgent;
  telegram: RuntimePolicyTelegram;
  status: RuntimePolicyStatus;
}

export interface RuntimePolicyRuntime {
  heartbeatInterval: string;
}

export interface RuntimePolicyBudget {
  provider: "codex";
  unknownRateLimitMode: RuntimePolicyBudgetMode;
  unavailableMode: RuntimePolicyBudgetMode;
  thresholds: RuntimePolicyBudgetThresholds;
  codex: RuntimePolicyCodexBudget;
}

export interface RuntimePolicyBudgetThresholds {
  exhaustedAtOrBelowRemainingPercent: number;
  criticalAtOrBelowRemainingPercent: number;
  conservativeAtOrBelowRemainingPercent: number;
}

export interface RuntimePolicyCodexBudget {
  codexHome: string | null;
  lookbackDays: number;
  maxFiles: number;
}

export interface RuntimePolicyScheduler {
  selectionStrategy: "registry-order";
  budgetModeBehavior: Record<RuntimePolicyBudgetMode, RuntimePolicyBudgetModeBehavior>;
  cadenceIntervals: Record<string, string>;
  directMainProductLoop: RuntimePolicyDirectMainProductLoop;
}

export interface RuntimePolicyDirectMainProductLoop {
  minimumIntervalByBudgetMode: Record<RuntimePolicyBudgetMode, string>;
  allowImmediateRunWithoutRunJournal: boolean;
}

export interface RuntimePolicyBuildAgent {
  autoRunSelectedProjects: boolean;
  worker: RuntimePolicyBuildAgentWorker;
}

export interface RuntimePolicyBuildAgentWorker {
  model: string;
  reasoningEffort: string;
}

export interface RuntimePolicyTelegram {
  dailyBrief: RuntimePolicyTelegramDailyBrief;
  unauthorizedAlerts: RuntimePolicyTelegramUnauthorizedAlerts;
  commands: Record<RuntimePolicyTelegramCommandKey, string>;
  pauseDurations: Record<"pause1min" | "pause1hour" | "pause1day", string>;
}

export interface RuntimePolicyTelegramDailyBrief {
  enabled: boolean;
  hourUtc: number;
}

export interface RuntimePolicyTelegramUnauthorizedAlerts {
  threshold: number;
  window: string;
  suppression: string;
  materialChangeCount: number;
}

export interface RuntimePolicyStatus {
  includeRuntimePolicySummary: boolean;
  includeTelegramCommands: boolean;
}

export interface LoadedRuntimePolicy {
  path: string;
  policy: RuntimePolicy;
  created: boolean;
}

export const DEFAULT_RUNTIME_POLICY: RuntimePolicy = {
  version: RUNTIME_POLICY_VERSION,
  runtime: {
    heartbeatInterval: "30s",
  },
  budget: {
    provider: "codex",
    unknownRateLimitMode: "normal",
    unavailableMode: "conservative",
    thresholds: {
      exhaustedAtOrBelowRemainingPercent: 0,
      criticalAtOrBelowRemainingPercent: 10,
      conservativeAtOrBelowRemainingPercent: 30,
    },
    codex: {
      codexHome: null,
      lookbackDays: 1,
      maxFiles: 24,
    },
  },
  scheduler: {
    selectionStrategy: "registry-order",
    budgetModeBehavior: {
      normal: "allow",
      conservative: "allow",
      critical: "defer",
      exhausted: "defer",
    },
    cadenceIntervals: {
      "daily-forward-motion": "24h",
      "builder-loop-after-owner-approval": "24h",
    },
    directMainProductLoop: {
      minimumIntervalByBudgetMode: {
        normal: "3h",
        conservative: "3h",
        critical: "3h",
        exhausted: "3h",
      },
      allowImmediateRunWithoutRunJournal: true,
    },
  },
  buildAgent: {
    autoRunSelectedProjects: true,
    worker: {
      model: "gpt-5.5",
      reasoningEffort: "xhigh",
    },
  },
  telegram: {
    dailyBrief: {
      enabled: true,
      hourUtc: 14,
    },
    unauthorizedAlerts: {
      threshold: 3,
      window: "10m",
      suppression: "1h",
      materialChangeCount: 3,
    },
    commands: {
      status: "/status",
      policy: "/policy",
      pause1min: "/pause1min",
      pause1hour: "/pause1hour",
      pause1day: "/pause1day",
      resume: "/resume",
    },
    pauseDurations: {
      pause1min: "1m",
      pause1hour: "1h",
      pause1day: "1d",
    },
  },
  status: {
    includeRuntimePolicySummary: true,
    includeTelegramCommands: true,
  },
};

export async function loadRuntimePolicy(workspaceRoot: string): Promise<LoadedRuntimePolicy> {
  const policyPath = runtimePolicyPath(workspaceRoot);

  try {
    const content = await readFile(policyPath, "utf8");
    const policy = parseRuntimePolicy(JSON.parse(content), policyPath);
    const normalizedContent = `${JSON.stringify(policy, null, 2)}\n`;
    if (content !== normalizedContent) {
      await writeFile(policyPath, normalizedContent, {
        mode: 0o644,
      });
    }
    return {
      path: policyPath,
      policy,
      created: false,
    };
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const policy = cloneDefaultRuntimePolicy();
  await mkdir(dirname(policyPath), { recursive: true, mode: 0o700 });
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, {
    mode: 0o644,
  });

  return {
    path: policyPath,
    policy,
    created: true,
  };
}

export function runtimePolicyPath(workspaceRoot: string): string {
  return workspacePath(workspaceRoot, "config", "runtime-policy.json");
}

export function parseDurationMs(value: string, source: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`${source} must be a duration like 30s, 15m, 3h, or 1d`);
  }

  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`${source} duration is too large`);
  }

  const unit = match[2];
  const multiplier =
    unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60 * 1000 : unit === "h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return amount * multiplier;
}

export function formatRuntimePolicySummary(policy: RuntimePolicy): string[] {
  return [
    `Budget unknown-rate-limit fallback: ${policy.budget.unknownRateLimitMode}`,
    `Budget unavailable fallback: ${policy.budget.unavailableMode}`,
    `Direct-main loop interval: normal ${policy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode.normal}, conservative ${policy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode.conservative}`,
    `Codex usage scan: ${policy.budget.codex.lookbackDays} day(s), ${policy.budget.codex.maxFiles} file(s)`,
    `Telegram policy command: ${policy.telegram.commands.policy}`,
  ];
}

function parseRuntimePolicy(value: unknown, source: string): RuntimePolicy {
  const object = readObject(value, source);
  const version = object["version"];
  if (version !== RUNTIME_POLICY_VERSION) {
    throw new Error(`${source} must use Runtime Policy version ${RUNTIME_POLICY_VERSION}`);
  }

  const policy = cloneDefaultRuntimePolicy();
  policy.runtime = parseRuntimeSection(object["runtime"], `${source} runtime`, policy.runtime);
  policy.budget = parseBudgetSection(object["budget"], `${source} budget`, policy.budget);
  policy.scheduler = parseSchedulerSection(object["scheduler"], `${source} scheduler`, policy.scheduler);
  policy.buildAgent = parseBuildAgentSection(object["buildAgent"], `${source} buildAgent`, policy.buildAgent);
  policy.telegram = parseTelegramSection(object["telegram"], `${source} telegram`, policy.telegram);
  policy.status = parseStatusSection(object["status"], `${source} status`, policy.status);
  validateRuntimePolicy(policy, source);
  return policy;
}

function parseRuntimeSection(
  value: unknown,
  source: string,
  defaults: RuntimePolicyRuntime,
): RuntimePolicyRuntime {
  const object = readOptionalObject(value, source);
  return {
    heartbeatInterval: readOptionalString(object, "heartbeatInterval", source) ?? defaults.heartbeatInterval,
  };
}

function parseBudgetSection(value: unknown, source: string, defaults: RuntimePolicyBudget): RuntimePolicyBudget {
  const object = readOptionalObject(value, source);
  const thresholdsObject = readOptionalObject(object["thresholds"], `${source} thresholds`);
  const codexObject = readOptionalObject(object["codex"], `${source} codex`);
  return {
    provider: readOptionalBudgetProvider(object, "provider", source) ?? defaults.provider,
    unknownRateLimitMode:
      readOptionalBudgetMode(object, "unknownRateLimitMode", source) ?? defaults.unknownRateLimitMode,
    unavailableMode: readOptionalBudgetMode(object, "unavailableMode", source) ?? defaults.unavailableMode,
    thresholds: {
      exhaustedAtOrBelowRemainingPercent:
        readOptionalPercent(
          thresholdsObject,
          "exhaustedAtOrBelowRemainingPercent",
          `${source} thresholds`,
        ) ?? defaults.thresholds.exhaustedAtOrBelowRemainingPercent,
      criticalAtOrBelowRemainingPercent:
        readOptionalPercent(thresholdsObject, "criticalAtOrBelowRemainingPercent", `${source} thresholds`) ??
        defaults.thresholds.criticalAtOrBelowRemainingPercent,
      conservativeAtOrBelowRemainingPercent:
        readOptionalPercent(thresholdsObject, "conservativeAtOrBelowRemainingPercent", `${source} thresholds`) ??
        defaults.thresholds.conservativeAtOrBelowRemainingPercent,
    },
    codex: {
      codexHome: readOptionalNullableString(codexObject, "codexHome", `${source} codex`) ?? defaults.codex.codexHome,
      lookbackDays:
        readOptionalInteger(codexObject, "lookbackDays", `${source} codex`, 1, 365) ?? defaults.codex.lookbackDays,
      maxFiles: readOptionalInteger(codexObject, "maxFiles", `${source} codex`, 1, 500) ?? defaults.codex.maxFiles,
    },
  };
}

function parseSchedulerSection(
  value: unknown,
  source: string,
  defaults: RuntimePolicyScheduler,
): RuntimePolicyScheduler {
  const object = readOptionalObject(value, source);
  const budgetModeBehaviorObject = readOptionalObject(object["budgetModeBehavior"], `${source} budgetModeBehavior`);
  const cadenceIntervals = {
    ...defaults.cadenceIntervals,
    ...readOptionalStringMap(object["cadenceIntervals"], `${source} cadenceIntervals`),
  };
  const directMainObject = readOptionalObject(
    object["directMainProductLoop"],
    `${source} directMainProductLoop`,
  );
  const minIntervalsObject = readOptionalObject(
    directMainObject["minimumIntervalByBudgetMode"],
    `${source} directMainProductLoop minimumIntervalByBudgetMode`,
  );

  return {
    selectionStrategy:
      readOptionalSelectionStrategy(object, "selectionStrategy", source) ?? defaults.selectionStrategy,
    budgetModeBehavior: {
      normal:
        readOptionalBudgetModeBehavior(budgetModeBehaviorObject, "normal", `${source} budgetModeBehavior`) ??
        defaults.budgetModeBehavior.normal,
      conservative:
        readOptionalBudgetModeBehavior(budgetModeBehaviorObject, "conservative", `${source} budgetModeBehavior`) ??
        defaults.budgetModeBehavior.conservative,
      critical:
        readOptionalBudgetModeBehavior(budgetModeBehaviorObject, "critical", `${source} budgetModeBehavior`) ??
        defaults.budgetModeBehavior.critical,
      exhausted:
        readOptionalBudgetModeBehavior(budgetModeBehaviorObject, "exhausted", `${source} budgetModeBehavior`) ??
        defaults.budgetModeBehavior.exhausted,
    },
    cadenceIntervals,
    directMainProductLoop: {
      minimumIntervalByBudgetMode: {
        normal:
          readOptionalString(
            minIntervalsObject,
            "normal",
            `${source} directMainProductLoop minimumIntervalByBudgetMode`,
          ) ?? defaults.directMainProductLoop.minimumIntervalByBudgetMode.normal,
        conservative:
          readOptionalString(
            minIntervalsObject,
            "conservative",
            `${source} directMainProductLoop minimumIntervalByBudgetMode`,
          ) ?? defaults.directMainProductLoop.minimumIntervalByBudgetMode.conservative,
        critical:
          readOptionalString(
            minIntervalsObject,
            "critical",
            `${source} directMainProductLoop minimumIntervalByBudgetMode`,
          ) ?? defaults.directMainProductLoop.minimumIntervalByBudgetMode.critical,
        exhausted:
          readOptionalString(
            minIntervalsObject,
            "exhausted",
            `${source} directMainProductLoop minimumIntervalByBudgetMode`,
          ) ?? defaults.directMainProductLoop.minimumIntervalByBudgetMode.exhausted,
      },
      allowImmediateRunWithoutRunJournal:
        readOptionalBoolean(
          directMainObject,
          "allowImmediateRunWithoutRunJournal",
          `${source} directMainProductLoop`,
        ) ?? defaults.directMainProductLoop.allowImmediateRunWithoutRunJournal,
    },
  };
}

function parseBuildAgentSection(
  value: unknown,
  source: string,
  defaults: RuntimePolicyBuildAgent,
): RuntimePolicyBuildAgent {
  const object = readOptionalObject(value, source);
  const workerObject = readOptionalObject(object["worker"], `${source} worker`);
  return {
    autoRunSelectedProjects:
      readOptionalBoolean(object, "autoRunSelectedProjects", source) ?? defaults.autoRunSelectedProjects,
    worker: {
      model: readOptionalString(workerObject, "model", `${source} worker`) ?? defaults.worker.model,
      reasoningEffort:
        readOptionalString(workerObject, "reasoningEffort", `${source} worker`) ??
        defaults.worker.reasoningEffort,
    },
  };
}

function parseTelegramSection(
  value: unknown,
  source: string,
  defaults: RuntimePolicyTelegram,
): RuntimePolicyTelegram {
  const object = readOptionalObject(value, source);
  const dailyBriefObject = readOptionalObject(object["dailyBrief"], `${source} dailyBrief`);
  const alertsObject = readOptionalObject(object["unauthorizedAlerts"], `${source} unauthorizedAlerts`);
  const commandsObject = readOptionalObject(object["commands"], `${source} commands`);
  const pauseDurationsObject = readOptionalObject(object["pauseDurations"], `${source} pauseDurations`);
  return {
    dailyBrief: {
      enabled: readOptionalBoolean(dailyBriefObject, "enabled", `${source} dailyBrief`) ?? defaults.dailyBrief.enabled,
      hourUtc:
        readOptionalInteger(dailyBriefObject, "hourUtc", `${source} dailyBrief`, 0, 23) ??
        defaults.dailyBrief.hourUtc,
    },
    unauthorizedAlerts: {
      threshold:
        readOptionalInteger(alertsObject, "threshold", `${source} unauthorizedAlerts`, 1, 100) ??
        defaults.unauthorizedAlerts.threshold,
      window:
        readOptionalString(alertsObject, "window", `${source} unauthorizedAlerts`) ??
        defaults.unauthorizedAlerts.window,
      suppression:
        readOptionalString(alertsObject, "suppression", `${source} unauthorizedAlerts`) ??
        defaults.unauthorizedAlerts.suppression,
      materialChangeCount:
        readOptionalInteger(alertsObject, "materialChangeCount", `${source} unauthorizedAlerts`, 1, 100) ??
        defaults.unauthorizedAlerts.materialChangeCount,
    },
    commands: {
      status: readOptionalString(commandsObject, "status", `${source} commands`) ?? defaults.commands.status,
      policy: readOptionalString(commandsObject, "policy", `${source} commands`) ?? defaults.commands.policy,
      pause1min: readOptionalString(commandsObject, "pause1min", `${source} commands`) ?? defaults.commands.pause1min,
      pause1hour:
        readOptionalString(commandsObject, "pause1hour", `${source} commands`) ?? defaults.commands.pause1hour,
      pause1day:
        readOptionalString(commandsObject, "pause1day", `${source} commands`) ?? defaults.commands.pause1day,
      resume: readOptionalString(commandsObject, "resume", `${source} commands`) ?? defaults.commands.resume,
    },
    pauseDurations: {
      pause1min:
        readOptionalString(pauseDurationsObject, "pause1min", `${source} pauseDurations`) ??
        defaults.pauseDurations.pause1min,
      pause1hour:
        readOptionalString(pauseDurationsObject, "pause1hour", `${source} pauseDurations`) ??
        defaults.pauseDurations.pause1hour,
      pause1day:
        readOptionalString(pauseDurationsObject, "pause1day", `${source} pauseDurations`) ??
        defaults.pauseDurations.pause1day,
    },
  };
}

function parseStatusSection(value: unknown, source: string, defaults: RuntimePolicyStatus): RuntimePolicyStatus {
  const object = readOptionalObject(value, source);
  return {
    includeRuntimePolicySummary:
      readOptionalBoolean(object, "includeRuntimePolicySummary", source) ?? defaults.includeRuntimePolicySummary,
    includeTelegramCommands:
      readOptionalBoolean(object, "includeTelegramCommands", source) ?? defaults.includeTelegramCommands,
  };
}

function validateRuntimePolicy(policy: RuntimePolicy, source: string): void {
  parseDurationMs(policy.runtime.heartbeatInterval, `${source} runtime.heartbeatInterval`);

  const thresholds = policy.budget.thresholds;
  if (
    thresholds.exhaustedAtOrBelowRemainingPercent > thresholds.criticalAtOrBelowRemainingPercent ||
    thresholds.criticalAtOrBelowRemainingPercent > thresholds.conservativeAtOrBelowRemainingPercent
  ) {
    throw new Error(`${source} budget thresholds must be ordered exhausted <= critical <= conservative`);
  }

  for (const [cadence, interval] of Object.entries(policy.scheduler.cadenceIntervals)) {
    if (cadence.trim().length === 0) {
      throw new Error(`${source} scheduler.cadenceIntervals cannot contain an empty cadence`);
    }
    parseDurationMs(interval, `${source} scheduler.cadenceIntervals.${cadence}`);
  }

  for (const [mode, interval] of Object.entries(policy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode)) {
    parseDurationMs(interval, `${source} scheduler.directMainProductLoop.minimumIntervalByBudgetMode.${mode}`);
  }

  for (const [key, command] of Object.entries(policy.telegram.commands)) {
    validateTelegramCommand(command, `${source} telegram.commands.${key}`);
  }

  for (const [key, duration] of Object.entries(policy.telegram.pauseDurations)) {
    parseDurationMs(duration, `${source} telegram.pauseDurations.${key}`);
  }

  parseDurationMs(policy.telegram.unauthorizedAlerts.window, `${source} telegram.unauthorizedAlerts.window`);
  parseDurationMs(policy.telegram.unauthorizedAlerts.suppression, `${source} telegram.unauthorizedAlerts.suppression`);
}

function validateTelegramCommand(value: string, source: string): void {
  if (!/^\/[a-z0-9_]+$/.test(value)) {
    throw new Error(`${source} must be a slash command with no spaces, like /status or /policy`);
  }
}

function cloneDefaultRuntimePolicy(): RuntimePolicy {
  return JSON.parse(JSON.stringify(DEFAULT_RUNTIME_POLICY)) as RuntimePolicy;
}

function readObject(value: unknown, source: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function readOptionalObject(value: unknown, source: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  return readObject(value, source);
}

function readOptionalString(
  object: Record<string, unknown>,
  key: string,
  source: string,
): string | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${source} ${key} must be a non-empty string`);
  }
  return value;
}

function readOptionalNullableString(
  object: Record<string, unknown>,
  key: string,
  source: string,
): string | null | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${source} ${key} must be null or a non-empty string`);
  }
  return value;
}

function readOptionalBoolean(
  object: Record<string, unknown>,
  key: string,
  source: string,
): boolean | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${source} ${key} must be true or false`);
  }
  return value;
}

function readOptionalInteger(
  object: Record<string, unknown>,
  key: string,
  source: string,
  min: number,
  max: number,
): number | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${source} ${key} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function readOptionalPercent(
  object: Record<string, unknown>,
  key: string,
  source: string,
): number | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${source} ${key} must be a number from 0 to 100`);
  }
  return value;
}

function readOptionalBudgetMode(
  object: Record<string, unknown>,
  key: string,
  source: string,
): RuntimePolicyBudgetMode | undefined {
  const value = readOptionalString(object, key, source);
  if (value === undefined) {
    return undefined;
  }
  if (value === "normal" || value === "conservative" || value === "critical" || value === "exhausted") {
    return value;
  }
  throw new Error(`${source} ${key} must be normal, conservative, critical, or exhausted`);
}

function readOptionalBudgetProvider(
  object: Record<string, unknown>,
  key: string,
  source: string,
): "codex" | undefined {
  const value = readOptionalString(object, key, source);
  if (value === undefined) {
    return undefined;
  }
  if (value === "codex") {
    return value;
  }
  throw new Error(`${source} ${key} must be codex`);
}

function readOptionalBudgetModeBehavior(
  object: Record<string, unknown>,
  key: string,
  source: string,
): RuntimePolicyBudgetModeBehavior | undefined {
  const value = readOptionalString(object, key, source);
  if (value === undefined) {
    return undefined;
  }
  if (value === "allow" || value === "defer") {
    return value;
  }
  throw new Error(`${source} ${key} must be allow or defer`);
}

function readOptionalSelectionStrategy(
  object: Record<string, unknown>,
  key: string,
  source: string,
): "registry-order" | undefined {
  const value = readOptionalString(object, key, source);
  if (value === undefined) {
    return undefined;
  }
  if (value === "registry-order") {
    return value;
  }
  throw new Error(`${source} ${key} must be registry-order`);
}

function readOptionalStringMap(value: unknown, source: string): Record<string, string> {
  const object = readOptionalObject(value, source);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(object)) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error(`${source}.${key} must be a non-empty string`);
    }
    result[key] = entry;
  }
  return result;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
