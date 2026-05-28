import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  formatProjectMode,
  loadProjectRegistry,
  type ProjectMode,
  type ProjectProfile,
} from "../registry/projectRegistry.js";
import { workspacePath } from "../remote/paths.js";

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
  latestRunJournalAt?: string;
  githubRepo?: string;
  rawIdea?: string;
}

export interface OperationalStateReport {
  workspaceRoot: string;
  databasePath: string;
  registryPath: string;
  registryCreated: boolean;
  migrationsApplied: string[];
  projects: ProjectRuntimeStatus[];
  scheduler?: SchedulerRuntimeStatus;
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
  selectedProjectId?: string;
}

export interface SchedulerRuntimeStatus {
  lastTickAt: string;
  budgetProvider: string;
  budgetMode: SchedulerBudgetMode;
  activeBuildAgentLock: "available" | "held";
  decisions: SchedulerDecisionRecord[];
  selectedProjectId?: string;
}

export interface ActiveBuildAgentLockSnapshot {
  held: boolean;
  projectId?: string;
  runJournalId?: string;
  acquiredAt?: string;
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
];

export async function initializeOperationalState(
  options: OperationalStateOptions,
): Promise<OperationalStateReport> {
  const now = options.now ?? (() => new Date());
  const databasePath = operationalDatabasePath(options.workspaceRoot);
  await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 });

  const loadedRegistry = await loadProjectRegistry(options.workspaceRoot);
  const migrationsApplied = await applyMigrations(databasePath, now);
  await syncProjectProfiles(databasePath, loadedRegistry.registry.projects, now);
  const projects = await listProjectStatuses(databasePath);
  const scheduler = await readSchedulerRuntimeStatus(databasePath);

  const report: OperationalStateReport = {
    workspaceRoot: options.workspaceRoot,
    databasePath,
    registryPath: loadedRegistry.path,
    registryCreated: loadedRegistry.created,
    migrationsApplied,
    projects,
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
INSERT INTO schema_migrations (id, applied_at)
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

async function listProjectStatuses(databasePath: string): Promise<ProjectRuntimeStatus[]> {
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

  return rows.map(projectStatusFromRow);
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

  return project;
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

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
