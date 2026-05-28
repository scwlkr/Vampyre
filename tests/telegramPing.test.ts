import assert from "node:assert/strict";
import test from "node:test";
import { runTelegramPing } from "../src/ping/telegram.js";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";

test("telegram ping reads host env file and reports sanitized success", async () => {
  const report = await runTelegramPing({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    message: "hello from test",
    runner: async (command) => {
      assert.match(command, /config\/vampyre\.env/);
      assert.match(command, /TELEGRAM_BOT_TOKEN/);
      assert.match(command, /TELEGRAM_CHAT_ID/);
      assert.match(command, /VAMPYRE_PING_MESSAGE='hello from test'/);
      return ok("telegram-message-sent:123");
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.summary, "Telegram ping sent");
  assert.equal(report.details, "telegram-message-sent:123");
  assert.doesNotMatch(JSON.stringify(report), /bot[0-9]|TOKEN=|CHAT_ID=/);
});

test("telegram ping fails without printing secret values", async () => {
  const report = await runTelegramPing({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async () => fail("telegram-config-missing"),
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary, "telegram-config-missing");
  assert.doesNotMatch(JSON.stringify(report), /TOKEN=|SECRET|wizard/);
});

function ok(stdout: string): RemoteCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr: string): RemoteCommandResult {
  return { exitCode: 3, stdout: "", stderr };
}
