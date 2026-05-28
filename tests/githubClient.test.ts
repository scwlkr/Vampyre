import assert from "node:assert/strict";
import test from "node:test";
import {
  checkGitHubAuth,
  checkGitHubRepoAccess,
  createGitHubClient,
  createGitHubIssue,
  createGitHubIssueComment,
  createGitHubRepository,
  createGitHubPullRequest,
  ensureGitHubLabel,
  findOpenGitHubPullRequestForBranch,
  parseGitHubRepo,
  replaceGitHubRepositoryTopics,
  updateGitHubPullRequest,
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

test("GitHub repo primitives create a private repo and replace topics", async () => {
  const requests: CapturedRequest[] = [];
  const client = createGitHubClient({
    token: "ghp_secret_token",
    fetchImpl: fakeFetch(requests, [
      jsonResponse(200, { login: "scwlkr" }),
      jsonResponse(201, {
        full_name: "scwlkr/pinmark",
        private: true,
        url: "https://api.github.com/repos/scwlkr/pinmark",
        ssh_url: "git@github.com:scwlkr/pinmark.git",
        html_url: "https://github.com/scwlkr/pinmark",
        default_branch: "main",
      }),
      jsonResponse(200, { names: ["macos", "swift"] }),
    ]),
  });

  const repo = await createGitHubRepository(client, {
    owner: "scwlkr",
    name: "pinmark",
    private: true,
    description: "Local-first macOS screenshot markup.",
    hasIssues: true,
    hasProjects: false,
    hasWiki: false,
    hasDiscussions: false,
  });
  const topics = await replaceGitHubRepositoryTopics(client, "scwlkr/pinmark", ["macos", "swift"]);

  assert.equal(repo.fullName, "scwlkr/pinmark");
  assert.equal(repo.private, true);
  assert.deepEqual(topics, ["macos", "swift"]);
  assert.deepEqual(
    requests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
    ["GET /user", "POST /user/repos", "PUT /repos/scwlkr/pinmark/topics"],
  );
  const createBody = JSON.parse(requests[1]?.init.body ?? "{}") as Record<string, unknown>;
  assert.equal(createBody["private"], true);
  assert.equal(createBody["has_wiki"], false);
  assert.equal(createBody["has_projects"], false);
});

test("GitHub PR primitives find and update an open branch PR", async () => {
  const requests: CapturedRequest[] = [];
  const client = createGitHubClient({
    token: "ghp_secret_token",
    fetchImpl: fakeFetch(requests, [
      jsonResponse(200, [
        {
          number: 13,
          html_url: "https://github.com/scwlkr/paletteWOW/pull/13",
        },
      ]),
      jsonResponse(200, {
        number: 13,
        html_url: "https://github.com/scwlkr/paletteWOW/pull/13",
      }),
    ]),
  });

  const pull = await findOpenGitHubPullRequestForBranch(client, {
    repo: "scwlkr/paletteWOW",
    head: "vampyre/run-1",
    base: "main",
  });
  assert.equal(pull?.number, 13);

  const updated = await updateGitHubPullRequest(client, {
    repo: "scwlkr/paletteWOW",
    pullNumber: 13,
    title: "Vampyre change",
    body: "Updated reviewable output.",
    base: "main",
  });
  assert.equal(updated.url, "https://github.com/scwlkr/paletteWOW/pull/13");

  const firstUrl = new URL(requests[0]?.url ?? "");
  assert.equal(firstUrl.pathname, "/repos/scwlkr/paletteWOW/pulls");
  assert.equal(firstUrl.searchParams.get("state"), "open");
  assert.equal(firstUrl.searchParams.get("head"), "scwlkr:vampyre/run-1");
  assert.equal(firstUrl.searchParams.get("base"), "main");
  assert.equal(requests[1]?.init.method, "PATCH");
  assert.equal(new URL(requests[1]?.url ?? "").pathname, "/repos/scwlkr/paletteWOW/pulls/13");
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
