import assert from "node:assert/strict";
import test from "node:test";
import { runGitHubCheck } from "../src/github/githubCheck.js";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";

test("GitHub check runs on the runtime host and reports auth plus repo access", async () => {
  const report = await runGitHubCheck({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async (command) => {
      assert.match(command, /config\/vampyre\.env/);
      assert.match(command, /api\.github\.com/);
      assert.match(command, /project-registry\.json/);
      return ok(
        JSON.stringify({
          checks: [
            { name: "GitHub auth", status: "pass", summary: "authenticated" },
            {
              name: "GitHub repo scwlkr/paletteWOW",
              status: "pass",
              summary: "accessible:public",
              details: "permissions:pull,push",
            },
          ],
        }),
      );
    },
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.checks[1]?.details, "permissions:pull,push");
  assert.doesNotMatch(JSON.stringify(report), /GITHUB_TOKEN=|ghp_/);
});

test("GitHub check can target one explicit repo", async () => {
  const report = await runGitHubCheck({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    repo: "scwlkr/paletteWOW",
    runner: async (command) => {
      assert.match(command, /VAMPYRE_GITHUB_REPO='scwlkr\/paletteWOW'/);
      return ok(
        JSON.stringify({
          checks: [{ name: "GitHub auth", status: "pass", summary: "authenticated" }],
        }),
      );
    },
  });

  assert.equal(report.ready, true);
});

test("GitHub check reports remote failures without leaking secrets", async () => {
  const report = await runGitHubCheck({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async () =>
      ok(
        JSON.stringify({
          checks: [{ name: "GitHub auth", status: "fail", summary: "HTTP 401: Bad credentials" }],
        }),
      ),
  });

  assert.equal(report.ready, false);
  assert.equal(report.blockers[0], "GitHub auth: HTTP 401: Bad credentials");
  assert.doesNotMatch(JSON.stringify(report), /TOKEN=|SECRET|ghp_/);
});

function ok(stdout: string): RemoteCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}
