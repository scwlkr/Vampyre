import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RemoteCommandResult } from "../src/doctor/ssh.js";
import type { GitHubFetch, GitHubFetchInit } from "../src/github/client.js";
import {
  runWatcherDiscovery,
  type WatcherCommandRunner,
  type WatcherCommandSpec,
} from "../src/watcher/discovery.js";

test("watcher discovery inspects the runtime clone, GitHub state, and writes reports", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-watcher-"));
  const repoPath = join(workspaceRoot, "repos", "palette-wow");
  const githubRequests: CapturedRequest[] = [];

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await mkdir(join(repoPath, "src"), { recursive: true });
    await writeFile(
      join(repoPath, "README.md"),
      "# paletteWOW\n\nA color palette workbench for building and comparing interface palettes.\n",
    );
    await writeFile(
      join(repoPath, "package.json"),
      JSON.stringify(
        {
          name: "palette-wow",
          scripts: {
            test: "vitest run",
            typecheck: "tsc --noEmit",
            lint: "eslint .",
            build: "vite build",
          },
        },
        null,
        2,
      ),
    );
    await writeFile(join(repoPath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(repoPath, "src", "App.tsx"), "export function App() { return null; }\n");

    const report = await runWatcherDiscovery({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T18:00:00.000Z"),
      env: { GITHUB_TOKEN: "ghp_secret" },
      commandRunner: fakeCommandRunner(repoPath),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, [
          {
            number: 7,
            title: "Improve palette export",
            state: "open",
            html_url: "https://github.com/scwlkr/paletteWOW/issues/7",
            labels: [{ name: "enhancement" }],
          },
        ]),
        jsonResponse(200, [
          {
            number: 8,
            title: "Update UI controls",
            state: "open",
            html_url: "https://github.com/scwlkr/paletteWOW/pull/8",
            draft: false,
            head: { ref: "controls" },
            base: { ref: "main" },
          },
        ]),
      ]),
    });

    assert.equal(report.ready, true);
    assert.equal(report.project?.id, "palette-wow");
    assert.equal(report.repository?.path, repoPath);
    assert.equal(report.repository?.currentBranch, "main");
    assert.equal(report.repository?.commit, "abc1234");
    assert.equal(report.repository?.dirty, false);
    assert.match(report.purpose ?? "", /paletteWOW/);
    assert.deepEqual(report.validation?.commands, ["pnpm test", "pnpm typecheck", "pnpm lint", "pnpm build"]);
    assert.equal(report.github?.openIssues[0]?.number, 7);
    assert.equal(report.github?.openPullRequests[0]?.headRef, "controls");
    assert.match(report.firstSafeImprovement?.title ?? "", /CONTEXT\.md/);
    assert.doesNotMatch(JSON.stringify(report), /ghp_secret/);
    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      ["/repos/scwlkr/paletteWOW/issues", "/repos/scwlkr/paletteWOW/pulls"].map((path) => `GET ${path}`),
    );

    const markdownPath = report.reportPaths?.markdown;
    assert.ok(markdownPath);
    const markdown = await readFile(markdownPath, "utf8");
    assert.match(markdown, /Watcher Discovery Pass: paletteWOW/);
    assert.match(markdown, /pnpm test/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("remote watcher discovery invokes the installed host app with env loaded", async () => {
  const report = await runWatcherDiscovery({
    host: "wlkrlab",
    workspaceRoot: "~/vampyre",
    projectId: "palette-wow",
    runner: async (command) => {
      assert.match(command, /config\/vampyre\.env/);
      assert.match(
        command,
        /node "\$cli" watcher discover --local --json --host 'wlkrlab' --workspace-root "\$root" --project 'palette-wow'/,
      );
      return ok(
        JSON.stringify({
          host: "local",
          workspaceRoot: "/home/wlkrlab/vampyre",
          ready: true,
          blockers: [],
          generatedAt: "2026-05-28T18:00:00.000Z",
          proof: [],
        }),
      );
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.host, "wlkrlab");
  assert.equal(report.workspaceRoot, "~/vampyre");
});

test("watcher discovery infers Rails validation from Bundler files", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-watcher-rails-"));
  const repoPath = join(workspaceRoot, "repos", "palette-wow");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await mkdir(join(repoPath, "app", "models"), { recursive: true });
    await writeFile(join(repoPath, "README.md"), "# paletteWOW\n\nRails palette generator.\n");
    await writeFile(join(repoPath, "Gemfile"), "source 'https://rubygems.org'\n");
    await writeFile(join(repoPath, "Gemfile.lock"), "GEM\n");
    await writeFile(join(repoPath, "Rakefile"), "require_relative 'config/application'\n");

    const report = await runWatcherDiscovery({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T18:10:00.000Z"),
      env: { GITHUB_TOKEN: "ghp_secret" },
      commandRunner: fakeCommandRunner(repoPath),
      githubFetch: fakeFetch([], [jsonResponse(200, []), jsonResponse(200, [])]),
    });

    assert.equal(report.ready, true);
    assert.equal(report.validation?.packageManager, "bundler");
    assert.deepEqual(report.validation?.commands, ["bundle exec rails test", "bundle exec rails zeitwerk:check"]);
    assert.ok(report.repository?.configFiles.includes("Gemfile"));
    assert.ok(report.repository?.appStructure.includes("app/models/"));
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

function fakeCommandRunner(repoPath: string): WatcherCommandRunner {
  return async (spec: WatcherCommandSpec) => {
    assert.equal(spec.command, "git");
    const args = spec.args.join(" ");
    if (args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (args.includes("rev-parse --abbrev-ref HEAD")) {
      return ok("main");
    }
    if (args.includes("rev-parse --short HEAD")) {
      return ok("abc1234");
    }
    if (args.includes("status --porcelain")) {
      return ok("");
    }

    throw new Error(`unexpected command: ${spec.command} ${args}`);
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
