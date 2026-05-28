import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { formatStatusReport, runVampyreStatus } from "../src/status/vampyreStatus.js";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";
import type { OperationalStateReport } from "../src/state/operationalState.js";

test("local status initializes state and formats both MVP projects", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-status-"));

  try {
    const report = await runVampyreStatus({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    });

    assert.equal(report.ready, true);
    assert.equal(report.state?.projects.length, 2);

    const formatted = formatStatusReport(report);
    assert.match(formatted, /paletteWOW \(palette-wow\)/);
    assert.match(formatted, /macOS Screenshot Tool \(screenshot-tool\)/);
    assert.match(formatted, /Operational State: ready/);
    assert.doesNotMatch(formatted, /TOKEN|SECRET|KEY=/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("remote status asks the installed host app for JSON status", async () => {
  const state = fakeState();
  const report = await runVampyreStatus({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async (command) => {
      assert.match(command, /node "\$cli" status --local --json --workspace-root "\$root"/);
      assert.match(command, /app\/dist\/cli\.js/);
      return ok(JSON.stringify(state));
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.state?.projects[0]?.id, "palette-wow");
});

function fakeState(): OperationalStateReport {
  return {
    workspaceRoot: "/home/wlkrlab/vampyre",
    databasePath: "/home/wlkrlab/vampyre/data/vampyre.sqlite",
    registryPath: "/home/wlkrlab/vampyre/config/project-registry.json",
    registryCreated: false,
    migrationsApplied: [],
    projects: [
      {
        id: "palette-wow",
        displayName: "paletteWOW",
        mode: "safe-watcher",
        modeLabel: "Safe/Watcher",
        cadence: "daily-forward-motion",
        autonomyPolicy: "auto-safe-work-ends-in-owner-reviewed-pr",
        paused: false,
        githubRepo: "scwlkr/paletteWOW",
        runJournalCount: 0,
        openBlockerCount: 0,
      },
    ],
  };
}

function ok(stdout: string): RemoteCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}
