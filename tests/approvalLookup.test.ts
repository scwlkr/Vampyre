import assert from "node:assert/strict";
import test from "node:test";
import {
  runApprovalCheck,
  type ApprovalCheckReport,
} from "../src/github/approvalLookup.js";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";
import type { GitHubFetch, GitHubFetchInit } from "../src/github/client.js";

test("approval check finds a labeled GitHub issue with an approval comment", async () => {
  const githubRequests: CapturedRequest[] = [];

  const report = await runApprovalCheck({
    host: "local",
    workspaceRoot: "/tmp/vampyre",
    local: true,
    repo: "scwlkr/Vampyre",
    projectId: "screenshot-tool",
    kind: "builder-vision",
    key: "vision-a",
    env: secretEnv(),
    githubFetch: fakeFetch(githubRequests, [
      jsonResponse(200, [
        {
          number: 77,
          title: "Vampyre approval: screenshot-tool vision-a",
          state: "open",
          html_url: "https://github.com/scwlkr/Vampyre/issues/77",
          body: ["Project: screenshot-tool", "Approval Kind: builder-vision", "Approval Key: vision-a"].join("\n"),
          labels: [{ name: "vampyre:approval" }],
        },
      ]),
      jsonResponse(200, [
        {
          html_url: "https://github.com/scwlkr/Vampyre/issues/77#issuecomment-1",
          body: "VAMPYRE_APPROVED: accepted",
        },
      ]),
    ]),
  });

  assert.equal(report.ready, true);
  assert.equal(report.approved, true);
  assert.equal(report.github?.issueNumber, 77);
  assert.equal(report.github?.evidence, "issue-comment");
  assert.equal(report.github?.commentUrl, "https://github.com/scwlkr/Vampyre/issues/77#issuecomment-1");
  assert.deepEqual(
    githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
    [
      "GET /repos/scwlkr/Vampyre/issues",
      "GET /repos/scwlkr/Vampyre/issues/77/comments",
    ],
  );
  assert.doesNotMatch(JSON.stringify(report), /ghp_secret/);
});

test("approval check blocks when no matching approval marker exists", async () => {
  const report = await runApprovalCheck({
    host: "local",
    workspaceRoot: "/tmp/vampyre",
    local: true,
    repo: "scwlkr/Vampyre",
    projectId: "screenshot-tool",
    kind: "builder-repo-plan",
    key: "repo-plan-v1",
    env: secretEnv(),
    githubFetch: fakeFetch([], [jsonResponse(200, [])]),
  });

  assert.equal(report.ready, false);
  assert.equal(report.approved, false);
  assert.match(report.blockers[0] ?? "", /VAMPYRE_APPROVED/);
  assert.doesNotMatch(JSON.stringify(report), /ghp_secret/);
});

test("approval check blocks before GitHub calls when token is missing", async () => {
  const report = await runApprovalCheck({
    host: "local",
    workspaceRoot: "/tmp/vampyre",
    local: true,
    repo: "scwlkr/Vampyre",
    projectId: "palette-wow",
    kind: "major-feature",
    key: "new-homepage",
    env: {},
    githubFetch: async () => {
      throw new Error("GitHub should not be called");
    },
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.blockers, ["GitHub: GITHUB_TOKEN is missing"]);
});

test("remote approval check invokes the installed host app with env loaded", async () => {
  const report = await runApprovalCheck({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    repo: "scwlkr/Vampyre",
    projectId: "screenshot-tool",
    kind: "builder-vision",
    key: "vision-a",
    runner: async (command) => {
      assert.match(command, /config\/vampyre\.env/);
      assert.match(command, /node "\$cli" approval check --local --json --host 'wlkrlab'/);
      assert.match(command, /--repo 'scwlkr\/Vampyre'/);
      assert.match(command, /--project 'screenshot-tool'/);
      assert.match(command, /--kind 'builder-vision'/);
      assert.match(command, /--key 'vision-a'/);
      return ok(
        JSON.stringify({
          host: "local",
          workspaceRoot: "/home/wlkrlab/vampyre",
          ready: false,
          approved: false,
          blockers: ["GitHub approval: missing"],
          approval: {
            repo: "scwlkr/Vampyre",
            projectId: "screenshot-tool",
            kind: "builder-vision",
            key: "vision-a",
            label: "vampyre:approval",
            approvedMarker: "VAMPYRE_APPROVED",
          },
        } satisfies ApprovalCheckReport),
      );
    },
  });

  assert.equal(report.ready, false);
  assert.equal(report.host, "wlkrlab");
  assert.equal(report.workspaceRoot, "~/vampyre");
});

function secretEnv(): NodeJS.ProcessEnv {
  return {
    GITHUB_TOKEN: "ghp_secret",
  };
}

interface CapturedRequest {
  url: string;
  init: GitHubFetchInit;
}

function fakeFetch(requests: CapturedRequest[], responses: FakeResponse[]): GitHubFetch {
  return async (url, init) => {
    requests.push({ url, init });
    const response = responses.shift();
    if (!response) {
      throw new Error(`unexpected GitHub request: ${init.method} ${url}`);
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
