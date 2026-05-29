import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  releaseActiveBuildAgentLock,
  initializeOperationalState,
  tryAcquireActiveBuildAgentLock,
  type ProjectRuntimeStatus,
} from "../src/state/operationalState.js";
import {
  calculateBudgetMode,
  DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY,
  planSchedulerTick,
  runSchedulerTick,
} from "../src/scheduler/scheduler.js";

test("scheduler selects one eligible project and enforces the active build agent limit", () => {
  const tick = planSchedulerTick({
    projects: [project("palette-wow", "safe-watcher"), project("screenshot-tool", "builder")],
    now: new Date("2026-05-28T12:00:00.000Z"),
    budgetSnapshot: {
      provider: "codex",
      checkedAt: "2026-05-28T12:00:00.000Z",
      remainingPercent: 80,
    },
    activeBuildAgentLock: { held: false },
  });

  assert.equal(tick.budgetMode, "normal");
  assert.equal(tick.selectedProjectId, "palette-wow");
  assert.deepEqual(
    tick.decisions.map((decision) => `${decision.projectId}:${decision.decision}:${decision.reason}`),
    ["palette-wow:selected:eligible", "screenshot-tool:deferred:active-build-agent-limit"],
  );
});

test("scheduler defers work under exhausted budget and defers builder work under conservative budget", () => {
  const exhausted = planSchedulerTick({
    projects: [project("palette-wow", "safe-watcher")],
    now: new Date("2026-05-28T12:00:00.000Z"),
    budgetSnapshot: {
      provider: "codex",
      checkedAt: "2026-05-28T12:00:00.000Z",
      remainingPercent: 0,
    },
    activeBuildAgentLock: { held: false },
  });

  assert.equal(exhausted.budgetMode, "exhausted");
  assert.equal(exhausted.selectedProjectId, undefined);
  assert.equal(exhausted.decisions[0]?.reason, "budget-exhausted");

  const conservative = planSchedulerTick({
    projects: [project("screenshot-tool", "builder")],
    now: new Date("2026-05-28T12:00:00.000Z"),
    budgetSnapshot: {
      provider: "codex",
      checkedAt: "2026-05-28T12:00:00.000Z",
      remainingPercent: 20,
    },
    activeBuildAgentLock: { held: false },
  });

  assert.equal(conservative.budgetMode, "conservative");
  assert.equal(conservative.selectedProjectId, undefined);
  assert.equal(conservative.decisions[0]?.reason, "budget-conservative-builder-deferred");
});

test("scheduler throttles recent direct-main product-loop work under conservative budget", () => {
  const tick = planSchedulerTick({
    projects: [
      {
        ...project("screenshot-tool", "builder"),
        autonomyPolicy: DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY,
        latestRunJournalAt: "2026-05-28T11:59:00.000Z",
      },
    ],
    now: new Date("2026-05-28T12:00:00.000Z"),
    budgetSnapshot: {
      provider: "codex",
      checkedAt: "2026-05-28T12:00:00.000Z",
      remainingPercent: 20,
    },
    activeBuildAgentLock: { held: false },
  });

  assert.equal(tick.budgetMode, "conservative");
  assert.equal(tick.selectedProjectId, undefined);
  assert.equal(tick.decisions[0]?.reason, "product-loop-throttle-conservative");
});

test("scheduler can select approved direct-main builder work after conservative throttle interval", () => {
  const tick = planSchedulerTick({
    projects: [
      {
        ...project("screenshot-tool", "builder"),
        autonomyPolicy: DIRECT_MAIN_PRODUCT_LOOP_AUTONOMY,
        latestRunJournalAt: "2026-05-28T10:59:00.000Z",
      },
    ],
    now: new Date("2026-05-28T12:00:00.000Z"),
    budgetSnapshot: {
      provider: "codex",
      checkedAt: "2026-05-28T12:00:00.000Z",
      remainingPercent: 20,
    },
    activeBuildAgentLock: { held: false },
  });

  assert.equal(tick.budgetMode, "conservative");
  assert.equal(tick.selectedProjectId, "screenshot-tool");
  assert.equal(tick.decisions[0]?.reason, "eligible");
});

test("scheduler applies pause, blocker, cadence, and held-lock rules before selection", () => {
  const tick = planSchedulerTick({
    projects: [
      { ...project("paused", "safe-watcher"), paused: true },
      { ...project("blocked", "safe-watcher"), openBlockerCount: 1 },
      {
        ...project("recent", "safe-watcher"),
        latestRunJournalAt: "2026-05-28T11:30:00.000Z",
      },
      project("available", "safe-watcher"),
    ],
    now: new Date("2026-05-28T12:00:00.000Z"),
    budgetSnapshot: {
      provider: "codex",
      checkedAt: "2026-05-28T12:00:00.000Z",
      remainingPercent: 90,
    },
    activeBuildAgentLock: { held: true, projectId: "other", acquiredAt: "2026-05-28T11:59:00.000Z" },
  });

  assert.equal(tick.selectedProjectId, undefined);
  assert.deepEqual(
    tick.decisions.map((decision) => `${decision.projectId}:${decision.reason}`),
    [
      "paused:project-paused",
      "blocked:project-blocked",
      "recent:cadence-not-due",
      "available:active-build-agent-lock-held",
    ],
  );
});

