import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { loadRuntimePolicy, type RuntimePolicy } from "../config/runtimePolicy.js";
import {
  formatProjectMode,
  loadProjectRegistry,
  type NativeValidationProfile,
  type ProjectMode,
  type ProjectProfile,
  type VisualProofProfile,
} from "../registry/projectRegistry.js";
import { workspacePath } from "../remote/paths.js";
import { extractStatusNextAction } from "../status/statusMarkdown.js";

export interface ProjectRuntimeStatus {
  id: string;
  displayName: string;
  mode: ProjectMode;
  modeLabel: string;
  cadence: string;
  autonomyPolicy: string;
  paused: boolean;
  runJournalCount: number;
  openBlockerCount: number;
  openBlockers?: ProjectBlockerRecord[];
  latestRunJournalAt?: string;
  validationCommands?: string[];
  autoSafeTasks?: string[];
  nativeValidation?: NativeValidationProfile;
  visualProof?: VisualProofProfile;
  latestExternalValidation?: ExternalValidationRunRecord;
  statusNextAction?: string;
  githubRepo?: string;
  rawIdea?: string;
}

export interface OperationalStateReport {
  workspaceRoot: string;
  databasePath: string;
  registryPath: string;
  registryCreated: boolean;
  runtimePolicyPath?: string;
  runtimePolicyCreated?: boolean;
  runtimePolicy?: RuntimePolicy;
  migrationsApplied: string[];
  projects: ProjectRuntimeStatus[];
  scheduler?: SchedulerRuntimeStatus;
  workPause?: WorkPauseRuntimeStatus;
}

export interface NotificationDeliveryState {
  id: string;
  lastSentAt?: string;
  metadataJson?: string;
  updatedAt: string;
}

export interface CodexBudgetUsageSummary {
  checkedAt: string;
  source: "codex-jsonl";
  codexHome: string;
  lookbackDays: number;
  filesScanned: number;
  tokenEvents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latestRateLimitObservedAt?: string;
  primaryUsedPercent?: number;
  secondaryUsedPercent?: number;
  planType?: string;
}

export interface OperationalStateOptions {
  workspaceRoot: string;
  now?: () => Date;
}

export type SchedulerBudgetMode = "normal" | "conservative" | "critical" | "exhausted";

export type SchedulerDecisionStatus = "selected" | "deferred";

export interface SchedulerDecisionRecord {
  projectId: string;
  displayName: string;
  decision: SchedulerDecisionStatus;
  reason: string;
}

export interface SchedulerTickRecord {
  tickedAt: string;
  budgetProvider: string;
  budgetMode: SchedulerBudgetMode;
  activeBuildAgentLock: "available" | "held";
  decisions: SchedulerDecisionRecord[];
  codexUsage?: CodexBudgetUsageSummary;
  selectedProjectId?: string;
}

export interface SchedulerRuntimeStatus {
  lastTickAt: string;
  budgetProvider: string;
  budgetMode: SchedulerBudgetMode;
  activeBuildAgentLock: "available" | "held";
  decisions: SchedulerDecisionRecord[];
  codexUsage?: CodexBudgetUsageSummary;
  selectedProjectId?: string;
}

export interface ActiveBuildAgentLockSnapshot {
  held: boolean;
  projectId?: string;
  runJournalId?: string;
  acquiredAt?: string;
}

export interface WorkPauseRuntimeStatus {
  active: boolean;
  pausedUntil?: string;
  source?: string;
  createdAt?: string;
  reason?: string;
  expired?: boolean;
}

export interface TelegramUnauthorizedAttemptRecord {
  sourceKey: string;
  windowStartedAt: string;
  lastAttemptAt: string;
  attemptCount: number;
  lastAlertAt?: string;
  suppressedUntil?: string;
  lastAlertAttemptCount?: number;
}

export interface ExternalValidationRunRecord {
  id: string;
  projectId: string;
  provider: string;
  repo: string;
  workflowId: string;
  ref: string;
  providerRunId?: string;
  providerUrl?: string;
  status: string;
  conclusion?: string;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  checkedAt: string;
  errorSummary?: string;
}

export interface ProjectBlockerRecord {
  id: string;
  projectId: string;
  summary: string;
  status: "open" | "resolved";
  createdAt: string;
  details?: string;
  resolvedAt?: string;
}

export type IdempotencyOperationStatus = "started" | "completed" | "failed";

export interface IdempotencyOperationRecord {
  idempotencyKey: string;
  operation: string;
  projectId?: string;
  requestHash: string;
  status: IdempotencyOperationStatus;
  responseJson?: string;
  createdAt: string;
  updatedAt: string;
}

export type RunJournalStatus = "started" | "completed" | "failed" | "blocked";

export interface RunJournalWriteOptions {
  id: string;
  projectId: string;
  phase: string;
  status: RunJournalStatus;
  summary: string;
  journalJson: string;
  now: string;
}

