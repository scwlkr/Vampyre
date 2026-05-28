import assert from "node:assert/strict";
import test from "node:test";
import { runHostDoctor } from "../src/doctor/hostDoctor.js";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";

test("doctor reports ready host with service warning", async () => {
  const report = await runHostDoctor({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async (command) => {
      if (command.includes("reachable")) return ok("reachable:wlkrlab-server:wlkrlab");
      if (command.includes("systemctl --user status >/dev/null")) return ok("");
      if (command.includes("node --version")) return ok("v22.0.0");
      if (command.includes("pnpm --version")) return ok("10.0.0");
      if (command.includes("git --version")) return ok("git version 2.45.0");
      if (command.includes("test -d \"$root\"")) return ok("writable:~/vampyre");
      if (command.includes("api.github.com/user")) return ok("github-auth:ok");
      if (command.includes("vampyre.env")) {
        return ok(
          [
            "stub-present",
            "GITHUB_TOKEN:present",
            "TELEGRAM_BOT_TOKEN:present",
            "TELEGRAM_CHAT_ID:present",
            "OPENROUTER_API_KEY:missing-optional",
          ].join("\n"),
        );
      }
      if (command.includes("sqlite3 --version")) return ok("3.46.0");
      if (command.includes("vampyre.service")) return fail("Unit vampyre.service could not be found.");
      throw new Error(`unexpected command: ${command}`);
    },
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0], "Service readiness: vampyre.service is not installed yet");
  assert.equal(report.checks.some((check) => check.name === "GitHub auth" && check.status === "pass"), true);
});

test("doctor stops after unreachable SSH", async () => {
  const report = await runHostDoctor({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async () => fail("ssh: connect to host wlkrlab port 22: Operation timed out"),
  });

  assert.equal(report.ready, false);
  assert.equal(report.checks.length, 1);
  assert.equal(report.blockers[0], "SSH reachability: non-interactive SSH failed");
});

test("doctor reports missing required secret presence without leaking values", async () => {
  const leakedSecret = "ghp_this_value_must_not_appear";
  const report = await runHostDoctor({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async (command) => {
      if (command.includes("reachable")) return ok("reachable:wlkrlab-server:wlkrlab");
      if (command.includes("systemctl --user status >/dev/null")) return ok("");
      if (command.includes("node --version")) return ok("v22.0.0");
      if (command.includes("pnpm --version")) return ok("10.0.0");
      if (command.includes("git --version")) return ok("git version 2.45.0");
      if (command.includes("test -d \"$root\"")) return ok("writable:~/vampyre");
      if (command.includes("api.github.com/user")) return fail("github-token-missing");
      if (command.includes("vampyre.env")) {
        return ok(
          [
            "stub-present",
            "GITHUB_TOKEN=ghp_this_value_must_not_appear",
            "GITHUB_TOKEN:present",
            "TELEGRAM_BOT_TOKEN:missing",
            "TELEGRAM_CHAT_ID:missing",
            "OPENROUTER_API_KEY:missing-optional",
          ].join("\n"),
        );
      }
      if (command.includes("sqlite3 --version")) return ok("3.46.0");
      if (command.includes("vampyre.service")) return fail("Unit vampyre.service could not be found.");
      throw new Error(`unexpected command: ${command}`);
    },
  });

  assert.equal(report.ready, false);
  assert.match(report.blockers.join("\n"), /TELEGRAM_BOT_TOKEN/);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(leakedSecret));
});

function ok(stdout: string): RemoteCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr: string): RemoteCommandResult {
  return { exitCode: 1, stdout: "", stderr };
}
