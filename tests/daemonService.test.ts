import assert from "node:assert/strict";
import test from "node:test";
import { runDaemonCommand } from "../src/daemon/manageDaemon.js";
import { createHeartbeatPayload } from "../src/daemon/runDaemon.js";
import { buildServiceUnit } from "../src/daemon/service.js";
import { workspaceRootPrelude } from "../src/remote/paths.js";
import type { OperationalStateReport } from "../src/state/operationalState.js";

test("service unit points at the deployed daemon entrypoint and env file", () => {
  const unit = buildServiceUnit("/home/wlkrlab/vampyre");

  assert.match(unit, /WorkingDirectory=\/home\/wlkrlab\/vampyre\/app/);
  assert.match(unit, /EnvironmentFile=\/home\/wlkrlab\/vampyre\/config\/vampyre\.env/);
  assert.match(unit, /ExecStart=\/usr\/bin\/node \/home\/wlkrlab\/vampyre\/app\/dist\/daemon\/runDaemon\.js/);
  assert.match(unit, /Restart=on-failure/);
});

test("daemon heartbeat does not include secret values", () => {
  const payload = createHeartbeatPayload("/home/wlkrlab/vampyre", new Date("2026-05-28T00:00:00.000Z"));

  assert.deepEqual(JSON.parse(payload), {
    event: "heartbeat",
    component: "vampyre-daemon",
    workspaceRoot: "/home/wlkrlab/vampyre",
    scheduler: "not-started",
    agent: "not-started",
    at: "2026-05-28T00:00:00.000Z",
  });
  assert.doesNotMatch(payload, /TOKEN|SECRET|KEY=/);
});

test("daemon heartbeat includes operational state readiness after startup", () => {
  const payload = createHeartbeatPayload(
    "/home/wlkrlab/vampyre",
    new Date("2026-05-28T00:00:00.000Z"),
    fakeOperationalState(),
  );

  assert.deepEqual(JSON.parse(payload), {
    event: "heartbeat",
    component: "vampyre-daemon",
    workspaceRoot: "/home/wlkrlab/vampyre",
    scheduler: "not-started",
    agent: "not-started",
    at: "2026-05-28T00:00:00.000Z",
    operationalState: "ready",
    projectCount: 1,
    databasePath: "/home/wlkrlab/vampyre/data/vampyre.sqlite",
    registryPath: "/home/wlkrlab/vampyre/config/project-registry.json",
  });
  assert.doesNotMatch(payload, /TOKEN|SECRET|KEY=/);
});

test("workspace root prelude expands tilde on the remote host", () => {
  const prelude = workspaceRootPrelude("~/vampyre");

  assert.match(prelude, /root='~\/vampyre'/);
  assert.match(prelude, /root="\$HOME\/\$\{root#\\~\/\}"/);
});

test("daemon status command wraps systemctl user status", async () => {
  const report = await runDaemonCommand({
    action: "status",
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async (command) => {
      assert.equal(command, "systemctl --user status vampyre.service --no-pager");
      return {
        exitCode: 0,
        stdout: "vampyre.service active",
        stderr: "",
      };
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.output, "vampyre.service active");
});

function fakeOperationalState(): OperationalStateReport {
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
