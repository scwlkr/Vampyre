import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildCheckInSummary, formatTelegramDailyBrief } from "../src/checkin/checkInSummary.js";
import { formatStatusReport, runVampyreStatus } from "../src/status/vampyreStatus.js";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";
import type { OperationalStateReport } from "../src/state/operationalState.js";

test("local status initializes state and formats default projects", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-status-"));

  try {
    const report = await runVampyreStatus({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    });

    assert.equal(report.ready, true);
    assert.equal(report.state?.projects.length, 3);

    const formatted = formatStatusReport(report);
    assert.match(formatted, /paletteWOW \(palette-wow\)/);
    assert.match(formatted, /Pinmark \(screenshot-tool\)/);
    assert.match(formatted, /Paused: yes/);
    assert.match(formatted, /MiniMark \(minimark\)/);
    assert.match(formatted, /GitHub: scwlkr\/pinmark/);
    assert.match(formatted, /GitHub: scwlkr\/minimark/);
    assert.match(formatted, /Vampyre check-in/);
    assert.match(formatted, /Overall State: ready/);
    assert.match(formatted, /Work Pause:/);
    assert.doesNotMatch(formatted, /TOKEN|SECRET|KEY=/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("local status prefers repo-local next action over stale registry task", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-status-next-action-"));

  try {
    await mkdir(join(workspaceRoot, "config"), { recursive: true });
    await mkdir(join(workspaceRoot, "repos", "screenshot-tool", "docs"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "config", "project-registry.json"),
      JSON.stringify({
        version: 1,
        projects: [
          {
            id: "screenshot-tool",
            displayName: "Pinmark",
            mode: "builder",
            githubRepo: "scwlkr/pinmark",
            rawIdea: "A real macOS screenshot tool.",
            cadence: "builder-loop-after-owner-approval",
            autonomyPolicy: "continuous-product-loop-direct-main",
            paused: false,
            validationCommands: ["git diff --check"],
            autoSafeTasks: ["Stale registry task."],
          },
        ],
      }),
    );
    await writeFile(
      join(workspaceRoot, "repos", "screenshot-tool", "docs", "status.md"),
      "# Pinmark Status\n\n## Next action\n\nInsert OCR results as editable text annotations.\n\n## Blockers\n\nNone.\n",
    );

    const report = await runVampyreStatus({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    });

    const formatted = formatStatusReport(report);
    assert.match(formatted, /Next action: Insert OCR results as editable text annotations\./);
    assert.doesNotMatch(formatted, /Stale registry task/);
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

test("telegram daily brief distinguishes daemon-selected work from owner action", () => {
  const state = fakeState();
  state.scheduler = {
    lastTickAt: "2026-05-28T10:00:00.000Z",
    budgetProvider: "codex",
    budgetMode: "conservative",
    activeBuildAgentLock: "available",
    selectedProjectId: "palette-wow",
    decisions: [
      {
        projectId: "palette-wow",
        displayName: "paletteWOW",
        decision: "selected",
        reason: "cadence-due",
      },
    ],
  };

  const message = formatTelegramDailyBrief(
    buildCheckInSummary({
      state,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    }),
  );

  assert.match(message, /Action: No owner action needed; paletteWOW is selected for the next Build Agent run\./);
});

test("telegram daily brief ignores blockers on paused projects for owner action", () => {
  const state = fakeState();
  state.projects.push({
    id: "screenshot-tool",
    displayName: "Pinmark",
    mode: "builder",
    modeLabel: "Builder",
    cadence: "builder-loop-after-owner-approval",
    autonomyPolicy: "continuous-product-loop-direct-main",
    paused: true,
    runJournalCount: 3,
    openBlockerCount: 2,
    githubRepo: "scwlkr/pinmark",
    rawIdea: "A real macOS screenshot tool.",
  });
  state.scheduler = {
    lastTickAt: "2026-05-28T10:00:00.000Z",
    budgetProvider: "codex",
    budgetMode: "conservative",
    activeBuildAgentLock: "available",
    selectedProjectId: "minimark",
    decisions: [
      {
        projectId: "screenshot-tool",
        displayName: "Pinmark",
        decision: "deferred",
        reason: "project-paused",
      },
      {
        projectId: "minimark",
        displayName: "MiniMark",
        decision: "selected",
        reason: "eligible",
      },
    ],
  };
  state.projects.push({
    id: "minimark",
    displayName: "MiniMark",
    mode: "builder",
    modeLabel: "Builder",
    cadence: "builder-loop-after-owner-approval",
    autonomyPolicy: "continuous-product-loop-direct-main",
    paused: false,
    runJournalCount: 0,
    openBlockerCount: 0,
    githubRepo: "scwlkr/minimark",
    rawIdea: "A no-permission macOS markdown scratchpad.",
  });

  const message = formatTelegramDailyBrief(
    buildCheckInSummary({
      state,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    }),
  );

  assert.match(message, /Action: No owner action needed; MiniMark is selected for the next Build Agent run\./);
  assert.doesNotMatch(message, /review open blockers for Pinmark/);
});

test("telegram daily brief treats recoverable blocker selection as no owner action", () => {
  const state = fakeState();
  state.projects = [
    {
      id: "minimark",
      displayName: "MiniMark",
      mode: "builder",
      modeLabel: "Builder",
      cadence: "builder-loop-after-owner-approval",
      autonomyPolicy: "continuous-product-loop-direct-main",
      paused: false,
      runJournalCount: 1,
      openBlockerCount: 1,
      openBlockers: [
        {
          id: "native-validation:minimark:1001:failure",
          projectId: "minimark",
          summary: "Native validation failure",
          details: "Expected conclusion success, got failure",
          status: "open",
          createdAt: "2026-05-28T09:59:00.000Z",
        },
      ],
      githubRepo: "scwlkr/minimark",
      rawIdea: "A no-permission macOS markdown scratchpad.",
    },
  ];
  state.scheduler = {
    lastTickAt: "2026-05-28T10:00:00.000Z",
    budgetProvider: "codex",
    budgetMode: "conservative",
    activeBuildAgentLock: "available",
    selectedProjectId: "minimark",
    decisions: [
      {
        projectId: "minimark",
        displayName: "MiniMark",
        decision: "selected",
        reason: "recoverable-blocker-repair",
      },
    ],
  };

  const message = formatTelegramDailyBrief(
    buildCheckInSummary({
      state,
      now: () => new Date("2026-05-28T10:00:00.000Z"),
    }),
  );

  assert.match(message, /Action: No owner action needed; MiniMark is selected for the next Build Agent run\./);
  assert.doesNotMatch(message, /review open blockers/);
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