test("scheduler defers project-changing work during an active Work Pause", () => {
  const tick = planSchedulerTick({
    projects: [project("palette-wow", "safe-watcher"), project("screenshot-tool", "builder")],
    now: new Date("2026-05-28T12:00:00.000Z"),
    budgetSnapshot: {
      provider: "codex",
      checkedAt: "2026-05-28T12:00:00.000Z",
      remainingPercent: 90,
    },
    activeBuildAgentLock: { held: false },
    workPause: {
      active: true,
      pausedUntil: "2026-05-28T12:05:00.000Z",
      source: "telegram",
      createdAt: "2026-05-28T11:59:00.000Z",
    },
  });

  assert.equal(tick.selectedProjectId, undefined);
  assert.deepEqual(
    tick.decisions.map((decision) => `${decision.projectId}:${decision.reason}`),
    ["palette-wow:work-paused", "screenshot-tool:work-paused"],
  );
});

test("budget mode calculation uses explicit mode, percentages, and conservative fallback", () => {
  assert.equal(calculateBudgetMode({ provider: "codex", checkedAt: "now", mode: "critical" }), "critical");
  assert.equal(calculateBudgetMode({ provider: "codex", checkedAt: "now", remainingPercent: 31 }), "normal");
  assert.equal(calculateBudgetMode({ provider: "codex", checkedAt: "now", remainingPercent: 30 }), "conservative");
  assert.equal(calculateBudgetMode({ provider: "codex", checkedAt: "now", remainingPercent: 10 }), "critical");
  assert.equal(calculateBudgetMode({ provider: "codex", checkedAt: "now", remainingPercent: 0 }), "exhausted");
  assert.equal(calculateBudgetMode({ provider: "codex", checkedAt: "now", unavailable: true }), "conservative");
});

test("active build agent lock allows only one holder", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-scheduler-lock-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:00:00.000Z"),
    });
    const first = await tryAcquireActiveBuildAgentLock(state.databasePath, {
      projectId: "palette-wow",
      acquiredAt: "2026-05-28T12:01:00.000Z",
      runJournalId: "run-1",
    });
    const second = await tryAcquireActiveBuildAgentLock(state.databasePath, {
      projectId: "screenshot-tool",
      acquiredAt: "2026-05-28T12:02:00.000Z",
      runJournalId: "run-2",
    });

    assert.equal(first.held, true);
    assert.equal(first.projectId, "palette-wow");
    assert.equal(second.held, true);
    assert.equal(second.projectId, "palette-wow");

    await releaseActiveBuildAgentLock(state.databasePath);
    const third = await tryAcquireActiveBuildAgentLock(state.databasePath, {
      projectId: "screenshot-tool",
      acquiredAt: "2026-05-28T12:03:00.000Z",
    });

    assert.equal(third.projectId, "screenshot-tool");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("scheduler tick records runtime status without launching an agent", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-scheduler-tick-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:00:00.000Z"),
    });

    await runSchedulerTick({
      state,
      now: () => new Date("2026-05-28T12:05:00.000Z"),
      budgetProvider: {
        name: "codex",
        readBudget: () => ({
          provider: "codex",
          checkedAt: "2026-05-28T12:05:00.000Z",
          remainingPercent: 90,
          codexUsage: {
            checkedAt: "2026-05-28T12:05:00.000Z",
            source: "codex-jsonl",
            codexHome: "/tmp/codex-home",
            lookbackDays: 1,
            filesScanned: 2,
            tokenEvents: 3,
            inputTokens: 100,
            cachedInputTokens: 40,
            outputTokens: 20,
            totalTokens: 120,
            latestRateLimitObservedAt: "2026-05-28T12:04:00.000Z",
            primaryUsedPercent: 12,
            secondaryUsedPercent: 34,
            planType: "prolite",
          },
        }),
      },
    });

    const refreshed = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:06:00.000Z"),
    });

    assert.equal(refreshed.scheduler?.budgetMode, "normal");
    assert.equal(refreshed.scheduler?.selectedProjectId, "palette-wow");
    assert.equal(refreshed.scheduler?.activeBuildAgentLock, "available");
    assert.equal(refreshed.scheduler?.decisions.length, 2);
    assert.equal(refreshed.scheduler?.codexUsage?.totalTokens, 120);
    assert.equal(refreshed.scheduler?.codexUsage?.secondaryUsedPercent, 34);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

function project(id: string, mode: ProjectRuntimeStatus["mode"]): ProjectRuntimeStatus {
  return {
    id,
    displayName: id,
    mode,
    modeLabel: mode === "safe-watcher" ? "Safe/Watcher" : "Builder",
    cadence: mode === "safe-watcher" ? "daily-forward-motion" : "builder-loop-after-owner-approval",
    autonomyPolicy: "test",
    paused: false,
    runJournalCount: 0,
    openBlockerCount: 0,
  };
}