interface Migration {
  id: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: "0001_operational_state",
    sql: `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('safe-watcher', 'builder')),
  github_repo TEXT,
  raw_idea TEXT,
  cadence TEXT NOT NULL,
  autonomy_policy TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
  registry_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_journals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  journal_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS run_journals_project_created_at_idx
  ON run_journals(project_id, created_at);

CREATE TABLE IF NOT EXISTS project_blockers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  summary TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS project_blockers_project_status_idx
  ON project_blockers(project_id, status);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  response_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idempotency_keys_project_operation_idx
  ON idempotency_keys(project_id, operation);
`,
  },
  {
    id: "0002_scheduler_state",
    sql: `
CREATE TABLE IF NOT EXISTS scheduler_cursors (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  last_checked_at TEXT NOT NULL,
  last_decision TEXT NOT NULL CHECK (last_decision IN ('selected', 'deferred')),
  last_reason TEXT NOT NULL,
  last_selected_at TEXT,
  last_deferred_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduler_ticks (
  id TEXT PRIMARY KEY CHECK (id = 'current'),
  budget_provider TEXT NOT NULL,
  budget_mode TEXT NOT NULL CHECK (budget_mode IN ('normal', 'conservative', 'critical', 'exhausted')),
  selected_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  active_build_agent_lock TEXT NOT NULL CHECK (active_build_agent_lock IN ('available', 'held')),
  ticked_at TEXT NOT NULL,
  tick_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_build_agent_lock (
  lock_name TEXT PRIMARY KEY CHECK (lock_name = 'active-build-agent'),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_journal_id TEXT,
  acquired_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    id: "0003_work_pause_and_telegram_cursor",
    sql: `
CREATE TABLE IF NOT EXISTS work_pause (
  id TEXT PRIMARY KEY CHECK (id = 'current'),
  paused_until TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS telegram_update_cursor (
  id TEXT PRIMARY KEY CHECK (id = 'current'),
  last_update_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    id: "0004_notifications_and_telegram_security",
    sql: `
CREATE TABLE IF NOT EXISTS notification_delivery_state (
  id TEXT PRIMARY KEY,
  last_sent_at TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_unauthorized_attempt_state (
  source_key TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  last_attempt_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  last_alert_at TEXT,
  suppressed_until TEXT,
  last_alert_attempt_count INTEGER,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    id: "0005_external_validation_runs",
    sql: `
CREATE TABLE IF NOT EXISTS external_validation_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  repo TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  ref TEXT NOT NULL,
  provider_run_id TEXT,
  provider_url TEXT,
  status TEXT NOT NULL,
  conclusion TEXT,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  checked_at TEXT NOT NULL,
  error_summary TEXT
);

CREATE INDEX IF NOT EXISTS external_validation_runs_project_checked_at_idx
  ON external_validation_runs(project_id, checked_at);
`,
  },
];

export async function initializeOperationalState(
  options: OperationalStateOptions,
): Promise<OperationalStateReport> {
  const now = options.now ?? (() => new Date());
  const databasePath = operationalDatabasePath(options.workspaceRoot);
  await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 });

  const loadedRegistry = await loadProjectRegistry(options.workspaceRoot);
  const loadedRuntimePolicy = await loadRuntimePolicy(options.workspaceRoot);
  const migrationsApplied = await applyMigrations(databasePath, now);
  await syncProjectProfiles(databasePath, loadedRegistry.registry.projects, now);
  const projects = await listProjectStatuses(databasePath, options.workspaceRoot);
  const scheduler = await readSchedulerRuntimeStatus(databasePath);
  if (scheduler) {
    const activeBuildAgentLock = await readActiveBuildAgentLock(databasePath);
    scheduler.activeBuildAgentLock = activeBuildAgentLock.held ? "held" : "available";
  }
  const workPause = await readWorkPauseRuntimeStatus(databasePath, now());

  const report: OperationalStateReport = {
    workspaceRoot: options.workspaceRoot,
    databasePath,
    registryPath: loadedRegistry.path,
    registryCreated: loadedRegistry.created,
    runtimePolicyPath: loadedRuntimePolicy.path,
    runtimePolicyCreated: loadedRuntimePolicy.created,
    runtimePolicy: loadedRuntimePolicy.policy,
    migrationsApplied,
    projects,
    workPause,
  };

  if (scheduler) {
    report.scheduler = scheduler;
  }

  return report;
}

export function operationalDatabasePath(workspaceRoot: string): string {
  return workspacePath(workspaceRoot, "data", "vampyre.sqlite");
}

async function applyMigrations(databasePath: string, now: () => Date): Promise<string[]> {
  await execSqlite(
    databasePath,
    `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`,
  );

  const rows = await querySqliteJson<{ id: string }>(
    databasePath,
    "SELECT id FROM schema_migrations ORDER BY id;",
  );
  const applied = new Set(rows.map((row) => row.id));
  const appliedNow: string[] = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue;
    }

    await execSqlite(
      databasePath,
      `
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
${migration.sql}
INSERT OR IGNORE INTO schema_migrations (id, applied_at)
VALUES (${sqlString(migration.id)}, ${sqlString(now().toISOString())});
COMMIT;
`,
    );
    appliedNow.push(migration.id);
  }

  return appliedNow;
}

async function syncProjectProfiles(
  databasePath: string,
  profiles: ProjectProfile[],
  now: () => Date,
): Promise<void> {
  const updatedAt = now().toISOString();
  const statements = profiles.map((profile) => upsertProjectProfileSql(profile, updatedAt)).join("\n");

  await execSqlite(
    databasePath,
    `
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
${statements}
COMMIT;
`,
  );
}

function upsertProjectProfileSql(profile: ProjectProfile, updatedAt: string): string {
  const snapshot = JSON.stringify(profile);

  return `
INSERT INTO projects (
  id,
  display_name,
  mode,
  github_repo,
  raw_idea,
  cadence,
  autonomy_policy,
  paused,
  registry_snapshot_json,
  created_at,
  updated_at
) VALUES (
  ${sqlString(profile.id)},
  ${sqlString(profile.displayName)},
  ${sqlString(profile.mode)},
  ${sqlString(profile.githubRepo ?? null)},
  ${sqlString(profile.rawIdea ?? null)},
  ${sqlString(profile.cadence)},
  ${sqlString(profile.autonomyPolicy)},
  ${profile.paused ? 1 : 0},
  ${sqlString(snapshot)},
  COALESCE((SELECT created_at FROM projects WHERE id = ${sqlString(profile.id)}), ${sqlString(updatedAt)}),
  ${sqlString(updatedAt)}
)
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  mode = excluded.mode,
  github_repo = excluded.github_repo,
  raw_idea = excluded.raw_idea,
  cadence = excluded.cadence,
  autonomy_policy = excluded.autonomy_policy,
  paused = excluded.paused,
  registry_snapshot_json = excluded.registry_snapshot_json,
  updated_at = excluded.updated_at;
`;
}

async function listProjectStatuses(databasePath: string, workspaceRoot: string): Promise<ProjectRuntimeStatus[]> {
  const rows = await querySqliteJson<ProjectStatusRow>(
    databasePath,
    `
SELECT
  p.id AS id,
  p.display_name AS displayName,
  p.mode AS mode,
  p.github_repo AS githubRepo,
  p.raw_idea AS rawIdea,
  p.cadence AS cadence,
  p.autonomy_policy AS autonomyPolicy,
  p.paused AS paused,
  p.registry_snapshot_json AS registrySnapshotJson,
  (SELECT COUNT(*) FROM run_journals r WHERE r.project_id = p.id) AS runJournalCount,
  (
    SELECT COUNT(*)
    FROM project_blockers b
    WHERE b.project_id = p.id AND b.status = 'open'
  ) AS openBlockerCount,
  (SELECT MAX(r.created_at) FROM run_journals r WHERE r.project_id = p.id) AS latestRunJournalAt
FROM projects p
ORDER BY p.id;
`,
  );

  const projects = rows.map(projectStatusFromRow);
  await Promise.all(
    projects.map(async (project) => {
      const statusNextAction = await readRepoStatusNextAction(workspaceRoot, project.id);
      if (statusNextAction) {
        project.statusNextAction = statusNextAction;
      }
      const openBlockers = await readOpenProjectBlockers(databasePath, project.id);
      if (openBlockers.length > 0) {
        project.openBlockers = openBlockers;
        project.openBlockerCount = openBlockers.length;
      }
      const latestExternalValidation = await readLatestExternalValidationRun(databasePath, project.id);
      if (latestExternalValidation) {
        project.latestExternalValidation = latestExternalValidation;
      }
    }),
  );
  return projects;
}

interface ProjectStatusRow {
  id: unknown;
  displayName: unknown;
  mode: unknown;
  githubRepo: unknown;
  rawIdea: unknown;
  cadence: unknown;
  autonomyPolicy: unknown;
  paused: unknown;
  registrySnapshotJson: unknown;
  runJournalCount: unknown;
  openBlockerCount: unknown;
  latestRunJournalAt: unknown;
}

function projectStatusFromRow(row: ProjectStatusRow): ProjectRuntimeStatus {
  const mode = readProjectMode(row.mode);
  const project: ProjectRuntimeStatus = {
    id: readString(row.id, "id"),
    displayName: readString(row.displayName, "displayName"),
    mode,
    modeLabel: formatProjectMode(mode),
    cadence: readString(row.cadence, "cadence"),
    autonomyPolicy: readString(row.autonomyPolicy, "autonomyPolicy"),
    paused: readNumber(row.paused, "paused") === 1,
    runJournalCount: readNumber(row.runJournalCount, "runJournalCount"),
    openBlockerCount: readNumber(row.openBlockerCount, "openBlockerCount"),
  };

  const githubRepo = readOptionalString(row.githubRepo, "githubRepo");
  if (githubRepo) {
    project.githubRepo = githubRepo;
  }

  const rawIdea = readOptionalString(row.rawIdea, "rawIdea");
  if (rawIdea) {
    project.rawIdea = rawIdea;
  }

  const latestRunJournalAt = readOptionalString(row.latestRunJournalAt, "latestRunJournalAt");
  if (latestRunJournalAt) {
    project.latestRunJournalAt = latestRunJournalAt;
  }

  const validationCommands = stringArrayFromSnapshot(row.registrySnapshotJson, "validationCommands");
  if (validationCommands.length > 0) {
    project.validationCommands = validationCommands;
  }

  const autoSafeTasks = stringArrayFromSnapshot(row.registrySnapshotJson, "autoSafeTasks");
  if (autoSafeTasks.length > 0) {
    project.autoSafeTasks = autoSafeTasks;
  }

  const nativeValidation = nativeValidationFromSnapshot(row.registrySnapshotJson);
  if (nativeValidation) {
    project.nativeValidation = nativeValidation;
  }

  const visualProof = visualProofFromSnapshot(row.registrySnapshotJson);
  if (visualProof) {
    project.visualProof = visualProof;
  }

  return project;
}

function stringArrayFromSnapshot(value: unknown, key: string): string[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }

    const arrayValue = (parsed as Record<string, unknown>)[key];
    if (!Array.isArray(arrayValue)) {
      return [];
    }

    return arrayValue.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function nativeValidationFromSnapshot(value: unknown): NativeValidationProfile | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const validation = (parsed as Record<string, unknown>)["nativeValidation"];
    if (!validation || typeof validation !== "object" || Array.isArray(validation)) {
      return undefined;
    }

    const object = validation as Record<string, unknown>;
    const provider = object["provider"];
    const workflowId = object["workflowId"];
    const runnerLabel = object["runnerLabel"];
    const requiredConclusion = object["requiredConclusion"];
    const timeoutSeconds = object["timeoutSeconds"];
    if (provider !== "github-actions") {
      return undefined;
    }
    if (
      typeof workflowId !== "string" ||
      typeof runnerLabel !== "string" ||
      typeof requiredConclusion !== "string" ||
      typeof timeoutSeconds !== "number"
    ) {
      return undefined;
    }

    return {
      provider,
      workflowId,
      runnerLabel,
      requiredConclusion,
      timeoutSeconds,
    };
  } catch {
    return undefined;
  }
}

function visualProofFromSnapshot(value: unknown): VisualProofProfile | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const proof = (parsed as Record<string, unknown>)["visualProof"];
    if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
      return undefined;
    }

    const object = proof as Record<string, unknown>;
    const provider = object["provider"];
    const required = object["required"];
    const artifactName = object["artifactName"];
    const imageFilePattern = object["imageFilePattern"];
    if (provider !== "github-actions-artifact") {
      return undefined;
    }
    if (typeof required !== "boolean" || typeof artifactName !== "string") {
      return undefined;
    }

    const profile: VisualProofProfile = {
      provider,
      required,
      artifactName,
    };
    if (typeof imageFilePattern === "string" && imageFilePattern.length > 0) {
      profile.imageFilePattern = imageFilePattern;
    }
    return profile;
  } catch {
    return undefined;
  }
}

export async function readActiveBuildAgentLock(databasePath: string): Promise<ActiveBuildAgentLockSnapshot> {
  const rows = await querySqliteJson<ActiveBuildAgentLockRow>(
    databasePath,
    `
SELECT project_id AS projectId, run_journal_id AS runJournalId, acquired_at AS acquiredAt
FROM active_build_agent_lock
WHERE lock_name = 'active-build-agent'
LIMIT 1;
`,
  );

  const row = rows[0];
  if (!row) {
    return { held: false };
  }

  const lock: ActiveBuildAgentLockSnapshot = {
    held: true,
    projectId: readString(row.projectId, "projectId"),
    acquiredAt: readString(row.acquiredAt, "acquiredAt"),
  };

  const runJournalId = readOptionalString(row.runJournalId, "runJournalId");
  if (runJournalId) {
    lock.runJournalId = runJournalId;
  }

  return lock;
}

export async function tryAcquireActiveBuildAgentLock(
  databasePath: string,
  options: {
    projectId: string;
    acquiredAt: string;
    runJournalId?: string;
  },
): Promise<ActiveBuildAgentLockSnapshot> {
  await querySqliteJson<{ changed: unknown }>(
    databasePath,
    `
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
INSERT OR IGNORE INTO active_build_agent_lock (
  lock_name,
  project_id,
  run_journal_id,
  acquired_at,
  updated_at
) VALUES (
  'active-build-agent',
  ${sqlString(options.projectId)},
  ${sqlString(options.runJournalId ?? null)},
  ${sqlString(options.acquiredAt)},
  ${sqlString(options.acquiredAt)}
);
SELECT changes() AS changed;
COMMIT;
`,
  );

  return readActiveBuildAgentLock(databasePath);
}

export async function releaseActiveBuildAgentLock(databasePath: string): Promise<void> {
  await execSqlite(
    databasePath,
    `
BEGIN IMMEDIATE;
DELETE FROM active_build_agent_lock WHERE lock_name = 'active-build-agent';
COMMIT;
`,
  );
}

export async function readWorkPauseRuntimeStatus(
  databasePath: string,
  at = new Date(),
): Promise<WorkPauseRuntimeStatus> {
  const rows = await querySqliteJson<WorkPauseRow>(
    databasePath,
    `
SELECT
  paused_until AS pausedUntil,
  source,
  created_at AS createdAt,
  reason
FROM work_pause
WHERE id = 'current'
LIMIT 1;
`,
  );

  const row = rows[0];
  if (!row) {
    return { active: false };
  }

  const pausedUntil = readString(row.pausedUntil, "pausedUntil");
  const source = readString(row.source, "source");
  const createdAt = readString(row.createdAt, "createdAt");
  const pauseUntilMs = Date.parse(pausedUntil);
  const active = !Number.isNaN(pauseUntilMs) && pauseUntilMs > at.getTime();
  const status: WorkPauseRuntimeStatus = {
    active,
    pausedUntil,
    source,
    createdAt,
  };

  const reason = readOptionalString(row.reason, "reason");
  if (reason) {
    status.reason = reason;
  }
  if (!active) {
    status.expired = true;
  }

  return status;
}

export async function setWorkPauseState(
  databasePath: string,
  options: {
    pausedUntil: string;
    source: string;
    createdAt: string;
    reason?: string | undefined;
  },
): Promise<void> {
  await execSqlite(
    databasePath,
    `
BEGIN IMMEDIATE;
INSERT INTO work_pause (
  id,
  paused_until,
  source,
  created_at,
  reason
) VALUES (
  'current',
  ${sqlString(options.pausedUntil)},
  ${sqlString(options.source)},
  ${sqlString(options.createdAt)},
  ${sqlString(options.reason ?? null)}
)
ON CONFLICT(id) DO UPDATE SET
  paused_until = excluded.paused_until,
  source = excluded.source,
  created_at = excluded.created_at,
  reason = excluded.reason;
COMMIT;
`,
  );
}

export async function clearWorkPauseState(databasePath: string): Promise<void> {
  await execSqlite(
    databasePath,
    `
BEGIN IMMEDIATE;
DELETE FROM work_pause WHERE id = 'current';
COMMIT;
`,
  );
}

export async function createRunJournal(databasePath: string, options: RunJournalWriteOptions): Promise<void> {
  await execSqlite(
    databasePath,
    `
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
INSERT INTO run_journals (
  id,
  project_id,
  phase,
  status,
  summary,
  journal_json,
  created_at,
  updated_at
) VALUES (
  ${sqlString(options.id)},
  ${sqlString(options.projectId)},
  ${sqlString(options.phase)},
  ${sqlString(options.status)},
  ${sqlString(options.summary)},
  ${sqlString(options.journalJson)},
  ${sqlString(options.now)},
  ${sqlString(options.now)}
);
COMMIT;
`,
  );
}

export async function updateRunJournal(
  databasePath: string,
  options: Omit<RunJournalWriteOptions, "projectId">,
): Promise<void> {
  await execSqlite(
    databasePath,
    `
BEGIN IMMEDIATE;
UPDATE run_journals
SET
  phase = ${sqlString(options.phase)},
  status = ${sqlString(options.status)},
  summary = ${sqlString(options.summary)},
  journal_json = ${sqlString(options.journalJson)},
  updated_at = ${sqlString(options.now)}
WHERE id = ${sqlString(options.id)};
COMMIT;
`,
  );
}

export async function recordProjectBlocker(
  databasePath: string,
  options: {
    id: string;
    projectId: string;
    summary: string;
    details?: string | undefined;
    now: string;
  },
): Promise<void> {
  await execSqlite(
    databasePath,
    `
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
INSERT INTO project_blockers (
  id,
  project_id,
  status,
  summary,
  details,
  created_at
) VALUES (
  ${sqlString(options.id)},
  ${sqlString(options.projectId)},
  'open',
  ${sqlString(options.summary)},
  ${sqlString(options.details ?? null)},
  ${sqlString(options.now)}
)
ON CONFLICT(id) DO NOTHING;
COMMIT;
`,
  );
}

export async function resolveProjectBlockers(
  databasePath: string,
  options: {
    projectId: string;
    summary: string;
    now: string;
  },
): Promise<number> {
  const rows = await querySqliteJson<{ changed: unknown }>(
    databasePath,
    `
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
UPDATE project_blockers
SET
  status = 'resolved',
  resolved_at = ${sqlString(options.now)}
WHERE
  project_id = ${sqlString(options.projectId)}
  AND status = 'open'
  AND summary = ${sqlString(options.summary)};
SELECT changes() AS changed;
COMMIT;
`,
  );

  return readNumber(rows[0]?.changed ?? 0, "changed");
}

export async function recordExternalValidationRun(
  databasePath: string,
  record: ExternalValidationRunRecord,
): Promise<void> {
  await execSqlite(
    databasePath,
    `
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
INSERT INTO external_validation_runs (
  id,
  project_id,
  provider,
  repo,
  workflow_id,
  ref,
  provider_run_id,
  provider_url,
  status,
  conclusion,
  requested_at,
  started_at,
  completed_at,
  checked_at,
  error_summary
) VALUES (
  ${sqlString(record.id)},
  ${sqlString(record.projectId)},
  ${sqlString(record.provider)},
  ${sqlString(record.repo)},
  ${sqlString(record.workflowId)},
  ${sqlString(record.ref)},
  ${sqlString(record.providerRunId ?? null)},
  ${sqlString(record.providerUrl ?? null)},
  ${sqlString(record.status)},
  ${sqlString(record.conclusion ?? null)},
  ${sqlString(record.requestedAt)},
  ${sqlString(record.startedAt ?? null)},
  ${sqlString(record.completedAt ?? null)},
  ${sqlString(record.checkedAt)},
  ${sqlString(record.errorSummary ?? null)}
)
ON CONFLICT(id) DO UPDATE SET
  provider_run_id = excluded.provider_run_id,
  provider_url = excluded.provider_url,
  status = excluded.status,
  conclusion = excluded.conclusion,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  checked_at = excluded.checked_at,
  error_summary = excluded.error_summary;
COMMIT;
`,
  );
}

export async function readLatestExternalValidationRun(
  databasePath: string,
  projectId: string,
): Promise<ExternalValidationRunRecord | undefined> {
  const rows = await querySqliteJson<ExternalValidationRunRow>(
    databasePath,
    `
SELECT
  id,
  project_id AS projectId,
  provider,
  repo,
  workflow_id AS workflowId,
  ref,
  provider_run_id AS providerRunId,
  provider_url AS providerUrl,
  status,
  conclusion,
  requested_at AS requestedAt,
  started_at AS startedAt,
  completed_at AS completedAt,
  checked_at AS checkedAt,
  error_summary AS errorSummary
FROM external_validation_runs
WHERE project_id = ${sqlString(projectId)}
ORDER BY checked_at DESC, requested_at DESC
LIMIT 1;
`,
  );

  const row = rows[0];
  return row ? externalValidationRunFromRow(row) : undefined;
}

export async function readOpenProjectBlockers(
  databasePath: string,
  projectId: string,
): Promise<ProjectBlockerRecord[]> {
  const rows = await querySqliteJson<ProjectBlockerRow>(
    databasePath,
    `
SELECT
  id,
  project_id AS projectId,
  summary,
  status,
  details,
  created_at AS createdAt,
  resolved_at AS resolvedAt
FROM project_blockers
WHERE project_id = ${sqlString(projectId)} AND status = 'open'
ORDER BY created_at ASC, id ASC;
`,
  );

  return rows.map(projectBlockerFromRow);
}

export async function beginIdempotentOperation(
  databasePath: string,
  options: {
    idempotencyKey: string;
    operation: string;
    projectId?: string;
    requestHash: string;
    now: string;
  },
): Promise<IdempotencyOperationRecord> {
  const rows = await querySqliteJson<IdempotencyOperationRow>(
    databasePath,
    `
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
INSERT INTO idempotency_keys (
  idempotency_key,
  operation,
  project_id,
  request_hash,
  status,
  created_at,
  updated_at
) VALUES (
  ${sqlString(options.idempotencyKey)},
  ${sqlString(options.operation)},
  ${sqlString(options.projectId ?? null)},
  ${sqlString(options.requestHash)},
  'started',
  ${sqlString(options.now)},
  ${sqlString(options.now)}
)
ON CONFLICT(idempotency_key) DO UPDATE SET
  operation = excluded.operation,
  project_id = excluded.project_id,
  request_hash = excluded.request_hash,
  status = 'started',
  updated_at = excluded.updated_at
WHERE idempotency_keys.status != 'completed';
SELECT
  idempotency_key AS idempotencyKey,
  operation,
  project_id AS projectId,
  request_hash AS requestHash,
  status,
  response_json AS responseJson,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM idempotency_keys
WHERE idempotency_key = ${sqlString(options.idempotencyKey)}
LIMIT 1;
COMMIT;
`,
  );

  const row = rows[0];
  if (!row) {
    throw new Error("idempotency operation did not return a row");
  }

  return idempotencyOperationFromRow(row);
}

export async function recordIdempotentOperationResult(
  databasePath: string,
  options: {
    idempotencyKey: string;
    status: IdempotencyOperationStatus;
    responseJson?: string;
    now: string;
  },
): Promise<void> {
  await execSqlite(
    databasePath,
    `
BEGIN IMMEDIATE;
UPDATE idempotency_keys
SET
  status = ${sqlString(options.status)},
  response_json = ${sqlString(options.responseJson ?? null)},
  updated_at = ${sqlString(options.now)}
WHERE idempotency_key = ${sqlString(options.idempotencyKey)};
COMMIT;
`,
  );
}

export async function recordSchedulerTick(databasePath: string, record: SchedulerTickRecord): Promise<void> {
  const tickJson = JSON.stringify(record);
  const cursorStatements = record.decisions
    .map((decision) => schedulerCursorUpsertSql(decision, record.tickedAt))
    .join("\n");

  await execSqlite(
    databasePath,
    `
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
INSERT INTO scheduler_ticks (
  id,
  budget_provider,
  budget_mode,
  selected_project_id,
  active_build_agent_lock,
  ticked_at,
  tick_json
) VALUES (
  'current',
  ${sqlString(record.budgetProvider)},
  ${sqlString(record.budgetMode)},
  ${sqlString(record.selectedProjectId ?? null)},
  ${sqlString(record.activeBuildAgentLock)},
  ${sqlString(record.tickedAt)},
  ${sqlString(tickJson)}
)
ON CONFLICT(id) DO UPDATE SET
  budget_provider = excluded.budget_provider,
  budget_mode = excluded.budget_mode,
  selected_project_id = excluded.selected_project_id,
  active_build_agent_lock = excluded.active_build_agent_lock,
  ticked_at = excluded.ticked_at,
  tick_json = excluded.tick_json;
${cursorStatements}
COMMIT;
`,
  );
}

export async function readTelegramUpdateCursor(databasePath: string): Promise<number | undefined> {
  const rows = await querySqliteJson<TelegramUpdateCursorRow>(
    databasePath,
    `
SELECT last_update_id AS lastUpdateId
FROM telegram_update_cursor
WHERE id = 'current'
LIMIT 1;
`,
  );

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  return readNumber(row.lastUpdateId, "lastUpdateId");
}

export async function recordTelegramUpdateCursor(
  databasePath: string,
  options: {
    lastUpdateId: number;
    updatedAt: string;
  },
): Promise<void> {
  await execSqlite(
    databasePath,
    `
BEGIN IMMEDIATE;
INSERT INTO telegram_update_cursor (
  id,
  last_update_id,
  updated_at
) VALUES (
  'current',
  ${options.lastUpdateId},
  ${sqlString(options.updatedAt)}
)
ON CONFLICT(id) DO UPDATE SET
  last_update_id = excluded.last_update_id,
  updated_at = excluded.updated_at;
COMMIT;
`,
  );
}

export async function readNotificationDeliveryState(
  databasePath: string,
  id: string,
): Promise<NotificationDeliveryState | undefined> {
  const rows = await querySqliteJson<NotificationDeliveryStateRow>(
    databasePath,
    `
SELECT
  id,
  last_sent_at AS lastSentAt,
  metadata_json AS metadataJson,
  updated_at AS updatedAt
FROM notification_delivery_state
WHERE id = ${sqlString(id)}
LIMIT 1;
`,
  );

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  const state: NotificationDeliveryState = {
    id: readString(row.id, "notificationDelivery.id"),
    updatedAt: readString(row.updatedAt, "notificationDelivery.updatedAt"),
  };
  const lastSentAt = readOptionalString(row.lastSentAt, "notificationDelivery.lastSentAt");
  if (lastSentAt) {
    state.lastSentAt = lastSentAt;
  }
  const metadataJson = readOptionalString(row.metadataJson, "notificationDelivery.metadataJson");
  if (metadataJson) {
    state.metadataJson = metadataJson;
  }
  return state;
}

export async function recordNotificationDelivery(
  databasePath: string,
  options: {
    id: string;
    lastSentAt: string;
    metadataJson?: string | undefined;
    updatedAt: string;
  },
): Promise<void> {
  await execSqlite(
    databasePath,
    `
BEGIN IMMEDIATE;
INSERT INTO notification_delivery_state (
  id,
  last_sent_at,
  metadata_json,
  updated_at
) VALUES (
  ${sqlString(options.id)},
  ${sqlString(options.lastSentAt)},
  ${sqlString(options.metadataJson ?? null)},
  ${sqlString(options.updatedAt)}
)
ON CONFLICT(id) DO UPDATE SET
  last_sent_at = excluded.last_sent_at,
  metadata_json = excluded.metadata_json,
  updated_at = excluded.updated_at;
COMMIT;
`,
  );
}

export async function recordTelegramUnauthorizedAttempt(
  databasePath: string,
  options: {
    sourceKey: string;
    attemptedAt: string;
    windowMs: number;
  },
): Promise<TelegramUnauthorizedAttemptRecord> {
  const previous = await readTelegramUnauthorizedAttempt(databasePath, options.sourceKey);
  const previousWindowStartMs = previous ? Date.parse(previous.windowStartedAt) : Number.NaN;
  const attemptedAtMs = Date.parse(options.attemptedAt);
  const resetWindow =
    !previous ||
    Number.isNaN(previousWindowStartMs) ||
    Number.isNaN(attemptedAtMs) ||
    attemptedAtMs - previousWindowStartMs > options.windowMs;
  const windowStartedAt = resetWindow ? options.attemptedAt : previous?.windowStartedAt ?? options.attemptedAt;
  const attemptCount = resetWindow ? 1 : (previous?.attemptCount ?? 0) + 1;
  const lastAlertAt = resetWindow ? undefined : previous?.lastAlertAt;
  const suppressedUntil = resetWindow ? undefined : previous?.suppressedUntil;
  const lastAlertAttemptCount = resetWindow ? undefined : previous?.lastAlertAttemptCount;

  await execSqlite(
    databasePath,
    `
BEGIN IMMEDIATE;
INSERT INTO telegram_unauthorized_attempt_state (
  source_key,
  window_started_at,
  last_attempt_at,
  attempt_count,
  last_alert_at,
  suppressed_until,
  last_alert_attempt_count,
  updated_at
) VALUES (
  ${sqlString(options.sourceKey)},
  ${sqlString(windowStartedAt)},
  ${sqlString(options.attemptedAt)},
  ${attemptCount},
  ${sqlString(lastAlertAt ?? null)},
  ${sqlString(suppressedUntil ?? null)},
  ${lastAlertAttemptCount ?? "NULL"},
  ${sqlString(options.attemptedAt)}
)
ON CONFLICT(source_key) DO UPDATE SET
  window_started_at = excluded.window_started_at,
  last_attempt_at = excluded.last_attempt_at,
  attempt_count = excluded.attempt_count,
  last_alert_at = excluded.last_alert_at,
  suppressed_until = excluded.suppressed_until,
  last_alert_attempt_count = excluded.last_alert_attempt_count,
  updated_at = excluded.updated_at;
COMMIT;
`,
  );

  const record = await readTelegramUnauthorizedAttempt(databasePath, options.sourceKey);
  if (!record) {
    throw new Error("telegram unauthorized attempt state was not recorded");
  }
  return record;
}

export async function recordTelegramUnauthorizedAlert(
  databasePath: string,
  options: {
    sourceKey: string;
    alertAt: string;
    suppressedUntil: string;
    lastAlertAttemptCount: number;
  },
): Promise<void> {
  await execSqlite(
    databasePath,
    `
BEGIN IMMEDIATE;
UPDATE telegram_unauthorized_attempt_state
SET
  last_alert_at = ${sqlString(options.alertAt)},
  suppressed_until = ${sqlString(options.suppressedUntil)},
  last_alert_attempt_count = ${options.lastAlertAttemptCount},
  updated_at = ${sqlString(options.alertAt)}
WHERE source_key = ${sqlString(options.sourceKey)};
COMMIT;
`,
  );
}

async function readSchedulerRuntimeStatus(databasePath: string): Promise<SchedulerRuntimeStatus | undefined> {
  const rows = await querySqliteJson<SchedulerTickRow>(
    databasePath,
    `
SELECT
  budget_provider AS budgetProvider,
  budget_mode AS budgetMode,
  selected_project_id AS selectedProjectId,
  active_build_agent_lock AS activeBuildAgentLock,
  ticked_at AS tickedAt,
  tick_json AS tickJson
FROM scheduler_ticks
WHERE id = 'current'
LIMIT 1;
`,
  );

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  const status: SchedulerRuntimeStatus = {
    lastTickAt: readString(row.tickedAt, "tickedAt"),
    budgetProvider: readString(row.budgetProvider, "budgetProvider"),
    budgetMode: readBudgetMode(row.budgetMode),
    activeBuildAgentLock: readActiveBuildAgentLockStatus(row.activeBuildAgentLock),
    decisions: readSchedulerDecisions(row.tickJson),
  };

  const codexUsage = readSchedulerCodexUsage(row.tickJson);
  if (codexUsage) {
    status.codexUsage = codexUsage;
  }

  const selectedProjectId = readOptionalString(row.selectedProjectId, "selectedProjectId");
  if (selectedProjectId) {
    status.selectedProjectId = selectedProjectId;
  }

  return status;
}

function schedulerCursorUpsertSql(decision: SchedulerDecisionRecord, tickedAt: string): string {
  return `
INSERT INTO scheduler_cursors (
  project_id,
  last_checked_at,
  last_decision,
  last_reason,
  last_selected_at,
  last_deferred_at,
  updated_at
) VALUES (
  ${sqlString(decision.projectId)},
  ${sqlString(tickedAt)},
  ${sqlString(decision.decision)},
  ${sqlString(decision.reason)},
  ${decision.decision === "selected" ? sqlString(tickedAt) : "NULL"},
  ${decision.decision === "deferred" ? sqlString(tickedAt) : "NULL"},
  ${sqlString(tickedAt)}
)
ON CONFLICT(project_id) DO UPDATE SET
  last_checked_at = excluded.last_checked_at,
  last_decision = excluded.last_decision,
  last_reason = excluded.last_reason,
  last_selected_at = COALESCE(excluded.last_selected_at, scheduler_cursors.last_selected_at),
  last_deferred_at = COALESCE(excluded.last_deferred_at, scheduler_cursors.last_deferred_at),
  updated_at = excluded.updated_at;
`;
}

interface ActiveBuildAgentLockRow {
  projectId: unknown;
  runJournalId: unknown;
  acquiredAt: unknown;
}

interface WorkPauseRow {
  pausedUntil: unknown;
  source: unknown;
  createdAt: unknown;
  reason: unknown;
}

interface IdempotencyOperationRow {
  idempotencyKey: unknown;
  operation: unknown;
  projectId: unknown;
  requestHash: unknown;
  status: unknown;
  responseJson: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

interface SchedulerTickRow {
  budgetProvider: unknown;
  budgetMode: unknown;
  selectedProjectId: unknown;
  activeBuildAgentLock: unknown;
  tickedAt: unknown;
  tickJson: unknown;
}

interface TelegramUpdateCursorRow {
  lastUpdateId: unknown;
}

interface NotificationDeliveryStateRow {
  id: unknown;
  lastSentAt: unknown;
  metadataJson: unknown;
  updatedAt: unknown;
}

interface TelegramUnauthorizedAttemptRow {
  sourceKey: unknown;
  windowStartedAt: unknown;
  lastAttemptAt: unknown;
  attemptCount: unknown;
  lastAlertAt: unknown;
  suppressedUntil: unknown;
  lastAlertAttemptCount: unknown;
}

interface ExternalValidationRunRow {
  id: unknown;
  projectId: unknown;
  provider: unknown;
  repo: unknown;
  workflowId: unknown;
  ref: unknown;
  providerRunId: unknown;
  providerUrl: unknown;
  status: unknown;
  conclusion: unknown;
  requestedAt: unknown;
  startedAt: unknown;
  completedAt: unknown;
  checkedAt: unknown;
  errorSummary: unknown;
}

interface ProjectBlockerRow {
  id: unknown;
  projectId: unknown;
  summary: unknown;
  status: unknown;
  details: unknown;
  createdAt: unknown;
  resolvedAt: unknown;
}

async function readRepoStatusNextAction(workspaceRoot: string, projectId: string): Promise<string | undefined> {
  for (const statusFileName of ["status.md", "STATUS.md"]) {
    try {
      const statusMarkdown = await readFile(
        workspacePath(workspaceRoot, "repos", projectId, "docs", statusFileName),
        "utf8",
      );
      const nextAction = extractStatusNextAction(statusMarkdown);
      if (nextAction) {
        return nextAction;
      }
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
  }

  return undefined;
}

async function readTelegramUnauthorizedAttempt(
  databasePath: string,
  sourceKey: string,
): Promise<TelegramUnauthorizedAttemptRecord | undefined> {
  const rows = await querySqliteJson<TelegramUnauthorizedAttemptRow>(
    databasePath,
    `
SELECT
  source_key AS sourceKey,
  window_started_at AS windowStartedAt,
  last_attempt_at AS lastAttemptAt,
  attempt_count AS attemptCount,
  last_alert_at AS lastAlertAt,
  suppressed_until AS suppressedUntil,
  last_alert_attempt_count AS lastAlertAttemptCount
FROM telegram_unauthorized_attempt_state
WHERE source_key = ${sqlString(sourceKey)}
LIMIT 1;
`,
  );

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  const record: TelegramUnauthorizedAttemptRecord = {
    sourceKey: readString(row.sourceKey, "telegramUnauthorized.sourceKey"),
    windowStartedAt: readString(row.windowStartedAt, "telegramUnauthorized.windowStartedAt"),
    lastAttemptAt: readString(row.lastAttemptAt, "telegramUnauthorized.lastAttemptAt"),
    attemptCount: readNumber(row.attemptCount, "telegramUnauthorized.attemptCount"),
  };
  const lastAlertAt = readOptionalString(row.lastAlertAt, "telegramUnauthorized.lastAlertAt");
  if (lastAlertAt) {
    record.lastAlertAt = lastAlertAt;
  }
  const suppressedUntil = readOptionalString(row.suppressedUntil, "telegramUnauthorized.suppressedUntil");
  if (suppressedUntil) {
    record.suppressedUntil = suppressedUntil;
  }
  const lastAlertAttemptCount = readOptionalNumber(
    row.lastAlertAttemptCount,
    "telegramUnauthorized.lastAlertAttemptCount",
  );
  if (lastAlertAttemptCount !== undefined) {
    record.lastAlertAttemptCount = lastAlertAttemptCount;
  }
  return record;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function execSqlite(databasePath: string, sql: string): Promise<void> {
  const result = await runSqlite(sqliteArgs(databasePath), sql);
  if (result.exitCode !== 0) {
    throw new Error(firstLine(result.stderr) || firstLine(result.stdout) || "sqlite command failed");
  }
}

async function querySqliteJson<T>(databasePath: string, sql: string): Promise<T[]> {
  const result = await runSqlite(sqliteArgs(databasePath, { json: true }), sql);
  if (result.exitCode !== 0) {
    throw new Error(firstLine(result.stderr) || firstLine(result.stdout) || "sqlite query failed");
  }

  if (result.stdout.trim().length === 0) {
    return [];
  }

  const parsed = JSON.parse(result.stdout) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("sqlite JSON query did not return an array");
  }

  return parsed as T[];
}

function sqliteArgs(databasePath: string, options?: { json?: boolean | undefined }): string[] {
  const args = ["-batch"];
  if (options?.json === true) {
    args.push("-json");
  }
  args.push("-cmd", ".timeout 5000", databasePath);
  return args;
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runSqlite(args: string[], input: string): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn("sqlite3", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    child.stdin.end(input);
  });
}

function sqlString(value: string | null): string {
  if (value === null) {
    return "NULL";
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function readString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`project status row has invalid ${name}`);
  }

  return value;
}

function readOptionalString(value: unknown, name: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`project status row has invalid optional ${name}`);
  }

  return value;
}

function readNumber(value: unknown, name: string): number {
  if (typeof value !== "number") {
    throw new Error(`project status row has invalid ${name}`);
  }

  return value;
}

function readOptionalNumber(value: unknown, name: string): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "number") {
    throw new Error(`project status row has invalid optional ${name}`);
  }

  return value;
}

function readProjectMode(value: unknown): ProjectMode {
  if (value === "safe-watcher" || value === "builder") {
    return value;
  }

  throw new Error("project status row has invalid mode");
}

function readBudgetMode(value: unknown): SchedulerBudgetMode {
  if (value === "normal" || value === "conservative" || value === "critical" || value === "exhausted") {
    return value;
  }

  throw new Error("scheduler row has invalid budgetMode");
}

function readIdempotencyStatus(value: unknown): IdempotencyOperationStatus {
  if (value === "started" || value === "completed" || value === "failed") {
    return value;
  }

  throw new Error("idempotency row has invalid status");
}

function readActiveBuildAgentLockStatus(value: unknown): "available" | "held" {
  if (value === "available" || value === "held") {
    return value;
  }

  throw new Error("scheduler row has invalid activeBuildAgentLock");
}

function readSchedulerDecisions(value: unknown): SchedulerDecisionRecord[] {
  const tick = JSON.parse(readString(value, "tickJson")) as unknown;
  if (!tick || typeof tick !== "object" || !("decisions" in tick) || !Array.isArray(tick.decisions)) {
    throw new Error("scheduler tick JSON has invalid decisions");
  }

  return tick.decisions.map((decision, index) => readSchedulerDecision(decision, index));
}

function readSchedulerCodexUsage(value: unknown): CodexBudgetUsageSummary | undefined {
  const tick = JSON.parse(readString(value, "tickJson")) as unknown;
  if (!tick || typeof tick !== "object" || Array.isArray(tick)) {
    return undefined;
  }

  const usage = (tick as Record<string, unknown>)["codexUsage"];
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return undefined;
  }

  const object = usage as Record<string, unknown>;
  const source = object["source"];
  if (source !== "codex-jsonl") {
    return undefined;
  }

  const summary: CodexBudgetUsageSummary = {
    checkedAt: readString(object["checkedAt"], "codexUsage.checkedAt"),
    source,
    codexHome: readString(object["codexHome"], "codexUsage.codexHome"),
    lookbackDays: readNumber(object["lookbackDays"], "codexUsage.lookbackDays"),
    filesScanned: readNumber(object["filesScanned"], "codexUsage.filesScanned"),
    tokenEvents: readNumber(object["tokenEvents"], "codexUsage.tokenEvents"),
    inputTokens: readNumber(object["inputTokens"], "codexUsage.inputTokens"),
    cachedInputTokens: readNumber(object["cachedInputTokens"], "codexUsage.cachedInputTokens"),
    outputTokens: readNumber(object["outputTokens"], "codexUsage.outputTokens"),
    totalTokens: readNumber(object["totalTokens"], "codexUsage.totalTokens"),
  };

  const latestRateLimitObservedAt = readOptionalString(
    object["latestRateLimitObservedAt"],
    "codexUsage.latestRateLimitObservedAt",
  );
  if (latestRateLimitObservedAt) {
    summary.latestRateLimitObservedAt = latestRateLimitObservedAt;
  }

  const primaryUsedPercent = readOptionalNumber(object["primaryUsedPercent"], "codexUsage.primaryUsedPercent");
  if (primaryUsedPercent !== undefined) {
    summary.primaryUsedPercent = primaryUsedPercent;
  }

  const secondaryUsedPercent = readOptionalNumber(object["secondaryUsedPercent"], "codexUsage.secondaryUsedPercent");
  if (secondaryUsedPercent !== undefined) {
    summary.secondaryUsedPercent = secondaryUsedPercent;
  }

  const planType = readOptionalString(object["planType"], "codexUsage.planType");
  if (planType) {
    summary.planType = planType;
  }

  return summary;
}

function readSchedulerDecision(value: unknown, index: number): SchedulerDecisionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`scheduler decision ${index} must be an object`);
  }

  const object = value as Record<string, unknown>;
  const status = object["decision"];
  if (status !== "selected" && status !== "deferred") {
    throw new Error(`scheduler decision ${index} has invalid decision`);
  }

  return {
    projectId: readString(object["projectId"], "projectId"),
    displayName: readString(object["displayName"], "displayName"),
    decision: status,
    reason: readString(object["reason"], "reason"),
  };
}

function idempotencyOperationFromRow(row: IdempotencyOperationRow): IdempotencyOperationRecord {
  const record: IdempotencyOperationRecord = {
    idempotencyKey: readString(row.idempotencyKey, "idempotencyKey"),
    operation: readString(row.operation, "operation"),
    requestHash: readString(row.requestHash, "requestHash"),
    status: readIdempotencyStatus(row.status),
    createdAt: readString(row.createdAt, "createdAt"),
    updatedAt: readString(row.updatedAt, "updatedAt"),
  };

  const projectId = readOptionalString(row.projectId, "projectId");
  if (projectId) {
    record.projectId = projectId;
  }

  const responseJson = readOptionalString(row.responseJson, "responseJson");
  if (responseJson) {
    record.responseJson = responseJson;
  }

  return record;
}

function externalValidationRunFromRow(row: ExternalValidationRunRow): ExternalValidationRunRecord {
  const record: ExternalValidationRunRecord = {
    id: readString(row.id, "externalValidation.id"),
    projectId: readString(row.projectId, "externalValidation.projectId"),
    provider: readString(row.provider, "externalValidation.provider"),
    repo: readString(row.repo, "externalValidation.repo"),
    workflowId: readString(row.workflowId, "externalValidation.workflowId"),
    ref: readString(row.ref, "externalValidation.ref"),
    status: readString(row.status, "externalValidation.status"),
    requestedAt: readString(row.requestedAt, "externalValidation.requestedAt"),
    checkedAt: readString(row.checkedAt, "externalValidation.checkedAt"),
  };

  const providerRunId = readOptionalString(row.providerRunId, "externalValidation.providerRunId");
  if (providerRunId) {
    record.providerRunId = providerRunId;
  }
  const providerUrl = readOptionalString(row.providerUrl, "externalValidation.providerUrl");
  if (providerUrl) {
    record.providerUrl = providerUrl;
  }
  const conclusion = readOptionalString(row.conclusion, "externalValidation.conclusion");
  if (conclusion) {
    record.conclusion = conclusion;
  }
  const startedAt = readOptionalString(row.startedAt, "externalValidation.startedAt");
  if (startedAt) {
    record.startedAt = startedAt;
  }
  const completedAt = readOptionalString(row.completedAt, "externalValidation.completedAt");
  if (completedAt) {
    record.completedAt = completedAt;
  }
  const errorSummary = readOptionalString(row.errorSummary, "externalValidation.errorSummary");
  if (errorSummary) {
    record.errorSummary = errorSummary;
  }

  return record;
}

function projectBlockerFromRow(row: ProjectBlockerRow): ProjectBlockerRecord {
  const status = readString(row.status, "projectBlocker.status");
  if (status !== "open" && status !== "resolved") {
    throw new Error("project blocker row has invalid status");
  }

  const record: ProjectBlockerRecord = {
    id: readString(row.id, "projectBlocker.id"),
    projectId: readString(row.projectId, "projectBlocker.projectId"),
    summary: readString(row.summary, "projectBlocker.summary"),
    status,
    createdAt: readString(row.createdAt, "projectBlocker.createdAt"),
  };

  const details = readOptionalString(row.details, "projectBlocker.details");
  if (details) {
    record.details = details;
  }

  const resolvedAt = readOptionalString(row.resolvedAt, "projectBlocker.resolvedAt");
  if (resolvedAt) {
    record.resolvedAt = resolvedAt;
  }

  return record;
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
