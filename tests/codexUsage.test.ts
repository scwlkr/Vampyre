import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { codexRemainingPercentFromUsage, readCodexBudgetUsageSummary } from "../src/budget/codexUsage.js";

test("Codex usage reader summarizes recent token_count events and rate limits", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "vampyre-codex-home-"));
  const sessionDir = join(codexHome, "sessions", "2026", "05", "29");

  try {
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      join(sessionDir, "session.jsonl"),
      [
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-05-29T13:00:00.000Z",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 500,
                cached_input_tokens: 300,
                output_tokens: 50,
                total_tokens: 550,
              },
            },
          },
          rate_limits: {
            primary: { used_percent: 40 },
            secondary: { used_percent: 62 },
            plan_type: "prolite",
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-05-29T13:05:00.000Z",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 25,
                output_tokens: 20,
                total_tokens: 120,
              },
              total_token_usage: {
                input_tokens: 600,
                cached_input_tokens: 325,
                output_tokens: 70,
                total_tokens: 670,
              },
            },
          },
          rate_limits: {
            primary: { used_percent: 55 },
            secondary: { used_percent: 63 },
            plan_type: "prolite",
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-05-27T13:00:00.000Z",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 999,
                cached_input_tokens: 999,
                output_tokens: 999,
                total_tokens: 1998,
              },
            },
          },
        }),
      ].join("\n"),
    );

    const summary = await readCodexBudgetUsageSummary({
      codexHome,
      now: new Date("2026-05-29T14:00:00.000Z"),
    });

    assert.ok(summary);
    assert.equal(summary.source, "codex-jsonl");
    assert.equal(summary.codexHome, codexHome);
    assert.equal(summary.filesScanned, 1);
    assert.equal(summary.tokenEvents, 2);
    assert.equal(summary.inputTokens, 600);
    assert.equal(summary.cachedInputTokens, 325);
    assert.equal(summary.outputTokens, 70);
    assert.equal(summary.totalTokens, 670);
    assert.equal(summary.primaryUsedPercent, 55);
    assert.equal(summary.secondaryUsedPercent, 63);
    assert.equal(summary.planType, "prolite");
    assert.equal(codexRemainingPercentFromUsage(summary), 37);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});
