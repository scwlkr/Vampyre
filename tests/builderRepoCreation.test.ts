import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";
import type { GitHubFetch, GitHubFetchInit } from "../src/github/client.js";
import {
  runBuilderRepoCreate,
  type BuilderCommandRunner,
  type BuilderCommandSpec,
  type BuilderRepoCreateReport,
} from "../src/builder/repoCreation.js";

test("Builder repo creation gates on approval, creates private repo, writes contract, and pushes main", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-builder-repo-"));
  const githubRequests: CapturedRequest[] = [];
  const gitCommands: string[] = [];

  try {
    const report = await runBuilderRepoCreate({
      host: "local",
      workspaceRoot,
      local: true,
      controlRepo: "scwlkr/Vampyre",
      projectId: "screenshot-tool",
      approvalKind: "builder-repo-plan",
      approvalKey: "pinmark-repo-plan",
      repo: "scwlkr/pinmark",
      description: "Local-first macOS screenshot markup, redaction, pinning, OCR, and polished export.",
      template: "pinmark",
      now: () => new Date("2026-05-28T21:00:00.000Z"),
      env: secretEnv(),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, [
          {
            number: 8,
            title: "Approve Pinmark repo plan",
            state: "open",
            body: [
              "Project: screenshot-tool",
              "Approval Kind: builder-repo-plan",
              "Approval Key: pinmark-repo-plan",
            ].join("\n"),
            html_url: "https://github.com/scwlkr/Vampyre/issues/8",
            labels: [{ name: "vampyre:approval" }],
          },
        ]),
        jsonResponse(200, [
          {
            body: "VAMPYRE_APPROVED\n\nRepo name confirmed: pinmark",
            html_url: "https://github.com/scwlkr/Vampyre/issues/8#issuecomment-1",
          },
        ]),
        jsonResponse(404, { message: "Not Found" }),
        jsonResponse(200, { login: "scwlkr" }),
        jsonResponse(201, {
          full_name: "scwlkr/pinmark",
          private: true,
          url: "https://api.github.com/repos/scwlkr/pinmark",
          ssh_url: "git@github.com:scwlkr/pinmark.git",
          html_url: "https://github.com/scwlkr/pinmark",
          default_branch: "main",
        }),
        jsonResponse(200, { names: ["macos", "swift", "swiftui"] }),
      ]),
      commandRunner: fakeGitRunner(gitCommands),
      topics: ["macos", "swift", "swiftui"],
    });

    assert.equal(report.ready, true);
    assert.equal(report.approval.approved, true);
    assert.equal(report.repository.action, "created");
    assert.equal(report.repository.private, true);
    assert.equal(report.repository.commit, "abc1234");
    assert.equal(report.repository.url, "https://github.com/scwlkr/pinmark");
    assert.doesNotMatch(JSON.stringify(report), /ghp_secret/);
    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      [
        "GET /repos/scwlkr/Vampyre/issues",
        "GET /repos/scwlkr/Vampyre/issues/8/comments",
        "GET /repos/scwlkr/pinmark",
        "GET /user",
        "POST /user/repos",
        "PUT /repos/scwlkr/pinmark/topics",
      ],
    );
    assert.ok(gitCommands.some((command) => command.includes("init -b main")));
    assert.ok(gitCommands.some((command) => command.includes("push -u origin main")));

    const readme = await readFile(join(workspaceRoot, "repos", "pinmark", "README.md"), "utf8");
    const status = await readFile(join(workspaceRoot, "repos", "pinmark", "docs", "STATUS.md"), "utf8");
    const registry = await readFile(join(workspaceRoot, "config", "project-registry.json"), "utf8");
    assert.match(readme, /Pinmark is a local-first macOS screenshot tool/);
    assert.match(status, /Phase 0 - Project Contract And Swift Foundation/);
    assert.match(registry, /"displayName": "Pinmark"/);
    assert.match(registry, /"githubRepo": "scwlkr\/pinmark"/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Builder repo creation blocks before repo creation when approval is missing", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-builder-repo-missing-"));
  const githubRequests: CapturedRequest[] = [];

  try {
    const report = await runBuilderRepoCreate({
      host: "local",
      workspaceRoot,
      local: true,
      controlRepo: "scwlkr/Vampyre",
      projectId: "screenshot-tool",
      approvalKind: "builder-repo-plan",
      approvalKey: "pinmark-repo-plan",
      repo: "scwlkr/pinmark",
      description: "Local-first macOS screenshot markup.",
      template: "pinmark",
      env: secretEnv(),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, [
          {
            number: 8,
            title: "Approve Pinmark repo plan",
            state: "open",
            body: [
              "Project: screenshot-tool",
              "Approval Kind: builder-repo-plan",
              "Approval Key: pinmark-repo-plan",
            ].join("\n"),
            html_url: "https://github.com/scwlkr/Vampyre/issues/8",
            labels: [{ name: "vampyre:approval" }],
          },
        ]),
        jsonResponse(200, []),
      ]),
      commandRunner: async () => {
        throw new Error("git should not run without approval");
      },
    });

    assert.equal(report.ready, false);
    assert.equal(report.repository.action, "blocked");
    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      ["GET /repos/scwlkr/Vampyre/issues", "GET /repos/scwlkr/Vampyre/issues/8/comments"],
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("remote Builder repo creation invokes the installed host app with env loaded", async () => {
  const report = await runBuilderRepoCreate({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    controlRepo: "scwlkr/Vampyre",
    projectId: "screenshot-tool",
    approvalKind: "builder-repo-plan",
    approvalKey: "pinmark-repo-plan",
    repo: "scwlkr/pinmark",
    description: "Local-first macOS screenshot markup.",
    template: "pinmark",
    runner: async (command) => {
      assert.match(command, /config\/vampyre\.env/);
      assert.match(command, /node "\$cli" 'builder' 'repo' 'create' '--local' '--json'/);
      assert.match(command, /'--control-repo' 'scwlkr\/Vampyre'/);
      assert.match(command, /'--approval-key' 'pinmark-repo-plan'/);
      assert.match(command, /'--repo' 'scwlkr\/pinmark'/);
      return ok(
        JSON.stringify({
          host: "local",
          workspaceRoot: "/home/wlkrlab/vampyre",
          ready: true,
          blockers: [],
          approval: {
            controlRepo: "scwlkr/Vampyre",
            projectId: "screenshot-tool",
            kind: "builder-repo-plan",
            key: "pinmark-repo-plan",
            approved: true,
          },
          repository: {
            repo: "scwlkr/pinmark",
            template: "pinmark",
            action: "created",
            private: true,
            url: "https://github.com/scwlkr/pinmark",
          },
          proof: [],
        } satisfies BuilderRepoCreateReport),
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

function fakeGitRunner(commands: string[]): BuilderCommandRunner {
  return async (spec: BuilderCommandSpec) => {
    assert.equal(spec.command, "git");
    const command = spec.args.join(" ");
    commands.push(command);
    if (command.includes("rev-parse --short HEAD")) {
      return ok("abc1234");
    }
    return ok("");
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
