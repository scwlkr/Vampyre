import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  clearWorkPauseState,
  initializeOperationalState,
  readWorkPauseRuntimeStatus,
  recordProjectBlocker,
  recordSchedulerTick,
  resolveProjectBlockers,
  setWorkPauseState,
  tryAcquireActiveBuildAgentLock,
} from "../src/state/operationalState.js";

test("operational state migrates, syncs profiles, and is restart-safe", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-state-"));

  try {
    await mkdir(join(workspaceRoot, "repos", "screenshot-tool", "docs"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "repos", "screenshot-tool", "docs", "STATUS.md"),
      "# Pinmark Status\n\n## Next action\n\nShip local export history.\n\n## Blockers\n\nNone.\n",
    );

    const first = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    });

    assert.equal(first.registryCreated, true);
    assert.deepEqual(first.migrationsApplied, [
      "0001_operational_state",
      "0002_scheduler_state",
      "0003_work_pause_and_telegram_cursor",
      "0004_notifications_and_telegram_security",
    ]);
    assert.deepEqual(
      first.projects.map((project) => `${project.id}:${project.mode}`),
      ["palette-wow:safe-watcher", "screenshot-tool:builder"],
    );
    assert.deepEqual(
      first.projects.map((project) => project.openBlockerCount),
      [0, 0],
    );
    assert.deepEqual(first.projects[0]?.validationCommands, [
      "bundle exec rails test",
      "bundle exec rails zeitwerk:check",
      "bundle exec rails assets:precompile",
    ]);
    assert.equal(first.projects[0]?.autoSafeTasks, undefined);
    assert.equal(first.projects[1]?.statusNextAction, "Ship local export history.");

    const tables = spawnSync("sqlite3", [first.databasePath, ".tables"], { encoding: "utf8" });
    assert.equal(tables.status, 0);
    assert.match(tables.stdout, /run_journals/);
    assert.match(tables.stdout, /project_blockers/);
    assert.match(tables.stdout, /idempotency_keys/);
    assert.match(tables.stdout, /scheduler_cursors/);
    assert.match(tables.stdout, /scheduler_ticks/);
    assert.match(tables.stdout, /active_build_agent_lock/);
    assert.match(tables.stdout, /work_pause/);
    assert.match(tables.stdout, /telegram_update_cursor/);
    assert.match(tables.stdout, /notification_delivery_state/);
    assert.match(tables.stdout, /telegram_unauthorized_attempt_state/);
    assert.deepEqual(first.workPause, { active: false });

    const second = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T10:01:00.000Z"),
    });

    assert.equal(second.registryCreated, false);
    assert.deepEqual(second.migrationsApplied, []);
    assert.deepEqual(
      second.projects.map((project) => project.id),
      ["palette-wow", "screenshot-tool"],
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("operational state reports the live Active Build Agent lock, not only the scheduler snapshot", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-state-lock-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    });
    await recordSchedulerTick(state.databasePath, {
      tickedAt: "2026-05-28T10:01:00.000Z",
      budgetProvider: "codex",
      budgetMode: "conservative",
      activeBuildAgentLock: "available",
      decisions: [],
    });
    await tryAcquireActiveBuildAgentLock(state.databasePath, {
      projectId: "screenshot-tool",
      runJournalId: "run-1",
      acquiredAt: "2026-05-28T10:01:30.000Z",
    });

    const refreshed = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T10:02:00.000Z"),
    });

    assert.equal(refreshed.scheduler?.activeBuildAgentLock, "held");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("operational state persists timed Work Pause state", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-state-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    });
    await setWorkPauseState(state.databasePath, {
      pausedUntil: "2026-05-28T10:05:00.000Z",
      source: "cli",
      createdAt: "2026-05-28T10:00:00.000Z",
      reason: "test pause",
    });

    const active = await readWorkPauseRuntimeStatus(state.databasePath, new Date("2026-05-28T10:01:00.000Z"));
    assert.equal(active.active, true);
    assert.equal(active.pausedUntil, "2026-05-28T10:05:00.000Z");
    assert.equal(active.source, "cli");
    assert.equal(active.reason, "test pause");

    const expired = await readWorkPauseRuntimeStatus(state.databasePath, new Date("2026-05-28T10:06:00.000Z"));
    assert.equal(expired.active, false);
    assert.equal(expired.expired, true);

    await clearWorkPauseState(state.databasePath);
    const cleared = await readWorkPauseRuntimeStatus(state.databasePath, new Date("2026-05-28T10:07:00.000Z"));
    assert.deepEqual(cleared, { active: false });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("operational state resolves matching open project blockers", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-state-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    });
    await recordProjectBlocker(state.databasePath, {
      id: "run-1:validation-failure",
      projectId: "palette-wow",
      summary: "Build Agent validation-failure",
      details: "validation failed",
      now: "2026-05-28T10:01:00.000Z",
    });
    await recordProjectBlocker(state.databasePath, {
      id: "run-2:agent-error",
      projectId: "palette-wow",
      summary: "Build Agent agent-error",
      details: "agent failed",
      now: "2026-05-28T10:02:00.000Z",
    });

    const resolved = await resolveProjectBlockers(state.databasePath, {
      projectId: "palette-wow",
      summary: "Build Agent validation-failure",
      now: "2026-05-28T10:03:00.000Z",
    });

    assert.equal(resolved, 1);
    const rows = spawnSync(
      "sqlite3",
      [
        state.databasePath,
        "select summary || ':' || status from project_blockers order by summary;",
      ],
      { encoding: "utf8" },
    );
    assert.equal(rows.status, 0);
    assert.match(rows.stdout, /Build Agent agent-error:open/);
    assert.match(rows.stdout, /Build Agent validation-failure:resolved/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
