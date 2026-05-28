import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { initializeOperationalState } from "../src/state/operationalState.js";

test("operational state migrates, syncs profiles, and is restart-safe", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-state-"));

  try {
    const first = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    });

    assert.equal(first.registryCreated, true);
    assert.deepEqual(first.migrationsApplied, ["0001_operational_state"]);
    assert.deepEqual(
      first.projects.map((project) => `${project.id}:${project.mode}`),
      ["palette-wow:safe-watcher", "screenshot-tool:builder"],
    );
    assert.deepEqual(
      first.projects.map((project) => project.openBlockerCount),
      [0, 0],
    );

    const tables = spawnSync("sqlite3", [first.databasePath, ".tables"], { encoding: "utf8" });
    assert.equal(tables.status, 0);
    assert.match(tables.stdout, /run_journals/);
    assert.match(tables.stdout, /project_blockers/);
    assert.match(tables.stdout, /idempotency_keys/);

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
