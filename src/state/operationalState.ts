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
}

export interface OperationalStateOptions {
  workspaceRoot: string;
  now?: () => Date;
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

  return {
    workspaceRoot: options.workspaceRoot,
    databasePath,
    registryPath: loadedRegistry.path,
    registryCreated: loadedRegistry.created,
    migrationsApplied,
    projects,
  };
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
  ) AS openBlockerCount
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

  return project;
}

async function execSqlite(databasePath: string, sql: string): Promise<void> {
  const result = await runSqlite(["-batch", databasePath], sql);
  if (result.exitCode !== 0) {
    throw new Error(firstLine(result.stderr) || firstLine(result.stdout) || "sqlite command failed");
  }
}

async function querySqliteJson<T>(databasePath: string, sql: string): Promise<T[]> {
  const result = await runSqlite(["-batch", "-json", databasePath], sql);
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

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
