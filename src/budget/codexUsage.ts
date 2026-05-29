import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CodexBudgetUsageSummary } from "../state/operationalState.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 1;
const DEFAULT_MAX_FILES = 24;

interface CodexUsageFile {
  path: string;
  mtimeMs: number;
}

interface CodexUsageAccumulator {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenEvents: number;
  latestRateLimit?: CodexRateLimitSnapshot | undefined;
}

interface CodexTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface CodexRateLimitSnapshot {
  observedAt: string;
  planType?: string | undefined;
  primaryUsedPercent?: number | undefined;
  secondaryUsedPercent?: number | undefined;
}

export interface CodexUsageReadOptions {
  codexHome?: string | undefined;
  now?: Date | undefined;
  lookbackDays?: number | undefined;
  maxFiles?: number | undefined;
}

export async function readCodexBudgetUsageSummary(
  options: CodexUsageReadOptions = {},
): Promise<CodexBudgetUsageSummary | undefined> {
  const now = options.now ?? new Date();
  const lookbackDays = clampInteger(options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS, 1, 365);
  const maxFiles = clampInteger(options.maxFiles ?? DEFAULT_MAX_FILES, 1, 500);
  const codexHome = resolveCodexHome(options.codexHome);
  const files = await newestCodexJsonlFiles(codexHome, maxFiles);
  if (files.length === 0) {
    return undefined;
  }

  const sinceMs = now.getTime() - lookbackDays * DAY_MS;
  const accumulator: CodexUsageAccumulator = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tokenEvents: 0,
  };

  for (const file of files) {
    await scanCodexJsonlFile(file.path, {
      sinceMs,
      accumulator,
    });
  }

  const summary: CodexBudgetUsageSummary = {
    checkedAt: now.toISOString(),
    source: "codex-jsonl",
    codexHome,
    lookbackDays,
    filesScanned: files.length,
    tokenEvents: accumulator.tokenEvents,
    inputTokens: accumulator.inputTokens,
    cachedInputTokens: accumulator.cachedInputTokens,
    outputTokens: accumulator.outputTokens,
    totalTokens: accumulator.totalTokens,
  };

  if (accumulator.latestRateLimit) {
    summary.latestRateLimitObservedAt = accumulator.latestRateLimit.observedAt;
    if (accumulator.latestRateLimit.primaryUsedPercent !== undefined) {
      summary.primaryUsedPercent = accumulator.latestRateLimit.primaryUsedPercent;
    }
    if (accumulator.latestRateLimit.secondaryUsedPercent !== undefined) {
      summary.secondaryUsedPercent = accumulator.latestRateLimit.secondaryUsedPercent;
    }
    if (accumulator.latestRateLimit.planType) {
      summary.planType = accumulator.latestRateLimit.planType;
    }
  }

  return summary;
}

export function codexRemainingPercentFromUsage(summary: CodexBudgetUsageSummary): number | undefined {
  const usedPercents = [summary.primaryUsedPercent, summary.secondaryUsedPercent].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (usedPercents.length === 0) {
    return undefined;
  }

  return Math.max(0, 100 - Math.max(...usedPercents));
}

function resolveCodexHome(explicit: string | undefined): string {
  const value = explicit?.trim() || process.env["CODEX_HOME"]?.trim();
  return value && value.length > 0 ? value : join(homedir(), ".codex");
}

async function newestCodexJsonlFiles(codexHome: string, maxFiles: number): Promise<CodexUsageFile[]> {
  const roots = [join(codexHome, "sessions"), join(codexHome, "archived_sessions")];
  const files: CodexUsageFile[] = [];
  for (const root of roots) {
    await collectJsonlFiles(root, files);
  }

  return files.sort((left, right) => right.mtimeMs - left.mtimeMs).slice(0, maxFiles);
}

async function collectJsonlFiles(root: string, files: CodexUsageFile[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await collectJsonlFiles(path, files);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
      continue;
    }
    const fileStat = await stat(path);
    files.push({
      path,
      mtimeMs: fileStat.mtimeMs,
    });
  }
}

