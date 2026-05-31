import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";
import type { GitHubFetch, GitHubFetchInit } from "../src/github/client.js";
import {
  runBuilderRepoCreate,
  type BuilderCommandRunner,
  type BuilderCommandSpec,
  type BuilderRepoCreateReport,
} from "../src/builder/repoCreation.js";

const execFileAsync = promisify(execFile);

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
    const agents = await readFile(join(workspaceRoot, "repos", "pinmark", "AGENTS.md"), "utf8");
    const docsIndex = await readFile(join(workspaceRoot, "repos", "pinmark", "docs", "index.md"), "utf8");
    const status = await readFile(join(workspaceRoot, "repos", "pinmark", "docs", "status.md"), "utf8");
    const needsVerification = await readFile(
      join(workspaceRoot, "repos", "pinmark", "docs", "todo", "needs-verification.md"),
      "utf8",
    );
    const registry = await readFile(join(workspaceRoot, "config", "project-registry.json"), "utf8");
    assert.match(readme, /Pinmark is a private local-first macOS screenshot tool/);
    assert.match(readme, /supported%20with-Vampyre/);
    assert.match(agents, /Treat `docs\/status\.md` as the current handoff/);
    assert.match(docsIndex, /Missing features/);
    assert.match(status, /Phase 0 - Project Contract And Swift Foundation/);
    assert.match(status, /## Needs Verification/);
    assert.match(needsVerification, /Screen Recording permission behavior/);
    assert.match(registry, /"displayName": "Pinmark"/);
    assert.match(registry, /"githubRepo": "scwlkr\/pinmark"/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Builder repo creation can initialize the MiniMark no-permission template", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-builder-minimark-"));
  const githubRequests: CapturedRequest[] = [];
  const gitCommands: string[] = [];

  try {
    const report = await runBuilderRepoCreate({
      host: "local",
      workspaceRoot,
      local: true,
      controlRepo: "scwlkr/Vampyre",
      projectId: "minimark",
      approvalKind: "builder-repo-plan",
      approvalKey: "minimark-repo-plan",
      repo: "scwlkr/minimark",
      description: "No-permission macOS markdown scratchpad with split editor, preview, autosave, and export.",
      template: "minimark",
      now: () => new Date("2026-05-30T16:00:00.000Z"),
      env: secretEnv(),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, [
          {
            number: 12,
            title: "Approve MiniMark repo plan",
            state: "open",
            body: [
              "Project: minimark",
              "Approval Kind: builder-repo-plan",
              "Approval Key: minimark-repo-plan",
            ].join("\n"),
            html_url: "https://github.com/scwlkr/Vampyre/issues/12",
            labels: [{ name: "vampyre:approval" }],
          },
        ]),
        jsonResponse(200, [
          {
            body: "VAMPYRE_APPROVED\n\nRepo name confirmed: minimark",
            html_url: "https://github.com/scwlkr/Vampyre/issues/12#issuecomment-1",
          },
        ]),
        jsonResponse(404, { message: "Not Found" }),
        jsonResponse(200, { login: "scwlkr" }),
        jsonResponse(201, {
          full_name: "scwlkr/minimark",
          private: true,
          url: "https://api.github.com/repos/scwlkr/minimark",
          ssh_url: "git@github.com:scwlkr/minimark.git",
          html_url: "https://github.com/scwlkr/minimark",
          default_branch: "main",
        }),
        jsonResponse(200, { names: ["macos", "swift", "markdown"] }),
      ]),
      commandRunner: fakeGitRunner(gitCommands),
      topics: ["macos", "swift", "markdown"],
    });

    assert.equal(report.ready, true);
    assert.equal(report.repository.template, "minimark");
    assert.equal(report.repository.url, "https://github.com/scwlkr/minimark");

    const readme = await readFile(join(workspaceRoot, "repos", "minimark", "README.md"), "utf8");
    const map = await readFile(join(workspaceRoot, "repos", "minimark", "docs", "map.md"), "utf8");
    const status = await readFile(join(workspaceRoot, "repos", "minimark", "docs", "status.md"), "utf8");
    const missingFeatures = await readFile(
      join(workspaceRoot, "repos", "minimark", "docs", "todo", "missing-features.md"),
      "utf8",
    );
    const workflow = await readFile(
      join(workspaceRoot, "repos", "minimark", ".github", "workflows", "macos-validation.yml"),
      "utf8",
    );
    const registry = await readFile(join(workspaceRoot, "config", "project-registry.json"), "utf8");
    assert.match(readme, /MiniMark is a private no-permission macOS markdown scratchpad/);
    assert.match(readme, /supported%20with-Vampyre/);
    assert.match(map, /needs-verification\.md/);
    assert.match(status, /no TCC permission prompts/);
    assert.match(status, /## Implemented/);
    assert.match(status, /## Next action/);
    assert.match(missingFeatures, /Split markdown editor and preview/);
    assert.match(workflow, /runs-on: macos-15/);
    assert.match(workflow, /ref_name/);
    assert.match(workflow, /swift test/);
    assert.match(registry, /"displayName": "MiniMark"/);
    assert.match(registry, /"githubRepo": "scwlkr\/minimark"/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Builder repo creation can initialize the KeepingUs web app template and append it to the registry", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-builder-keepingus-"));
  const githubRequests: CapturedRequest[] = [];
  const gitCommands: string[] = [];

  try {
    const report = await runBuilderRepoCreate({
      host: "local",
      workspaceRoot,
      local: true,
      controlRepo: "scwlkr/Vampyre",
      projectId: "keepingus",
      approvalKind: "builder-repo-plan",
      approvalKey: "keepingus-repo-plan",
      repo: "scwlkr/keepingus",
      description: "Private photo-sharing web app for close friends and family.",
      template: "keepingus",
      now: () => new Date("2026-05-31T12:00:00.000Z"),
      env: secretEnv(),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, [
          {
            number: 20,
            title: "Approve KeepingUs repo plan",
            state: "open",
            body: [
              "Project: keepingus",
              "Approval Kind: builder-repo-plan",
              "Approval Key: keepingus-repo-plan",
            ].join("\n"),
            html_url: "https://github.com/scwlkr/Vampyre/issues/20",
            labels: [{ name: "vampyre:approval" }],
          },
        ]),
        jsonResponse(200, [
          {
            body: "VAMPYRE_APPROVED\n\nRepo name confirmed: keepingus",
            html_url: "https://github.com/scwlkr/Vampyre/issues/20#issuecomment-1",
          },
        ]),
        jsonResponse(404, { message: "Not Found" }),
        jsonResponse(200, { login: "scwlkr" }),
        jsonResponse(201, {
          full_name: "scwlkr/keepingus",
          private: true,
          url: "https://api.github.com/repos/scwlkr/keepingus",
          ssh_url: "git@github.com:scwlkr/keepingus.git",
          html_url: "https://github.com/scwlkr/keepingus",
          default_branch: "main",
        }),
        jsonResponse(200, { names: ["webapp", "photo-sharing", "private-social"] }),
      ]),
      commandRunner: fakeGitRunner(gitCommands),
      topics: ["webapp", "photo-sharing", "private-social"],
    });

    assert.equal(report.ready, true);
    assert.equal(report.repository.template, "keepingus");
    assert.equal(report.repository.url, "https://github.com/scwlkr/keepingus");

    const repoPath = join(workspaceRoot, "repos", "keepingus");
    const readme = await readFile(join(repoPath, "README.md"), "utf8");
    const status = await readFile(join(repoPath, "docs", "status.md"), "utf8");
    const packageJson = await readFile(join(repoPath, "package.json"), "utf8");
    const workflow = await readFile(
      join(repoPath, ".github", "workflows", "web-validation.yml"),
      "utf8",
    );
    const policy = await readFile(join(repoPath, "src", "keepingusPolicy.js"), "utf8");
    const registry = await readFile(join(workspaceRoot, "config", "project-registry.json"), "utf8");
    assert.match(readme, /KeepingUs is a private photo-sharing web app/);
    assert.match(status, /Nice\/Vice reactions/);
    assert.match(packageJson, /"build": "node scripts\/build\.mjs"/);
    assert.match(workflow, /runs-on: ubuntu-latest/);
    assert.match(workflow, /corepack pnpm build/);
    assert.match(policy, /export function rankFeed/);
    assert.match(registry, /"id": "keepingus"/);
    assert.match(registry, /"displayName": "KeepingUs"/);
    assert.match(registry, /"githubRepo": "scwlkr\/keepingus"/);
    assert.match(registry, /"workflowId": "web-validation\.yml"/);

    await execFileAsync(process.execPath, ["--test", "tests/keepingusPolicy.test.mjs"], { cwd: repoPath });
    await execFileAsync(process.execPath, ["scripts/build.mjs"], { cwd: repoPath });
    const builtIndex = await readFile(join(repoPath, "dist", "index.html"), "utf8");
    assert.match(builtIndex, /KeepingUs/);
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
