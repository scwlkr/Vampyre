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
  setWorkPauseState,
  type OperationalStateReport,
  type SchedulerTickRecord,
} from "../src/state/operationalState.js";
import type { BuildAgentRunReport } from "../src/agent/buildAgent.js";
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
  assert.equal(result.buildAgentResult.status, "skipped");
});

test("daemon tick invokes the build agent after an eligible scheduler selection", async () => {
  const state = fakeOperationalState();
  const schedulerTick = fakeSelectedSchedulerTick();
  const calls: string[] = [];

  const result = await runDaemonTick({
    workspaceRoot: state.workspaceRoot,
    state,
    now: new Date("2026-05-28T19:10:00.000Z"),
    runSchedulerTick: async () => {
      calls.push("scheduler");
      return schedulerTick;
    },
    runControlSurface: async () => {
      calls.push("control-surface");
      return {
        action: "review-request",
        status: "skipped",
        summary: "review record already exists",
      };
    },
    runBuildAgent: async (options) => {
      calls.push("build-agent");
      assert.equal(options.local, true);
      assert.equal(options.host, "local");
      assert.equal(options.workspaceRoot, state.workspaceRoot);
      assert.equal(options.projectId, "palette-wow");
      assert.match(options.task ?? "", /Maintenance Queue Triage/);
      return buildAgentReport(state.workspaceRoot);
    },
  });

  assert.deepEqual(calls, ["scheduler", "control-surface", "build-agent"]);
  assert.equal(result.buildAgentResult.status, "invoked");
  assert.equal(result.buildAgentResult.projectId, "palette-wow");
  assert.equal(result.buildAgentResult.runJournalId, "run-20260528T191000Z-palette-wow");
});

test("daemon tick supplies Codex worker command for approved product-loop projects", async () => {
  const state = fakePinmarkOperationalState();
  const schedulerTick = fakePinmarkSelectedSchedulerTick();

  const result = await runDaemonTick({
    workspaceRoot: state.workspaceRoot,
    state,
    now: new Date("2026-05-29T13:00:00.000Z"),
    runSchedulerTick: async () => schedulerTick,
    runControlSurface: async () => ({
      action: "review-request",
      status: "skipped",
      summary: "review record already exists",
    }),
    runBuildAgent: async (options) => {
      assert.equal(options.local, true);
      assert.equal(options.host, "local");
      assert.equal(options.workspaceRoot, state.workspaceRoot);
      assert.equal(options.projectId, "screenshot-tool");
      assert.equal(options.task, undefined);
      assert.match(options.workerCommand ?? "", /artifacts\/npm-global\/node_modules\/\.bin\/codex/);
      assert.match(options.workerCommand ?? "", /model_reasoning_effort=xhigh/);
      assert.match(options.workerCommand ?? "", /\$VAMPYRE_TASK_CONTEXT_PATH/);
      return buildAgentReport(state.workspaceRoot, "screenshot-tool", "Pinmark");
    },
  });

  assert.equal(result.buildAgentResult.status, "invoked");
  assert.equal(result.buildAgentResult.projectId, "screenshot-tool");
});

test("daemon tick skips the build agent when no project is selected", async () => {
  const state = fakeOperationalState();
  const schedulerTick = fakeSchedulerTick();

  const result = await runDaemonTick({
    workspaceRoot: state.workspaceRoot,
    state,
    now: new Date("2026-05-28T19:20:00.000Z"),
    runSchedulerTick: async () => schedulerTick,
    runControlSurface: async () => ({
      action: "review-request",
      status: "skipped",
      summary: "no selected project",
    }),
    runBuildAgent: async () => {
      throw new Error("build agent should be skipped without a scheduler-selected project");
    },
  });

  assert.equal(result.buildAgentResult.status, "skipped");
  assert.equal(result.buildAgentResult.projectId, undefined);
});

