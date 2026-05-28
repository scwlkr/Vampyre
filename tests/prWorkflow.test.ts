import assert from "node:assert/strict";
import test from "node:test";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";
import { runPullRequestUpsert, type PullRequestUpsertReport } from "../src/github/prWorkflow.js";
import type { TelegramFetch, TelegramFetchInit } from "../src/github/reviewWorkflow.js";
import type { GitHubFetch, GitHubFetchInit } from "../src/github/client.js";

test("PR upsert creates a branch PR and sends a Telegram link", async () => {
  const githubRequests: CapturedRequest[] = [];
  const telegramRequests: CapturedRequest[] = [];

  const report = await runPullRequestUpsert({
    host: "local",
    workspaceRoot: "/tmp/vampyre",
    local: true,
    repo: "scwlkr/paletteWOW",
    head: "vampyre/run-1",
    base: "main",
    title: "Vampyre change",
    body: "Reviewable output.",
    draft: true,
    env: secretEnv(),
    githubFetch: fakeFetch(githubRequests, [
      jsonResponse(200, []),
      jsonResponse(201, { number: 13, html_url: "https://github.com/scwlkr/paletteWOW/pull/13" }),
    ]),
    telegramFetch: fakeFetch(telegramRequests, [
      jsonResponse(200, { ok: true, result: { message_id: 101 } }),
    ]) as TelegramFetch,
  });

  assert.equal(report.ready, true);
  assert.equal(report.pullRequest.action, "created");
  assert.equal(report.pullRequest.number, 13);
  assert.equal(report.telegram?.messageId, "101");
  assert.deepEqual(
    githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
    ["GET /repos/scwlkr/paletteWOW/pulls", "POST /repos/scwlkr/paletteWOW/pulls"],
  );
  const createBody = JSON.parse(githubRequests[1]?.init.body ?? "{}") as Record<string, unknown>;
  assert.equal(createBody["draft"], true);
  assert.match(telegramRequests[0]?.init.body ?? "", /https:\/\/github\.com\/scwlkr\/paletteWOW\/pull\/13/);
  assert.doesNotMatch(JSON.stringify(report), /ghp_secret|bot_secret|CHAT_ID|123456/);
});

test("PR upsert updates an existing open branch PR instead of creating another", async () => {
  const githubRequests: CapturedRequest[] = [];

  const report = await runPullRequestUpsert({
    host: "local",
    workspaceRoot: "/tmp/vampyre",
    local: true,
    repo: "scwlkr/paletteWOW",
    head: "vampyre/run-1",
    base: "main",
    title: "Updated Vampyre change",
    body: "Updated reviewable output.",
    env: secretEnv(),
    githubFetch: fakeFetch(githubRequests, [
      jsonResponse(200, [{ number: 13, html_url: "https://github.com/scwlkr/paletteWOW/pull/13" }]),
      jsonResponse(200, { number: 13, html_url: "https://github.com/scwlkr/paletteWOW/pull/13" }),
    ]),
    telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 102 } })]) as TelegramFetch,
  });

  assert.equal(report.ready, true);
  assert.equal(report.pullRequest.action, "updated");
  assert.equal(
    githubRequests.some((request) => request.init.method === "POST" && new URL(request.url).pathname.endsWith("/pulls")),
    false,
  );
  assert.equal(new URL(githubRequests[1]?.url ?? "").pathname, "/repos/scwlkr/paletteWOW/pulls/13");
  const updateBody = JSON.parse(githubRequests[1]?.init.body ?? "{}") as Record<string, unknown>;
  assert.equal(updateBody["title"], "Updated Vampyre change");
  assert.equal(updateBody["base"], "main");
});

test("PR upsert blocks before GitHub calls when token is missing", async () => {
  const report = await runPullRequestUpsert({
    host: "local",
    workspaceRoot: "/tmp/vampyre",
    local: true,
    repo: "scwlkr/paletteWOW",
    head: "vampyre/run-1",
    base: "main",
    title: "Vampyre change",
    env: {},
    githubFetch: async () => {
      throw new Error("GitHub should not be called");
    },
    telegramFetch: async () => {
      throw new Error("Telegram should not be called");
    },
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.blockers, ["GitHub: GITHUB_TOKEN is missing"]);
});

test("remote PR upsert invokes the installed host app with env loaded", async () => {
  const report = await runPullRequestUpsert({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    repo: "scwlkr/paletteWOW",
    head: "vampyre/run-1",
    base: "main",
    title: "Vampyre change",
    body: "Reviewable output.",
    runner: async (command) => {
      assert.match(command, /config\/vampyre\.env/);
      assert.match(command, /node "\$cli" 'pr' 'upsert' '--local' '--json' '--host' 'wlkrlab'/);
      assert.match(command, /'--repo' 'scwlkr\/paletteWOW'/);
      assert.match(command, /'--head' 'vampyre\/run-1'/);
      assert.match(command, /'--base' 'main'/);
      assert.match(command, /'--title' 'Vampyre change'/);
      assert.match(command, /'--body' 'Reviewable output\.'/);
      return ok(
        JSON.stringify({
          host: "local",
          workspaceRoot: "/home/wlkrlab/vampyre",
          ready: true,
          blockers: [],
          pullRequest: {
            repo: "scwlkr/paletteWOW",
            head: "vampyre/run-1",
            base: "main",
            title: "Vampyre change",
            action: "updated",
            number: 13,
            url: "https://github.com/scwlkr/paletteWOW/pull/13",
          },
        } satisfies PullRequestUpsertReport),
      );
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.host, "wlkrlab");
  assert.equal(report.workspaceRoot, "~/vampyre");
});

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
