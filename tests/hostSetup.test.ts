import assert from "node:assert/strict";
import test from "node:test";
import { runHostSetup } from "../src/host/setupHost.js";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";

test("host setup creates workspace and verifies system Node and pnpm", async () => {
  const commands: string[] = [];
  const report = await runHostSetup({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async (command) => {
      commands.push(command);
      if (command.includes("reachable")) return ok("reachable:wlkrlab-server:wlkrlab");
      if (command.includes("mkdir -p")) return ok("workspace-ready:~/vampyre");
      if (command.includes("vampyre.env")) return ok("env-stub-mode:600");
      if (command.includes("node --version")) return ok("v26.1.0");
      if (command.includes("pnpm --version")) return ok("10.33.0");
      throw new Error(`unexpected command: ${command}`);
    },
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.blockers, []);
  assert.ok(commands.some((command) => command.includes("command -v node")));
  assert.ok(commands.some((command) => command.includes("command -v pnpm")));
  assert.ok(commands.some((command) => command.includes('case "$root"')));
  assert.doesNotMatch(JSON.stringify(report), /=.+/);
});

function ok(stdout: string): RemoteCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr: string): RemoteCommandResult {
  return { exitCode: 1, stdout: "", stderr };
}
