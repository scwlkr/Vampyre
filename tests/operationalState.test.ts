import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { initializeOperationalState, recordProjectBlocker, resolveProjectBlockers } from "../src/state/operationalState.js";

test("operational state migrates, syncs profiles, and is restart-safe", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-state-"));

  try {
    const first = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    });

    assert.equal(first.registryCreated, true);
    assert.deepEqual(first.migrationsApplied, ["0001_operational_state", "0002_scheduler_state"]);
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
    assert.match(first.projects[0]?.autoSafeTasks?.[0] ?? "", /Maintenance Queue Triage/);

    const tables = spawnSync("sqlite3", [first.databasePath, ".tables"], { encoding: "utf8" });
    assert.equal(tables.status, 0);
    assert.match(tables.stdout, /run_journals/);
    assert.match(tables.stdout, /project_blockers/);
    assert.match(tables.stdout, /idempotency_keys/);
    assert.match(tables.stdout, /scheduler_cursors/);
    assert.match(tables.stdout, /scheduler_ticks/);
    assert.match(tables.stdout, /active_build_agent_lock/);

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
