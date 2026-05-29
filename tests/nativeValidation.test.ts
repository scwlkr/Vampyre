import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runNativeValidationRequest } from "../src/validation/nativeValidation.js";
import type { GitHubFetch, GitHubFetchInit } from "../src/github/client.js";

test("native validation request dispatches a GitHub Actions workflow and records the result", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-native-validation-"));
  const requests: CapturedRequest[] = [];

  try {
    await mkdir(join(workspaceRoot, "config"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "config", "project-registry.json"),
      JSON.stringify({
        version: 1,
        projects: [
          {
            id: "screenshot-tool",
            displayName: "Pinmark",
            mode: "builder",
            githubRepo: "scwlkr/pinmark",
            rawIdea: "A real macOS screenshot tool.",
            cadence: "builder-loop-after-owner-approval",
            autonomyPolicy: "continuous-product-loop-direct-main",
            paused: false,
            validationCommands: ["git diff --check"],
            nativeValidation: {
              provider: "github-actions",
              workflowId: "macos-validation.yml",
              runnerLabel: "macos-15",
              requiredConclusion: "success",
              timeoutSeconds: 1800,
            },
          },
        ],
      }),
    );

    const report = await runNativeValidationRequest({
      host: "local",
      workspaceRoot,
      projectId: "screenshot-tool",
      ref: "main",
      wait: true,
      local: true,
      env: { GITHUB_TOKEN: "ghp_secret_token" },
      now: () => new Date("2026-05-29T16:00:00.000Z"),
      sleep: async () => undefined,
      pollIntervalMs: 1,
      githubFetch: fakeFetch(requests, [
        jsonResponse(204, {}),
        jsonResponse(200, {
          workflow_runs: [
            {
              id: 1001,
              status: "queued",
              html_url: "https://github.com/scwlkr/pinmark/actions/runs/1001",
              head_branch: "main",
              event: "workflow_dispatch",
              created_at: "2026-05-29T16:00:00.000Z",
            },
          ],
        }),
        jsonResponse(200, {
          id: 1001,
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/scwlkr/pinmark/actions/runs/1001",
        }),
        jsonResponse(200, {
          jobs: [
            {
              id: 2001,
              name: "build",
              status: "completed",
              conclusion: "success",
              html_url: "https://github.com/scwlkr/pinmark/actions/runs/1001/job/2001",
            },
          ],
        }),
      ]),
    });

    assert.equal(report.ready, true);
    assert.equal(report.github?.status, "completed");
    assert.equal(report.github?.conclusion, "success");
    assert.equal(report.github?.runUrl, "https://github.com/scwlkr/pinmark/actions/runs/1001");
    assert.equal(report.reportPaths?.markdown, join(workspaceRoot, "reports", "native-validation", "screenshot-tool", "latest.md"));
    assert.doesNotMatch(JSON.stringify(report), /ghp_secret_token/);
    assert.deepEqual(
      requests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      [
        "POST /repos/scwlkr/pinmark/actions/workflows/macos-validation.yml/dispatches",
        "GET /repos/scwlkr/pinmark/actions/workflows/macos-validation.yml/runs",
        "GET /repos/scwlkr/pinmark/actions/runs/1001",
        "GET /repos/scwlkr/pinmark/actions/runs/1001/jobs",
      ],
    );

    const rows = spawnSync(
      "sqlite3",
      [
        join(workspaceRoot, "data", "vampyre.sqlite"),
        "select project_id || '|' || provider_run_id || '|' || status || '|' || conclusion from external_validation_runs;",
      ],
      { encoding: "utf8" },
    );
    assert.equal(rows.status, 0);
    assert.equal(rows.stdout.trim(), "screenshot-tool|1001|completed|success");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
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
