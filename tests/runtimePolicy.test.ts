import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadRuntimePolicy, runtimePolicyPath } from "../src/config/runtimePolicy.js";

test("runtime policy creates a detailed editable default config", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-runtime-policy-"));

  try {
    const loaded = await loadRuntimePolicy(workspaceRoot);

    assert.equal(loaded.created, true);
    assert.equal(loaded.path, runtimePolicyPath(workspaceRoot));
    assert.equal(loaded.policy.budget.unknownRateLimitMode, "normal");
    assert.equal(loaded.policy.budget.unavailableMode, "conservative");
    assert.equal(loaded.policy.scheduler.budgetModeBehavior.normal, "allow");
    assert.equal(loaded.policy.scheduler.budgetModeBehavior.critical, "defer");
    assert.equal(loaded.policy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode.normal, "3h");
    assert.equal(loaded.policy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode.conservative, "3h");
    assert.equal(loaded.policy.telegram.commands.policy, "/policy");
    assert.equal(loaded.policy.telegram.pauseDurations.pause1hour, "1h");
    assert.equal(loaded.policy.buildAgent.worker.reasoningEffort, "xhigh");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("runtime policy accepts focused overrides while preserving defaults", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-runtime-policy-override-"));

  try {
    await mkdir(dirname(runtimePolicyPath(workspaceRoot)), { recursive: true });
    await writeFile(
      runtimePolicyPath(workspaceRoot),
      JSON.stringify(
        {
          version: 1,
          budget: {
            unknownRateLimitMode: "conservative",
            codex: {
              lookbackDays: 2,
            },
          },
          scheduler: {
            directMainProductLoop: {
              minimumIntervalByBudgetMode: {
                normal: "45m",
              },
            },
          },
          telegram: {
            commands: {
              policy: "/settings",
            },
          },
        },
        null,
        2,
      ),
    );

    const loaded = await loadRuntimePolicy(workspaceRoot);

    assert.equal(loaded.created, false);
    assert.equal(loaded.policy.budget.unknownRateLimitMode, "conservative");
    assert.equal(loaded.policy.budget.codex.lookbackDays, 2);
    assert.equal(loaded.policy.budget.codex.maxFiles, 24);
    assert.equal(loaded.policy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode.normal, "45m");
    assert.equal(loaded.policy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode.conservative, "3h");
    assert.equal(loaded.policy.telegram.commands.policy, "/settings");
    assert.equal(loaded.policy.telegram.commands.status, "/status");

    const normalized = JSON.parse(await readFile(runtimePolicyPath(workspaceRoot), "utf8")) as Record<string, unknown>;
    const scheduler = normalized["scheduler"] as Record<string, unknown>;
    assert.deepEqual(scheduler["budgetModeBehavior"], {
      normal: "allow",
      conservative: "allow",
      critical: "defer",
      exhausted: "defer",
    });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
