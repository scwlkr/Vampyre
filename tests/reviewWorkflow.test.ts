import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runReviewRequest, type TelegramFetch, type TelegramFetchInit } from "../src/github/reviewWorkflow.js";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";
import type { GitHubFetch, GitHubFetchInit } from "../src/github/client.js";
import { runSchedulerTick } from "../src/scheduler/scheduler.js";
import { initializeOperationalState } from "../src/state/operationalState.js";

test("review request creates the GitHub review record and sends a Telegram link", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-review-"));
  const githubRequests: CapturedRequest[] = [];
  const telegramRequests: CapturedRequest[] = [];

  try {
    await recordSelectedProject(workspaceRoot);

    const report = await runReviewRequest({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T16:00:00.000Z"),
      env: secretEnv(),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(404, { message: "Not Found" }),
        jsonResponse(201, { name: "vampyre:review", url: "https://api.github.com/labels/1" }),
        jsonResponse(200, []),
        jsonResponse(201, { number: 42, html_url: "https://github.com/scwlkr/paletteWOW/issues/42" }),
        jsonResponse(201, { html_url: "https://github.com/scwlkr/paletteWOW/issues/42#issuecomment-1" }),
      ]),
      telegramFetch: fakeFetch(telegramRequests, [
        jsonResponse(200, { ok: true, result: { message_id: 99 } }),
      ]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.equal(report.selectedProject?.id, "palette-wow");
    assert.equal(report.github?.labelAction, "created");
    assert.equal(report.github?.issueAction, "created");
    assert.equal(report.github?.issueUrl, "https://github.com/scwlkr/paletteWOW/issues/42");
    assert.equal(report.telegram?.messageId, "99");
    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      [
        "GET /repos/scwlkr/paletteWOW/labels/vampyre%3Areview",
        "POST /repos/scwlkr/paletteWOW/labels",
        "GET /repos/scwlkr/paletteWOW/issues",
        "POST /repos/scwlkr/paletteWOW/issues",
        "POST /repos/scwlkr/paletteWOW/issues/42/comments",
      ],
    );
    assert.match(telegramRequests[0]?.init.body ?? "", /Approval and review stay in GitHub/);
    assert.match(telegramRequests[0]?.init.body ?? "", /Owner options \(GitHub\)/);
    assert.match(telegramRequests[0]?.init.body ?? "", /VAMPYRE_APPROVED: accepted/);
    assert.match(telegramRequests[0]?.init.body ?? "", /VAMPYRE_DENIED/);
    assert.doesNotMatch(JSON.stringify(report), /ghp_secret|bot_secret|CHAT_ID|123456/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("review request reuses an existing open review issue and posts an update comment", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-review-reuse-"));
  const githubRequests: CapturedRequest[] = [];

  try {
    await recordSelectedProject(workspaceRoot);

    const report = await runReviewRequest({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T16:30:00.000Z"),
      env: secretEnv(),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/1" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/1" }),
        jsonResponse(200, [
          {
            number: 42,
            title: "Vampyre review: paletteWOW",
            html_url: "https://github.com/scwlkr/paletteWOW/issues/42",
          },
        ]),
        jsonResponse(201, { html_url: "https://github.com/scwlkr/paletteWOW/issues/42#issuecomment-2" }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 100 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.equal(report.github?.issueAction, "reused");
    assert.equal(
      githubRequests.some((request) => request.init.method === "POST" && new URL(request.url).pathname.endsWith("/issues")),
      false,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("review request blocks before side effects when no scheduler project is selected", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-review-blocked-"));

  try {
    const report = await runReviewRequest({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T16:00:00.000Z"),
      env: secretEnv(),
      githubFetch: async () => {
        throw new Error("GitHub should not be called");
      },
      telegramFetch: async () => {
        throw new Error("Telegram should not be called");
      },
    });

    assert.equal(report.ready, false);
    assert.equal(report.blockers[0], "Scheduler: no recorded scheduler tick is available");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("remote review request invokes the installed host app with env loaded", async () => {
  const report = await runReviewRequest({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    runner: async (command) => {
      assert.match(command, /config\/vampyre\.env/);
      assert.match(command, /node "\$cli" review request --local --json --host 'wlkrlab' --workspace-root "\$root"/);
      return ok(
        JSON.stringify({
          host: "local",
          workspaceRoot: "/home/wlkrlab/vampyre",
          ready: true,
          blockers: [],
        }),
      );
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.host, "wlkrlab");
  assert.equal(report.workspaceRoot, "~/vampyre");
});

async function recordSelectedProject(workspaceRoot: string): Promise<void> {
  const state = await initializeOperationalState({
    workspaceRoot,
    now: () => new Date("2026-05-28T15:59:00.000Z"),
  });

  await runSchedulerTick({
    state,
    now: () => new Date("2026-05-28T16:00:00.000Z"),
    budgetProvider: {
      name: "codex",
      readBudget: () => ({
        provider: "codex",
        checkedAt: "2026-05-28T16:00:00.000Z",
        remainingPercent: 25,
      }),
    },
  });
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
