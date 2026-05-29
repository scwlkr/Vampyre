import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runWorkPauseCommand } from "../src/control/workPause.js";
import { initializeOperationalState } from "../src/state/operationalState.js";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";

test("Work Pause command sets, reports, and clears SQLite-backed pause state", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-work-pause-"));

  try {
    const paused = await runWorkPauseCommand({
      action: "pause",
      duration: "1m",
      host: "local",
      workspaceRoot,
      local: true,
      reason: "test pause",
      now: () => new Date("2026-05-28T12:00:00.000Z"),
    });

    assert.equal(paused.ready, true);
    assert.equal(paused.workPause.active, true);
    assert.equal(paused.workPause.pausedUntil, "2026-05-28T12:01:00.000Z");
    assert.equal(paused.workPause.source, "cli");
    assert.equal(paused.workPause.reason, "test pause");

    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:00:30.000Z"),
    });
    assert.equal(state.workPause?.active, true);

    const status = await runWorkPauseCommand({
      action: "status",
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T12:00:30.000Z"),
    });
    assert.match(status.summary, /active until/);

    const resumed = await runWorkPauseCommand({
      action: "resume",
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T12:00:40.000Z"),
    });
    assert.equal(resumed.workPause.active, false);
    assert.match(resumed.summary, /cleared/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("remote Work Pause command delegates to the installed host CLI", async () => {
  const report = await runWorkPauseCommand({
    action: "pause",
    duration: "1h",
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    reason: "operator check",
    runner: async (command) => {
      assert.match(command, /app\/dist\/cli\.js/);
      assert.match(command, /pause/);
      assert.match(command, /1h/);
      assert.match(command, /--local/);
      assert.match(command, /--json/);
      assert.match(command, /operator check/);
      return ok(
        JSON.stringify({
          host: "local",
          workspaceRoot: "/home/wlkrlab/vampyre",
          ready: true,
          action: "pause",
          summary: "Work Pause active until 2026-05-28T13:00:00.000Z.",
          blockers: [],
          workPause: {
            active: true,
            pausedUntil: "2026-05-28T13:00:00.000Z",
            source: "cli",
            createdAt: "2026-05-28T12:00:00.000Z",
          },
          activeBuildAgentLock: {
            held: false,
          },
        }),
      );
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.host, "wlkrlab");
  assert.equal(report.workPause.active, true);
});

function ok(stdout: string): RemoteCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}
