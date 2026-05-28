import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runDaemonControlSurface } from "../src/daemon/controlSurface.js";
import { runDaemonTick } from "../src/daemon/runDaemon.js";
import { runSchedulerTick } from "../src/scheduler/scheduler.js";
import {
  initializeOperationalState,
  type OperationalStateReport,
  type SchedulerTickRecord,
} from "../src/state/operationalState.js";
import type { ReviewRequestReport } from "../src/github/reviewWorkflow.js";

test("daemon control surface invokes the scheduler-selected review request once", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-control-surface-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T18:00:00.000Z"),
    });
    const schedulerTick = await runSchedulerTick({
      state,
      now: () => new Date("2026-05-28T18:01:00.000Z"),
      budgetProvider: {
        name: "codex",
        readBudget: () => ({
          provider: "codex",
          checkedAt: "2026-05-28T18:01:00.000Z",
          remainingPercent: 25,
        }),
      },
    });
    let reviewCalls = 0;

    const first = await runDaemonControlSurface({
      state,
      schedulerTick,
      now: () => new Date("2026-05-28T18:02:00.000Z"),
      runReviewRequest: async (options) => {
        reviewCalls += 1;
        assert.equal(options.local, true);
        assert.equal(options.host, "local");
        assert.equal(options.workspaceRoot, workspaceRoot);
        return reviewReport(workspaceRoot);
      },
    });

    assert.equal(first.status, "invoked");
    assert.equal(first.projectId, "palette-wow");
    assert.equal(first.issueUrl, "https://github.com/scwlkr/paletteWOW/issues/16");
    assert.equal(reviewCalls, 1);

    const second = await runDaemonControlSurface({
      state,
      schedulerTick,
      now: () => new Date("2026-05-28T18:03:00.000Z"),
      runReviewRequest: async () => {
        throw new Error("review request should be idempotently skipped");
      },
    });

    assert.equal(second.status, "skipped");
    assert.equal(second.issueUrl, "https://github.com/scwlkr/paletteWOW/issues/16");
    assert.equal(reviewCalls, 1);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("daemon tick runs scheduler before the control surface", async () => {
  const state = fakeOperationalState();
  const schedulerTick = fakeSchedulerTick();
  const calls: string[] = [];

  const result = await runDaemonTick({
    workspaceRoot: state.workspaceRoot,
    state,
    now: new Date("2026-05-28T18:10:00.000Z"),
    runSchedulerTick: async (options) => {
      calls.push("scheduler");
      assert.equal(options.state, state);
      return schedulerTick;
    },
    runControlSurface: async (options) => {
      calls.push("control-surface");
      assert.equal(options.state, state);
      assert.equal(options.schedulerTick, schedulerTick);
      return {
        action: "review-request",
        status: "skipped",
        summary: "already done",
      };
    },
  });

  assert.deepEqual(calls, ["scheduler", "control-surface"]);
  assert.equal(result.schedulerTick, schedulerTick);
  assert.equal(result.controlSurfaceResult.status, "skipped");
});

function reviewReport(workspaceRoot: string): ReviewRequestReport {
  return {
    host: "local",
    workspaceRoot,
    ready: true,
    blockers: [],
    selectedProject: {
      id: "palette-wow",
      displayName: "paletteWOW",
      mode: "Safe/Watcher",
      githubRepo: "scwlkr/paletteWOW",
    },
    scheduler: {
      lastTickAt: "2026-05-28T18:01:00.000Z",
      budget: "codex/conservative",
      selectedProjectId: "palette-wow",
      decisionReason: "selected:eligible",
    },
    github: {
      repo: "scwlkr/paletteWOW",
      labelName: "vampyre:review",
      labelAction: "updated",
      issueNumber: 16,
      issueUrl: "https://github.com/scwlkr/paletteWOW/issues/16",
      issueAction: "reused",
      commentUrl: "https://github.com/scwlkr/paletteWOW/issues/16#issuecomment-1",
    },
    telegram: {
      status: "sent",
      summary: "Telegram notification sent with GitHub review link",
      messageId: "12",
    },
  };
}

function fakeOperationalState(): OperationalStateReport {
  return {
    workspaceRoot: "/home/wlkrlab/vampyre",
    databasePath: "/home/wlkrlab/vampyre/data/vampyre.sqlite",
    registryPath: "/home/wlkrlab/vampyre/config/project-registry.json",
    registryCreated: false,
    migrationsApplied: [],
    projects: [],
  };
}

function fakeSchedulerTick(): SchedulerTickRecord {
  return {
    tickedAt: "2026-05-28T18:10:00.000Z",
    budgetProvider: "codex",
    budgetMode: "conservative",
    activeBuildAgentLock: "available",
    decisions: [],
  };
}