test("daemon tick applies Telegram Work Pause before scheduling a Build Agent", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-daemon-pause-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T19:30:00.000Z"),
    });

    const result = await runDaemonTick({
      workspaceRoot,
      state,
      now: new Date("2026-05-28T19:31:00.000Z"),
      runTelegramCommands: async (options) => {
        await setWorkPauseState(options.state.databasePath, {
          pausedUntil: "2026-05-28T19:32:00.000Z",
          source: "telegram",
          createdAt: "2026-05-28T19:31:00.000Z",
          reason: "/pause1min",
        });
        return {
          status: "processed",
          summary: "Processed 1 authorized Telegram command",
          processedUpdateCount: 1,
          sentMessageCount: 1,
          stateChanged: true,
        };
      },
      runControlSurface: async () => ({
        action: "review-request",
        status: "skipped",
        summary: "work paused",
      }),
      runBuildAgent: async () => {
        throw new Error("build agent should be skipped while Work Pause is active");
      },
    });

    assert.equal(result.schedulerTick.selectedProjectId, undefined);
    assert.equal(result.schedulerTick.decisions[0]?.reason, "work-paused");
    assert.equal(result.buildAgentResult.status, "skipped");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
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
        autoSafeTasks: [
          "Update docs/STATUS.md for paletteWOW now that project-truth docs are merged: set the current phase to Maintenance Queue Triage.",
        ],
      },
    ],
  };
}

function fakePinmarkOperationalState(): OperationalStateReport {
  return {
    workspaceRoot: "/home/wlkrlab/vampyre",
    databasePath: "/home/wlkrlab/vampyre/data/vampyre.sqlite",
    registryPath: "/home/wlkrlab/vampyre/config/project-registry.json",
    registryCreated: false,
    migrationsApplied: [],
    projects: [
      {
        id: "screenshot-tool",
        displayName: "Pinmark",
        mode: "builder",
        modeLabel: "Builder",
        cadence: "builder-loop-after-owner-approval",
        autonomyPolicy: "continuous-product-loop-direct-main",
        paused: false,
        githubRepo: "scwlkr/pinmark",
        runJournalCount: 5,
        openBlockerCount: 0,
        autoSafeTasks: ["stale registry task that should not be passed by the daemon"],
      },
    ],
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

function fakeSelectedSchedulerTick(): SchedulerTickRecord {
  return {
    tickedAt: "2026-05-28T19:10:00.000Z",
    budgetProvider: "codex",
    budgetMode: "conservative",
    activeBuildAgentLock: "available",
    selectedProjectId: "palette-wow",
    decisions: [
      {
        projectId: "palette-wow",
        displayName: "paletteWOW",
        decision: "selected",
        reason: "eligible",
      },
    ],
  };
}

function fakePinmarkSelectedSchedulerTick(): SchedulerTickRecord {
  return {
    tickedAt: "2026-05-29T13:00:00.000Z",
    budgetProvider: "codex",
    budgetMode: "conservative",
    activeBuildAgentLock: "available",
    selectedProjectId: "screenshot-tool",
    decisions: [
      {
        projectId: "screenshot-tool",
        displayName: "Pinmark",
        decision: "selected",
        reason: "eligible",
      },
    ],
  };
}

function buildAgentReport(
  workspaceRoot: string,
  projectId = "palette-wow",
  displayName = "paletteWOW",
): BuildAgentRunReport {
  return {
    host: "local",
    workspaceRoot,
    ready: true,
    blockers: [],
    startedAt: "2026-05-28T19:10:00.000Z",
    completedAt: "2026-05-28T19:10:00.000Z",
    project: {
      id: projectId,
      displayName,
      mode: "Safe/Watcher",
      githubRepo: projectId === "screenshot-tool" ? "scwlkr/pinmark" : "scwlkr/paletteWOW",
    },
    runJournal: {
      id: projectId === "screenshot-tool" ? "run-20260529T130000Z-screenshot-tool" : "run-20260528T191000Z-palette-wow",
      phase: "worktree-build-agent",
      status: "completed",
      summary: `Completed Worktree Build Agent dry-run for ${displayName}`,
    },
    reportPaths: {
      markdown:
        projectId === "screenshot-tool"
          ? "/home/wlkrlab/vampyre/reports/build-agent/screenshot-tool/run-20260529T130000Z-screenshot-tool.md"
          : "/home/wlkrlab/vampyre/reports/build-agent/palette-wow/run-20260528T191000Z-palette-wow.md",
      json:
        projectId === "screenshot-tool"
          ? "/home/wlkrlab/vampyre/reports/build-agent/screenshot-tool/run-20260529T130000Z-screenshot-tool.json"
          : "/home/wlkrlab/vampyre/reports/build-agent/palette-wow/run-20260528T191000Z-palette-wow.json",
    },
    proof: ["Recorded scheduler tick 2026-05-28T19:10:00.000Z"],
  };
}
