import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";
import type { GitHubFetch, GitHubFetchInit } from "../src/github/client.js";
import type { TelegramFetch, TelegramFetchInit } from "../src/github/reviewWorkflow.js";
import {
  runBuildAgent,
  type BuildAgentCommandRunner,
  type BuildAgentCommandSpec,
  type BuildAgentRunReport,
} from "../src/agent/buildAgent.js";
import { initializeOperationalState, recordProjectBlocker } from "../src/state/operationalState.js";

test("build agent creates a run journal, runs configured validation, comments, and notifies", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-"));
  const repoPath = join(workspaceRoot, "repos", "palette-wow");
  const githubRequests: CapturedRequest[] = [];
  const telegramRequests: CapturedRequest[] = [];

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    let seededBlocker = false;

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T19:00:00.000Z"),
      env: secretEnv(),
      commandRunner: fakeCommandRunner(repoPath),
      initializeState: async (options) => {
        const state = await initializeOperationalState(options);
        if (!seededBlocker) {
          seededBlocker = true;
          await recordProjectBlocker(state.databasePath, {
            id: "previous-run:validation-failure",
            projectId: "palette-wow",
            summary: "Build Agent validation-failure",
            details: "previous validation failed",
            now: "2026-05-28T18:59:00.000Z",
          });
        }
        return state;
      },
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 16,
            title: "Vampyre review: paletteWOW",
            html_url: "https://github.com/scwlkr/paletteWOW/issues/16",
          },
        ]),
        jsonResponse(201, {
          number: 16,
          html_url: "https://github.com/scwlkr/paletteWOW/issues/16#issuecomment-1",
        }),
      ]),
      telegramFetch: fakeFetch(telegramRequests, [
        jsonResponse(200, { ok: true, result: { message_id: 201 } }),
      ]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.equal(report.project?.id, "palette-wow");
    assert.equal(report.runJournal?.id, "run-20260528T190000Z-palette-wow");
    assert.equal(report.runJournal?.status, "completed");
    assert.equal(report.worktree?.branch, "vampyre/build-agent/palette-wow/20260528T190000Z");
    assert.equal(report.worktree?.cleanup, "removed");
    assert.equal(report.validation?.source, "project-registry");
    assert.equal(report.validation?.status, "passed");
    assert.deepEqual(
      report.validation?.commands.map((command) => command.command),
      ["bundle exec rails test", "bundle exec rails zeitwerk:check", "bundle exec rails assets:precompile"],
    );
    assert.equal(report.workerStep?.command, "bundle exec rails assets:precompile");
    assert.equal(report.github?.commentUrl, "https://github.com/scwlkr/paletteWOW/issues/16#issuecomment-1");
    assert.equal(report.telegram?.messageId, "201");
    assert.doesNotMatch(JSON.stringify(report), /ghp_secret|bot_secret|987654|eC1hY2Nlc3MtdG9rZW4/);

    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      [
        "GET /repos/scwlkr/paletteWOW/labels/vampyre%3Areview",
        "PATCH /repos/scwlkr/paletteWOW/labels/vampyre%3Areview",
        "GET /repos/scwlkr/paletteWOW/issues",
        "POST /repos/scwlkr/paletteWOW/issues/16/comments",
      ],
    );
    assert.match(telegramRequests[0]?.init.body ?? "", /Vampyre build-agent run completed/);

    const journalRows = spawnSync(
      "sqlite3",
      [
        "-json",
        join(workspaceRoot, "data", "vampyre.sqlite"),
        "select id, status, summary from run_journals;",
      ],
      { encoding: "utf8" },
    );
    assert.equal(journalRows.status, 0);
    assert.match(journalRows.stdout, /run-20260528T190000Z-palette-wow/);
    assert.match(journalRows.stdout, /completed/);

    const lockRows = spawnSync(
      "sqlite3",
      [join(workspaceRoot, "data", "vampyre.sqlite"), "select count(*) from active_build_agent_lock;"],
      { encoding: "utf8" },
    );
    assert.equal(lockRows.status, 0);
    assert.equal(lockRows.stdout.trim(), "0");

    const blockerRows = spawnSync(
      "sqlite3",
      [
        join(workspaceRoot, "data", "vampyre.sqlite"),
        "select status from project_blockers where id='previous-run:validation-failure';",
      ],
      { encoding: "utf8" },
    );
    assert.equal(blockerRows.status, 0);
    assert.equal(blockerRows.stdout.trim(), "resolved");

    const markdownPath = report.reportPaths?.markdown;
    assert.ok(markdownPath);
    const markdown = await readFile(markdownPath, "utf8");
    assert.match(markdown, /Build Agent Run: paletteWOW/);
    assert.match(markdown, /Validation Source: project-registry/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("remote build agent run invokes the installed host app with env loaded", async () => {
  const report = await runBuildAgent({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    projectId: "palette-wow",
    runner: async (command) => {
      assert.match(command, /config\/vampyre\.env/);
      assert.match(command, /node "\$cli" 'agent' 'run' '--local' '--json' '--host' 'wlkrlab'/);
      assert.match(command, /'--workspace-root' "\$root"/);
      assert.match(command, /'--project' 'palette-wow'/);
      return ok(
        JSON.stringify({
          host: "local",
          workspaceRoot: "/home/wlkrlab/vampyre",
          ready: true,
          blockers: [],
          startedAt: "2026-05-28T19:00:00.000Z",
          proof: [],
          runJournal: {
            id: "run-20260528T190000Z-palette-wow",
            phase: "worktree-build-agent",
            status: "completed",
            summary: "Completed Worktree Build Agent validation for paletteWOW",
          },
        } satisfies BuildAgentRunReport),
      );
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.host, "wlkrlab");
  assert.equal(report.workspaceRoot, "~/vampyre");
});

test("build agent falls back to watcher discovery validation commands", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-discovery-"));
  const repoPath = join(workspaceRoot, "repos", "palette-wow");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await mkdir(join(workspaceRoot, "config"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "config", "project-registry.json"),
      `${JSON.stringify({
        version: 1,
        projects: [
          {
            id: "palette-wow",
            displayName: "paletteWOW",
            mode: "safe-watcher",
            githubRepo: "scwlkr/paletteWOW",
            cadence: "daily-forward-motion",
            autonomyPolicy: "auto-safe-work-ends-in-owner-reviewed-pr",
            paused: false,
          },
        ],
      })}\n`,
    );
    await mkdir(join(workspaceRoot, "reports", "watcher-discovery", "palette-wow"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "reports", "watcher-discovery", "palette-wow", "latest.json"),
      `${JSON.stringify({
        validation: {
          commands: ["pnpm test"],
        },
      })}\n`,
    );

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T20:00:00.000Z"),
      env: secretEnv(),
      commandRunner: fakeDiscoveryCommandRunner(repoPath),
      githubFetch: fakeFetch([], [
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 16,
            title: "Vampyre review: paletteWOW",
            html_url: "https://github.com/scwlkr/paletteWOW/issues/16",
          },
        ]),
        jsonResponse(201, {
          number: 16,
          html_url: "https://github.com/scwlkr/paletteWOW/issues/16#issuecomment-2",
        }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 202 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.equal(report.validation?.source, "watcher-discovery");
    assert.deepEqual(
      report.validation?.commands.map((command) => command.command),
      ["pnpm test"],
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent records validation failures as blockers and preserves the worktree", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-failure-"));
  const repoPath = join(workspaceRoot, "repos", "palette-wow");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T21:00:00.000Z"),
      env: secretEnv(),
      commandRunner: fakeValidationFailureCommandRunner(repoPath),
      githubFetch: fakeFetch([], [
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 16,
            title: "Vampyre review: paletteWOW",
            html_url: "https://github.com/scwlkr/paletteWOW/issues/16",
          },
        ]),
        jsonResponse(201, {
          number: 16,
          html_url: "https://github.com/scwlkr/paletteWOW/issues/16#issuecomment-3",
        }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 203 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, false);
    assert.equal(report.runJournal?.status, "blocked");
    assert.equal(report.validation?.status, "failed");
    assert.equal(report.validation?.commands[0]?.command, "bundle exec rails test");
    assert.equal(report.worktree?.cleanup, "preserved");
    assert.match(report.blockers.join("\n"), /validation-failure/);

    const blockers = spawnSync(
      "sqlite3",
      [
        "-json",
        join(workspaceRoot, "data", "vampyre.sqlite"),
        "select project_id, status, summary, details from project_blockers;",
      ],
      { encoding: "utf8" },
    );
    assert.equal(blockers.status, 0);
    assert.match(blockers.stdout, /palette-wow/);
    assert.match(blockers.stdout, /Build Agent validation-failure/);
    assert.match(blockers.stdout, /validation failed/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

function fakeCommandRunner(repoPath: string): BuildAgentCommandRunner {
  return async (spec: BuildAgentCommandSpec) => {
    const args = spec.args.join(" ");
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree add -b vampyre/build-agent/palette-wow/20260528T190000Z")) {
      assert.match(args, /origin\/main/);
      return ok("");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails test")) {
      assert.match(spec.cwd ?? "", /worktrees\/palette-wow-20260528T190000Z$/);
      return ok("3 runs, 0 failures");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails zeitwerk:check")) {
      assert.match(spec.cwd ?? "", /worktrees\/palette-wow-20260528T190000Z$/);
      return ok("All is good!");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails assets:precompile")) {
      assert.match(spec.cwd ?? "", /worktrees\/palette-wow-20260528T190000Z$/);
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree remove --force")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("branch -D vampyre/build-agent/palette-wow/20260528T190000Z")) {
      return ok("");
    }

    throw new Error(`unexpected command: ${spec.command} ${args}`);
  };
}

function fakeDiscoveryCommandRunner(repoPath: string): BuildAgentCommandRunner {
  return async (spec: BuildAgentCommandSpec) => {
    const args = spec.args.join(" ");
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree add -b vampyre/build-agent/palette-wow/20260528T200000Z")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("pnpm test")) {
      assert.match(spec.cwd ?? "", /worktrees\/palette-wow-20260528T200000Z$/);
      return ok("tests passed");
    }
    if (spec.command === "git" && args.includes("worktree remove --force")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("branch -D vampyre/build-agent/palette-wow/20260528T200000Z")) {
      return ok("");
    }

    throw new Error(`unexpected command: ${spec.command} ${args}`);
  };
}

function fakeValidationFailureCommandRunner(repoPath: string): BuildAgentCommandRunner {
  return async (spec: BuildAgentCommandSpec) => {
    const args = spec.args.join(" ");
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree add -b vampyre/build-agent/palette-wow/20260528T210000Z")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails test")) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "1 failure",
      };
    }
    if (spec.command === "git" && args.includes("worktree remove --force")) {
      throw new Error("failed validation worktree should be preserved");
    }

    throw new Error(`unexpected command: ${spec.command} ${args}`);
  };
}

function secretEnv(): NodeJS.ProcessEnv {
  return {
    GITHUB_TOKEN: "ghp_secret",
    TELEGRAM_BOT_TOKEN: "123456:bot_secret",
    TELEGRAM_CHAT_ID: "987654",
  };
}

interface CapturedRequest {
  url: string;
  init: GitHubFetchInit | TelegramFetchInit;
}

function fakeFetch(requests: CapturedRequest[], responses: FakeResponse[]): GitHubFetch {
  return async (url, init) => {
    requests.push({ url, init });
    const response = responses.shift();
    if (!response) {
      throw new Error(`unexpected request: ${init.method} ${url}`);
    }
    return response;
  };
}

interface FakeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

function jsonResponse(status: number, body: unknown): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    async text() {
      return JSON.stringify(body);
    },
  };
}

function ok(stdout: string): RemoteCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}