async function scanCodexJsonlFile(
  path: string,
  options: {
    sinceMs: number;
    accumulator: CodexUsageAccumulator;
  },
): Promise<void> {
  const content = await readFile(path, "utf8");
  let rawTotalsBaseline: CodexTokenUsage | undefined;
  for (const line of content.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const object = readObject(parsed);
    if (!object || object["type"] !== "event_msg") {
      continue;
    }

    const timestamp = readString(object["timestamp"]);
    const timestampMs = timestamp ? Date.parse(timestamp) : NaN;
    if (!timestamp || Number.isNaN(timestampMs) || timestampMs < options.sinceMs) {
      continue;
    }

    const payload = readObject(object["payload"]);
    if (!payload || payload["type"] !== "token_count") {
      continue;
    }

    const info = readObject(payload["info"]);
    const totalUsage = readTokenUsage(info?.["total_token_usage"]);
    const lastUsage = readTokenUsage(info?.["last_token_usage"]);
    const usage = countedTokenUsage({
      totalUsage,
      lastUsage,
      rawTotalsBaseline,
    });
    if (totalUsage) {
      rawTotalsBaseline = totalUsage;
    }
    if (usage) {
      options.accumulator.inputTokens += usage.inputTokens;
      options.accumulator.cachedInputTokens += usage.cachedInputTokens;
      options.accumulator.outputTokens += usage.outputTokens;
      options.accumulator.totalTokens += usage.totalTokens;
      options.accumulator.tokenEvents += 1;
    }

    const rateLimit = readRateLimitSnapshot(object["rate_limits"], timestamp);
    if (rateLimit && shouldReplaceRateLimit(options.accumulator.latestRateLimit, rateLimit)) {
      options.accumulator.latestRateLimit = rateLimit;
    }
  }
}

function countedTokenUsage(options: {
  totalUsage?: CodexTokenUsage | undefined;
  lastUsage?: CodexTokenUsage | undefined;
  rawTotalsBaseline?: CodexTokenUsage | undefined;
}): CodexTokenUsage | undefined {
  if (options.totalUsage && options.lastUsage) {
    const totalDelta = tokenUsageDelta(options.rawTotalsBaseline, options.totalUsage);
    return tokenUsageAtMost(totalDelta, options.lastUsage) ? nonZeroTokenUsage(totalDelta) : options.lastUsage;
  }

  if (options.lastUsage) {
    return options.lastUsage;
  }

  if (options.totalUsage) {
    return nonZeroTokenUsage(tokenUsageDelta(options.rawTotalsBaseline, options.totalUsage));
  }

  return undefined;
}

function tokenUsageDelta(previous: CodexTokenUsage | undefined, current: CodexTokenUsage): CodexTokenUsage {
  const baseline = previous ?? {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  return {
    inputTokens: Math.max(0, current.inputTokens - baseline.inputTokens),
    cachedInputTokens: Math.max(0, current.cachedInputTokens - baseline.cachedInputTokens),
    outputTokens: Math.max(0, current.outputTokens - baseline.outputTokens),
    totalTokens: Math.max(0, current.totalTokens - baseline.totalTokens),
  };
}

function tokenUsageAtMost(left: CodexTokenUsage, right: CodexTokenUsage): boolean {
  return (
    left.inputTokens <= right.inputTokens &&
    left.cachedInputTokens <= right.cachedInputTokens &&
    left.outputTokens <= right.outputTokens &&
    left.totalTokens <= right.totalTokens
  );
}

function nonZeroTokenUsage(usage: CodexTokenUsage): CodexTokenUsage | undefined {
  return usage.inputTokens === 0 &&
    usage.cachedInputTokens === 0 &&
    usage.outputTokens === 0 &&
    usage.totalTokens === 0
    ? undefined
    : usage;
}

function readTokenUsage(value: unknown): CodexTokenUsage | undefined {
  const object = readObject(value);
  if (!object) {
    return undefined;
  }

  const inputTokens = readNonNegativeNumber(object["input_tokens"]) ?? 0;
  const cachedInputTokens = readNonNegativeNumber(object["cached_input_tokens"]) ?? 0;
  const outputTokens = readNonNegativeNumber(object["output_tokens"]) ?? 0;
  const totalTokens = readNonNegativeNumber(object["total_tokens"]) ?? inputTokens + outputTokens;

  if (inputTokens === 0 && cachedInputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    return undefined;
  }

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
  };
}

function readRateLimitSnapshot(value: unknown, observedAt: string): CodexRateLimitSnapshot | undefined {
  const object = readObject(value);
  if (!object) {
    return undefined;
  }

  const primaryUsedPercent = readWindowUsedPercent(object["primary"]);
  const secondaryUsedPercent = readWindowUsedPercent(object["secondary"]);
  if (primaryUsedPercent === undefined && secondaryUsedPercent === undefined) {
    return undefined;
  }

  return {
    observedAt,
    planType: readString(object["plan_type"]),
    primaryUsedPercent,
    secondaryUsedPercent,
  };
}

function shouldReplaceRateLimit(
  current: CodexRateLimitSnapshot | undefined,
  candidate: CodexRateLimitSnapshot,
): boolean {
  if (!current) {
    return true;
  }

  return Date.parse(candidate.observedAt) > Date.parse(current.observedAt);
}

function readWindowUsedPercent(value: unknown): number | undefined {
  const object = readObject(value);
  if (!object) {
    return undefined;
  }

  return readNonNegativeNumber(object["used_percent"]);
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
