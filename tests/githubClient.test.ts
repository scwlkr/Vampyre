import assert from "node:assert/strict";
import test from "node:test";
import {
  checkGitHubAuth,
  checkGitHubRepoAccess,
  createGitHubClient,
  createGitHubIssue,
  createGitHubIssueComment,
  createGitHubPullRequest,
  ensureGitHubLabel,
  parseGitHubRepo,
  type GitHubFetch,
  type GitHubFetchInit,
} from "../src/github/client.js";

test("GitHub client checks auth and repo access without exposing the token", async () => {
  const requests: CapturedRequest[] = [];
  const client = createGitHubClient({
    token: "ghp_secret_token",
    fetchImpl: fakeFetch(requests, [
      jsonResponse(200, { login: "scwlkr" }),
      jsonResponse(200, {
        full_name: "scwlkr/paletteWOW",
        private: false,
        permissions: { pull: true, push: true },
      }),
    ]),
  });

  const auth = await checkGitHubAuth(client);
  const repo = await checkGitHubRepoAccess(client, "scwlkr/paletteWOW");

  assert.equal(auth.login, "scwlkr");
  assert.equal(repo.fullName, "scwlkr/paletteWOW");
  assert.equal(repo.permissions?.push, true);
  assert.equal(requests[0]?.url, "https://api.github.com/user");
  assert.equal(requests[1]?.url, "https://api.github.com/repos/scwlkr/paletteWOW");
  assert.doesNotMatch(JSON.stringify({ auth, repo }), /ghp_secret_token/);
});

test("GitHub primitives create or update labels, issues, comments, and pull requests", async () => {
  const requests: CapturedRequest[] = [];
  const client = createGitHubClient({
    token: "ghp_secret_token",
    fetchImpl: fakeFetch(requests, [
      jsonResponse(404, { message: "Not Found" }),
      jsonResponse(201, { name: "vampyre:approval", url: "https://api.github.com/labels/1" }),
      jsonResponse(201, { number: 12, html_url: "https://github.com/scwlkr/paletteWOW/issues/12" }),
      jsonResponse(201, { number: 12, html_url: "https://github.com/scwlkr/paletteWOW/issues/12#comment" }),
      jsonResponse(201, { number: 13, html_url: "https://github.com/scwlkr/paletteWOW/pull/13" }),
    ]),
  });

  const label = await ensureGitHubLabel(client, {
    repo: "scwlkr/paletteWOW",
    name: "vampyre:approval",
    color: "5319e7",
    description: "Vampyre approval record",
  });
  const issue = await createGitHubIssue(client, {
    repo: "scwlkr/paletteWOW",
    title: "Approval needed",
    body: "Review this.",
    labels: ["vampyre:approval"],
  });
  const comment = await createGitHubIssueComment(client, {
    repo: "scwlkr/paletteWOW",
    issueNumber: issue.number,
    body: "Approval recorded.",
  });
  const pull = await createGitHubPullRequest(client, {
    repo: "scwlkr/paletteWOW",
    title: "Vampyre change",
    head: "vampyre/run-1",
    base: "main",
    body: "Reviewable output.",
    draft: true,
  });

  assert.equal(label.action, "created");
  assert.equal(issue.number, 12);
  assert.equal(comment.url, "https://github.com/scwlkr/paletteWOW/issues/12#comment");
  assert.equal(pull.number, 13);
  assert.deepEqual(
    requests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
    [
      "GET /repos/scwlkr/paletteWOW/labels/vampyre%3Aapproval",
      "POST /repos/scwlkr/paletteWOW/labels",
      "POST /repos/scwlkr/paletteWOW/issues",
      "POST /repos/scwlkr/paletteWOW/issues/12/comments",
      "POST /repos/scwlkr/paletteWOW/pulls",
    ],
  );
});

test("GitHub label primitive updates an existing label", async () => {
  const requests: CapturedRequest[] = [];
  const client = createGitHubClient({
    token: "ghp_secret_token",
    fetchImpl: fakeFetch(requests, [
      jsonResponse(200, { name: "vampyre:approval", url: "https://api.github.com/labels/1" }),
      jsonResponse(200, { name: "vampyre:approval", url: "https://api.github.com/labels/1" }),
    ]),
  });

  const label = await ensureGitHubLabel(client, {
    repo: "scwlkr/paletteWOW",
    name: "vampyre:approval",
    color: "5319e7",
  });

  assert.equal(label.action, "updated");
  assert.equal(requests[1]?.init.method, "PATCH");
});

test("GitHub repo parser rejects unsupported names before API calls", () => {
  assert.deepEqual(parseGitHubRepo("scwlkr/paletteWOW"), {
    owner: "scwlkr",
    name: "paletteWOW",
    fullName: "scwlkr/paletteWOW",
  });
  assert.throws(() => parseGitHubRepo("not a repo"), /owner\/name/);
});

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
    statusText: status >= 200 && status < 300 ? "OK" : "Not Found",
    async text() {
      return JSON.stringify(body);
    },
  };
}
