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
import { initializeOperationalState, recordExternalValidationRun, recordProjectBlocker } from "../src/state/operationalState.js";

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
      projectId: "palette-wow",
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
    assert.match(report.taskContext?.task ?? "", /No project-changing task is configured/);
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

test("build agent passes task context to a worker, pushes changes, and opens an owner-reviewed PR", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-worker-"));
  const repoPath = join(workspaceRoot, "repos", "palette-wow");
  const githubRequests: CapturedRequest[] = [];
  const telegramRequests: CapturedRequest[] = [];

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "palette-wow",
      now: () => new Date("2026-05-28T22:00:00.000Z"),
      env: secretEnv(),
      task: "Add a concise project status note and leave the change for Owner review.",
      workerCommand: "printf 'worker changed docs\\n'",
      commandRunner: fakeWorkerChangeCommandRunner(repoPath),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, []),
        jsonResponse(201, { number: 21, html_url: "https://github.com/scwlkr/paletteWOW/pull/21" }),
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
          html_url: "https://github.com/scwlkr/paletteWOW/issues/16#issuecomment-worker",
        }),
      ]),
      telegramFetch: fakeFetch(telegramRequests, [
        jsonResponse(200, { ok: true, result: { message_id: 204 } }),
      ]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.equal(report.worker?.status, "completed");
    assert.match(report.worker?.stdoutSummary ?? "", /worker changed docs/);
    assert.equal(report.branchOutput?.status, "pushed");
    assert.deepEqual(report.branchOutput?.changedFiles, ["docs/STATUS.md", "docs/new-note.md"]);
    assert.equal(report.branchOutput?.commit, "abc1234");
    assert.equal(report.pullRequest?.number, 21);
    assert.equal(report.pullRequest?.draft, false);
    assert.equal(report.worktree?.cleanup, "removed");
    assert.doesNotMatch(JSON.stringify(report), /ghp_secret|bot_secret|987654|eC1hY2Nlc3MtdG9rZW4/);

    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      [
        "GET /repos/scwlkr/paletteWOW/pulls",
        "POST /repos/scwlkr/paletteWOW/pulls",
        "GET /repos/scwlkr/paletteWOW/labels/vampyre%3Areview",
        "PATCH /repos/scwlkr/paletteWOW/labels/vampyre%3Areview",
        "GET /repos/scwlkr/paletteWOW/issues",
        "POST /repos/scwlkr/paletteWOW/issues/16/comments",
      ],
    );
    const createBody = JSON.parse(githubRequests[1]?.init.body ?? "{}") as Record<string, unknown>;
    assert.equal(createBody["draft"], false);
    assert.match(String(createBody["body"]), /Owner-reviewed PR/);
    assert.match(telegramRequests[0]?.init.body ?? "", /https:\/\/github\.com\/scwlkr\/paletteWOW\/pull\/21/);
    assert.match(telegramRequests[0]?.init.body ?? "", /Owner decision steps/);
    assert.match(telegramRequests[0]?.init.body ?? "", /Open this GitHub PR: https:\/\/github\.com\/scwlkr\/paletteWOW\/pull\/21/);
    assert.match(telegramRequests[0]?.init.body ?? "", /Review changes/);
    assert.match(telegramRequests[0]?.init.body ?? "", /VAMPYRE_DENIED/);

    const taskContextPath = report.taskContext?.path;
    assert.ok(taskContextPath);
    const taskContext = await readFile(taskContextPath, "utf8");
    assert.match(taskContext, /Add a concise project status note/);
    assert.match(taskContext, /Do not merge/);

    const workerStdoutPath = report.worker?.stdoutPath;
    assert.ok(workerStdoutPath);
    assert.match(await readFile(workerStdoutPath, "utf8"), /worker changed docs/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent pushes approved product-loop projects directly to main", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-direct-main-"));
  const repoPath = join(workspaceRoot, "repos", "screenshot-tool");
  const githubRequests: CapturedRequest[] = [];

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
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
            rawIdea: "A real macOS screenshot tool with quick markup features similar in spirit to ShareX.",
            cadence: "builder-loop-after-owner-approval",
            autonomyPolicy: "continuous-product-loop-direct-main",
            paused: false,
            validationCommands: ["git diff --check"],
          },
        ],
      }),
    );

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "screenshot-tool",
      now: () => new Date("2026-05-29T12:00:00.000Z"),
      env: secretEnv(),
      task: "Add the next Pinmark product-loop feature.",
      workerCommand: "printf 'worker changed pinmark\\n'",
      commandRunner: fakeDirectMainCommandRunner(repoPath),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 3,
            title: "Vampyre review: Pinmark",
            html_url: "https://github.com/scwlkr/pinmark/issues/3",
          },
        ]),
        jsonResponse(201, {
          number: 3,
          html_url: "https://github.com/scwlkr/pinmark/issues/3#issuecomment-direct",
        }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 206 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.equal(report.project?.id, "screenshot-tool");
    assert.equal(report.branchOutput?.status, "pushed-main");
    assert.equal(report.branchOutput?.commit, "def5678");
    assert.equal(report.pullRequest, undefined);
    assert.equal(report.nativeValidation, undefined);
    assert.match(report.proof.join("\n"), /Pushed approved direct-main output/);
    assert.match(report.proof.join("\n"), /Fast-forwarded runtime clone/);
    assert.ok(report.taskContext?.path);
    const taskContext = await readFile(report.taskContext.path, "utf8");
    assert.match(taskContext, /Do not load or use scwlkr-context, context\.scwlkr\.com, context-inbox/);

    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      [
        "GET /repos/scwlkr/pinmark/labels/vampyre%3Areview",
        "PATCH /repos/scwlkr/pinmark/labels/vampyre%3Areview",
        "GET /repos/scwlkr/pinmark/issues",
        "POST /repos/scwlkr/pinmark/issues/3/comments",
      ],
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent requests native validation after approved direct-main output", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-direct-main-native-"));
  const repoPath = join(workspaceRoot, "repos", "screenshot-tool");
  const githubRequests: CapturedRequest[] = [];
  const telegramRequests: CapturedRequest[] = [];

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await writeProjectRegistry(workspaceRoot, [pinmarkProject({ nativeValidation: nativeValidationConfig() })]);

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "screenshot-tool",
      now: () => new Date("2026-05-29T12:00:00.000Z"),
      env: secretEnv(),
      task: "Add the next Pinmark product-loop feature.",
      workerCommand: "printf 'worker changed pinmark\\n'",
      commandRunner: fakeDirectMainCommandRunner(repoPath),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, {}),
        jsonResponse(200, { workflow_runs: [workflowRun(9001, "completed", "success", "main")] }),
        jsonResponse(200, workflowRun(9001, "completed", "success", "main")),
        jsonResponse(200, { jobs: [workflowJob(9002, "SwiftPM and app build", "completed", "success")] }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 3,
            title: "Vampyre review: Pinmark",
            html_url: "https://github.com/scwlkr/pinmark/issues/3",
          },
        ]),
        jsonResponse(201, {
          number: 3,
          html_url: "https://github.com/scwlkr/pinmark/issues/3#issuecomment-native",
        }),
      ]),
      telegramFetch: fakeFetch(telegramRequests, [
        jsonResponse(200, { ok: true, result: { message_id: 208 } }),
      ]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.equal(report.branchOutput?.status, "pushed-main");
    assert.equal(report.nativeValidation?.ref, "main");
    assert.equal(report.nativeValidation?.status, "completed");
    assert.equal(report.nativeValidation?.conclusion, "success");
    assert.equal(report.nativeValidation?.runUrl, "https://github.com/scwlkr/pinmark/actions/runs/9001");
    assert.match(report.proof.join("\n"), /Native validation requested for main: completed\/success/);
    assert.match(telegramRequests[0]?.init.body ?? "", /actions\/runs\/9001/);

    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      [
        "POST /repos/scwlkr/pinmark/actions/workflows/macos-validation.yml/dispatches",
        "GET /repos/scwlkr/pinmark/actions/workflows/macos-validation.yml/runs",
        "GET /repos/scwlkr/pinmark/actions/runs/9001",
        "GET /repos/scwlkr/pinmark/actions/runs/9001/jobs",
        "GET /repos/scwlkr/pinmark/labels/vampyre%3Areview",
        "PATCH /repos/scwlkr/pinmark/labels/vampyre%3Areview",
        "GET /repos/scwlkr/pinmark/issues",
        "POST /repos/scwlkr/pinmark/issues/3/comments",
      ],
    );
    const dispatchBody = JSON.parse(githubRequests[0]?.init.body ?? "{}") as Record<string, unknown>;
    assert.equal(dispatchBody["ref"], "main");
    assert.deepEqual(dispatchBody["inputs"], { ref_name: "main" });

    const validationRows = spawnSync(
      "sqlite3",
      [
        join(workspaceRoot, "data", "vampyre.sqlite"),
        "select project_id || '|' || ref || '|' || status || '|' || conclusion from external_validation_runs;",
      ],
      { encoding: "utf8" },
    );
    assert.equal(validationRows.status, 0);
    assert.equal(validationRows.stdout.trim(), "screenshot-tool|main|completed|success");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent captures required visual proof and sends the product screenshot to Telegram", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-visual-proof-"));
  const repoPath = join(workspaceRoot, "repos", "screenshot-tool");
  const githubRequests: CapturedRequest[] = [];
  const telegramRequests: CapturedRequest[] = [];
  const image = Buffer.from("fake-png");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await writeProjectRegistry(workspaceRoot, [
      pinmarkProject({
        nativeValidation: nativeValidationConfig(),
        visualProof: visualProofConfig(),
      }),
    ]);

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "screenshot-tool",
      now: () => new Date("2026-05-29T12:00:00.000Z"),
      env: secretEnv(),
      task: "Add the next Pinmark product-loop feature.",
      workerCommand: "printf 'worker changed pinmark\\n'",
      commandRunner: fakeDirectMainCommandRunner(repoPath),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, {}),
        jsonResponse(200, { workflow_runs: [workflowRun(9401, "completed", "success", "main")] }),
        jsonResponse(200, workflowRun(9401, "completed", "success", "main")),
        jsonResponse(200, { jobs: [workflowJob(9402, "SwiftPM and app build", "completed", "success")] }),
        jsonResponse(200, {
          artifacts: [
            {
              id: 9403,
              name: "pinmark-visual-proof",
              expired: false,
              archive_download_url: "https://api.github.com/repos/scwlkr/pinmark/actions/artifacts/9403/zip",
            },
          ],
        }),
        bytesResponse(200, zipStoredFile("pinmark-product.png", image)),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 3,
            title: "Vampyre review: Pinmark",
            html_url: "https://github.com/scwlkr/pinmark/issues/3",
          },
        ]),
        jsonResponse(201, {
          number: 3,
          html_url: "https://github.com/scwlkr/pinmark/issues/3#issuecomment-visual-proof",
        }),
      ]),
      telegramFetch: fakeFetch(telegramRequests, [
        jsonResponse(200, { ok: true, result: { message_id: 212 } }),
      ]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.equal(report.visualProof?.ready, true);
    assert.equal(report.visualProof?.status, "captured");
    assert.equal(report.visualProof?.imageFileName, "pinmark-product.png");
    assert.ok(report.visualProof?.imagePath);
    assert.deepEqual(await readFile(report.visualProof.imagePath), image);
    assert.equal(report.telegram?.kind, "photo");
    assert.equal(report.telegram?.messageId, "212");
    assert.match(report.proof.join("\n"), /Visual proof captured/);
    assert.match(report.github?.commentUrl ?? "", /issuecomment-visual-proof/);

    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      [
        "POST /repos/scwlkr/pinmark/actions/workflows/macos-validation.yml/dispatches",
        "GET /repos/scwlkr/pinmark/actions/workflows/macos-validation.yml/runs",
        "GET /repos/scwlkr/pinmark/actions/runs/9401",
        "GET /repos/scwlkr/pinmark/actions/runs/9401/jobs",
        "GET /repos/scwlkr/pinmark/actions/runs/9401/artifacts",
        "GET /repos/scwlkr/pinmark/actions/artifacts/9403/zip",
        "GET /repos/scwlkr/pinmark/labels/vampyre%3Areview",
        "PATCH /repos/scwlkr/pinmark/labels/vampyre%3Areview",
        "GET /repos/scwlkr/pinmark/issues",
        "POST /repos/scwlkr/pinmark/issues/3/comments",
      ],
    );
    assert.match(telegramRequests[0]?.url ?? "", /sendPhoto/);
    const form = telegramRequests[0]?.init.body as FormData;
    assert.equal(form.get("chat_id"), "987654");
    assert.match(String(form.get("caption")), /Vampyre product screenshot/);
    assert.match(String(form.get("caption")), /Owner decision steps/);
    assert.match(String(form.get("caption")), /Open this GitHub issue\/comment: https:\/\/github\.com\/scwlkr\/pinmark\/issues\/3#issuecomment-visual-proof/);
    assert.match(String(form.get("caption")), /VAMPYRE_APPROVED/);
    assert.match(String(form.get("caption")), /VAMPYRE_DENIED/);
    assert.match(String(form.get("caption")), /worker changed pinmark/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent records a blocker when required visual proof is missing", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-visual-proof-missing-"));
  const repoPath = join(workspaceRoot, "repos", "screenshot-tool");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await writeProjectRegistry(workspaceRoot, [
      pinmarkProject({
        nativeValidation: nativeValidationConfig(),
        visualProof: visualProofConfig(),
      }),
    ]);

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "screenshot-tool",
      now: () => new Date("2026-05-29T12:00:00.000Z"),
      env: secretEnv(),
      task: "Add the next Pinmark product-loop feature.",
      workerCommand: "printf 'worker changed pinmark\\n'",
      commandRunner: fakeDirectMainCommandRunner(repoPath),
      githubFetch: fakeFetch([], [
        jsonResponse(200, {}),
        jsonResponse(200, { workflow_runs: [workflowRun(9501, "completed", "success", "main")] }),
        jsonResponse(200, workflowRun(9501, "completed", "success", "main")),
        jsonResponse(200, { jobs: [workflowJob(9502, "SwiftPM and app build", "completed", "success")] }),
        jsonResponse(200, { artifacts: [] }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 3,
            title: "Vampyre review: Pinmark",
            html_url: "https://github.com/scwlkr/pinmark/issues/3",
          },
        ]),
        jsonResponse(201, {
          number: 3,
          html_url: "https://github.com/scwlkr/pinmark/issues/3#issuecomment-visual-missing",
        }),
      ]),
      telegramFetch: fakeFetch([], [
        jsonResponse(200, { ok: true, result: { message_id: 213 } }),
      ]) as TelegramFetch,
    });

    assert.equal(report.ready, false);
    assert.equal(report.runJournal?.status, "blocked");
    assert.equal(report.visualProof?.ready, false);
    assert.match(report.blockers.join("\n"), /Visual proof: artifact pinmark-visual-proof is missing/);

    const blockerRows = spawnSync(
      "sqlite3",
      [
        join(workspaceRoot, "data", "vampyre.sqlite"),
        "select summary || '|' || status from project_blockers where summary='Visual Proof failure';",
      ],
      { encoding: "utf8" },
    );
    assert.equal(blockerRows.status, 0);
    assert.equal(blockerRows.stdout.trim(), "Visual Proof failure|open");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent requests native validation for PR-mode branch output before opening the PR", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-pr-native-"));
  const repoPath = join(workspaceRoot, "repos", "palette-wow");
  const githubRequests: CapturedRequest[] = [];

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await writeProjectRegistry(workspaceRoot, [
      {
        id: "palette-wow",
        displayName: "paletteWOW",
        mode: "safe-watcher",
        githubRepo: "scwlkr/paletteWOW",
        cadence: "daily-forward-motion",
        autonomyPolicy: "auto-safe-work-ends-in-owner-reviewed-pr",
        paused: false,
        validationCommands: ["bundle exec rails test", "bundle exec rails zeitwerk:check", "bundle exec rails assets:precompile"],
        nativeValidation: nativeValidationConfig(),
      },
    ]);

    const branch = "vampyre/build-agent/palette-wow/20260528T220000Z";
    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      now: () => new Date("2026-05-28T22:00:00.000Z"),
      env: secretEnv(),
      task: "Add a concise project status note and leave the change for Owner review.",
      workerCommand: "printf 'worker changed docs\\n'",
      commandRunner: fakeWorkerChangeCommandRunner(repoPath),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, {}),
        jsonResponse(200, { workflow_runs: [workflowRun(9101, "completed", "success", branch, "scwlkr/paletteWOW")] }),
        jsonResponse(200, workflowRun(9101, "completed", "success", branch, "scwlkr/paletteWOW")),
        jsonResponse(200, { jobs: [workflowJob(9102, "Hosted validation", "completed", "success", "scwlkr/paletteWOW")] }),
        jsonResponse(200, []),
        jsonResponse(201, { number: 21, html_url: "https://github.com/scwlkr/paletteWOW/pull/21" }),
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
          html_url: "https://github.com/scwlkr/paletteWOW/issues/16#issuecomment-native-pr",
        }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 209 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.equal(report.branchOutput?.status, "pushed");
    assert.equal(report.pullRequest?.draft, false);
    assert.equal(report.nativeValidation?.ref, branch);
    assert.equal(report.nativeValidation?.conclusion, "success");

    assert.deepEqual(
      githubRequests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
      [
        "POST /repos/scwlkr/paletteWOW/actions/workflows/macos-validation.yml/dispatches",
        "GET /repos/scwlkr/paletteWOW/actions/workflows/macos-validation.yml/runs",
        "GET /repos/scwlkr/paletteWOW/actions/runs/9101",
        "GET /repos/scwlkr/paletteWOW/actions/runs/9101/jobs",
        "GET /repos/scwlkr/paletteWOW/pulls",
        "POST /repos/scwlkr/paletteWOW/pulls",
        "GET /repos/scwlkr/paletteWOW/labels/vampyre%3Areview",
        "PATCH /repos/scwlkr/paletteWOW/labels/vampyre%3Areview",
        "GET /repos/scwlkr/paletteWOW/issues",
        "POST /repos/scwlkr/paletteWOW/issues/16/comments",
      ],
    );
    const createBody = JSON.parse(githubRequests[5]?.init.body ?? "{}") as Record<string, unknown>;
    assert.match(String(createBody["body"]), /Native Validation: completed\/success/);
    assert.match(String(createBody["body"]), /actions\/runs\/9101/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent blocks on failed native validation after direct-main output", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-native-failure-"));
  const repoPath = join(workspaceRoot, "repos", "screenshot-tool");
  const githubRequests: CapturedRequest[] = [];
  const telegramRequests: CapturedRequest[] = [];

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await writeProjectRegistry(workspaceRoot, [pinmarkProject({ nativeValidation: nativeValidationConfig() })]);

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "screenshot-tool",
      now: () => new Date("2026-05-29T12:00:00.000Z"),
      env: secretEnv(),
      task: "Add the next Pinmark product-loop feature.",
      workerCommand: "printf 'worker changed pinmark\\n'",
      commandRunner: fakeDirectMainCommandRunner(repoPath),
      githubFetch: fakeFetch(githubRequests, [
        jsonResponse(200, {}),
        jsonResponse(200, { workflow_runs: [workflowRun(9201, "completed", "failure", "main")] }),
        jsonResponse(200, workflowRun(9201, "completed", "failure", "main")),
        jsonResponse(200, { jobs: [workflowJob(9202, "SwiftPM and app build", "completed", "failure")] }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 3,
            title: "Vampyre review: Pinmark",
            html_url: "https://github.com/scwlkr/pinmark/issues/3",
          },
        ]),
        jsonResponse(201, {
          number: 3,
          html_url: "https://github.com/scwlkr/pinmark/issues/3#issuecomment-native-failure",
        }),
      ]),
      telegramFetch: fakeFetch(telegramRequests, [
        jsonResponse(200, { ok: true, result: { message_id: 210 } }),
      ]) as TelegramFetch,
    });

    assert.equal(report.ready, false);
    assert.equal(report.runJournal?.status, "blocked");
    assert.equal(report.worktree?.cleanup, "removed");
    assert.equal(report.nativeValidation?.status, "completed");
    assert.equal(report.nativeValidation?.conclusion, "failure");
    assert.match(report.nativeValidation?.errorSummary ?? "", /Expected conclusion success, got failure/);
    assert.match(report.blockers.join("\n"), /Native validation/);
    assert.match(telegramRequests[0]?.init.body ?? "", /needs follow-up/);
    assert.match(telegramRequests[0]?.init.body ?? "", /actions\/runs\/9201/);
    assert.match(telegramRequests[0]?.init.body ?? "", /Owner decision steps/);
    assert.match(telegramRequests[0]?.init.body ?? "", /Open this GitHub issue\/comment: https:\/\/github\.com\/scwlkr\/pinmark\/issues\/3#issuecomment-native-failure/);
    assert.match(telegramRequests[0]?.init.body ?? "", /VAMPYRE_APPROVED: accepted/);
    assert.match(telegramRequests[0]?.init.body ?? "", /VAMPYRE_DENIED/);

    const blockerRows = spawnSync(
      "sqlite3",
      [
        join(workspaceRoot, "data", "vampyre.sqlite"),
        "select summary || '|' || status from project_blockers where summary='Native validation failure';",
      ],
      { encoding: "utf8" },
    );
    assert.equal(blockerRows.status, 0);
    assert.equal(blockerRows.stdout.trim(), "Native validation failure|open");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent blocks on timed-out native validation after direct-main output", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-native-timeout-"));
  const repoPath = join(workspaceRoot, "repos", "screenshot-tool");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await writeProjectRegistry(workspaceRoot, [
      pinmarkProject({ nativeValidation: nativeValidationConfig({ timeoutSeconds: 1 }) }),
    ]);

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "screenshot-tool",
      now: () => new Date("2026-05-29T12:00:00.000Z"),
      env: secretEnv(),
      task: "Add the next Pinmark product-loop feature.",
      workerCommand: "printf 'worker changed pinmark\\n'",
      commandRunner: fakeDirectMainCommandRunner(repoPath),
      nativeValidationPollIntervalMs: 2000,
      nativeValidationSleep: async () => {},
      githubFetch: fakeFetch([], [
        jsonResponse(200, workflowRun(9301, "queued", undefined, "main")),
        jsonResponse(200, workflowRun(9301, "queued", undefined, "main")),
        jsonResponse(200, workflowRun(9301, "queued", undefined, "main")),
        jsonResponse(200, { jobs: [] }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 3,
            title: "Vampyre review: Pinmark",
            html_url: "https://github.com/scwlkr/pinmark/issues/3",
          },
        ]),
        jsonResponse(201, {
          number: 3,
          html_url: "https://github.com/scwlkr/pinmark/issues/3#issuecomment-native-timeout",
        }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 211 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, false);
    assert.equal(report.runJournal?.status, "blocked");
    assert.equal(report.nativeValidation?.status, "timed_out");
    assert.match(report.blockers.join("\n"), /workflow did not complete/i);

    const blockerRows = spawnSync(
      "sqlite3",
      [
        join(workspaceRoot, "data", "vampyre.sqlite"),
        "select summary || '|' || status from project_blockers where summary='Native validation timeout';",
      ],
      { encoding: "utf8" },
    );
    assert.equal(blockerRows.status, 0);
    assert.equal(blockerRows.stdout.trim(), "Native validation timeout|open");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent derives approved product-loop tasks from docs status next action", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-status-task-"));
  const repoPath = join(workspaceRoot, "repos", "screenshot-tool");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
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
            rawIdea: "A real macOS screenshot tool with quick markup features similar in spirit to ShareX.",
            cadence: "builder-loop-after-owner-approval",
            autonomyPolicy: "continuous-product-loop-direct-main",
            paused: false,
            validationCommands: ["git diff --check"],
            autoSafeTasks: ["Stale registry task."],
          },
        ],
      }),
    );

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "screenshot-tool",
      now: () => new Date("2026-05-29T13:00:00.000Z"),
      env: secretEnv(),
      workerCommand: "printf 'worker used status task\\n'",
      commandRunner: fakeStatusTaskCommandRunner(workspaceRoot, repoPath),
      githubFetch: fakeFetch([], [
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 3,
            title: "Vampyre review: Pinmark",
            html_url: "https://github.com/scwlkr/pinmark/issues/3",
          },
        ]),
        jsonResponse(201, {
          number: 3,
          html_url: "https://github.com/scwlkr/pinmark/issues/3#issuecomment-status-task",
        }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 207 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.match(report.taskContext?.task ?? "", /Add crop handles/);
    assert.doesNotMatch(report.taskContext?.task ?? "", /Stale registry task/);

    const taskContextPath = report.taskContext?.path;
    assert.ok(taskContextPath);
    const taskContext = await readFile(taskContextPath, "utf8");
    assert.match(taskContext, /Add crop handles/);
    assert.match(taskContext, /push directly to main/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent routes legacy Builder docs to initial-docs migration before product status tasks", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-docs-migration-task-"));
  const repoPath = join(workspaceRoot, "repos", "screenshot-tool");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await writeProjectRegistry(workspaceRoot, [
      {
        ...pinmarkProject(),
        autoSafeTasks: ["Stale registry task."],
      },
    ]);

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "screenshot-tool",
      now: () => new Date("2026-05-29T13:30:00.000Z"),
      env: secretEnv(),
      workerCommand: "printf 'worker migrated docs\\n'",
      commandRunner: fakeLegacyBuilderDocsCommandRunner(workspaceRoot, repoPath),
      githubFetch: fakeFetch([], [
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 3,
            title: "Vampyre review: Pinmark",
            html_url: "https://github.com/scwlkr/pinmark/issues/3",
          },
        ]),
        jsonResponse(201, {
          number: 3,
          html_url: "https://github.com/scwlkr/pinmark/issues/3#issuecomment-docs-migration",
        }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 208 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.match(report.taskContext?.task ?? "", /Migrate this Builder repo/);
    assert.match(report.taskContext?.task ?? "", /shared initial modular docs structure/);
    assert.match(report.taskContext?.task ?? "", /Legacy docs to preserve or relocate: CONTEXT\.md, docs\/STATUS\.md, docs\/ROADMAP\.md, docs\/adr/);
    assert.doesNotMatch(report.taskContext?.task ?? "", /Add old product action/);
    assert.doesNotMatch(report.taskContext?.task ?? "", /Stale registry task/);
    assert.equal(report.branchOutput?.status, "pushed-main");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent prioritizes recoverable blocker repair tasks over product next action", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-recovery-task-"));
  const repoPath = join(workspaceRoot, "repos", "screenshot-tool");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });
    await writeProjectRegistry(workspaceRoot, [pinmarkProject({ nativeValidation: nativeValidationConfig() })]);

    let seededBlocker = false;
    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "screenshot-tool",
      now: () => new Date("2026-05-29T14:00:00.000Z"),
      env: secretEnv(),
      commandRunner: fakeRecoveryTaskCommandRunner(repoPath),
      initializeState: async (options) => {
        const state = await initializeOperationalState(options);
        if (!seededBlocker) {
          seededBlocker = true;
          await recordProjectBlocker(state.databasePath, {
            id: "native-validation:screenshot-tool:9201:failure",
            projectId: "screenshot-tool",
            summary: "Native validation failure",
            details: "Expected conclusion success, got failure; jobs SwiftPM:failure",
            now: "2026-05-29T13:59:00.000Z",
          });
          await recordExternalValidationRun(state.databasePath, {
            id: "native-validation:screenshot-tool:9201",
            projectId: "screenshot-tool",
            provider: "github-actions",
            repo: "scwlkr/pinmark",
            workflowId: "macos-validation.yml",
            ref: "main",
            providerRunId: "9201",
            providerUrl: "https://github.com/scwlkr/pinmark/actions/runs/9201",
            status: "completed",
            conclusion: "failure",
            requestedAt: "2026-05-29T13:58:00.000Z",
            checkedAt: "2026-05-29T13:59:00.000Z",
            errorSummary: "Expected conclusion success, got failure; jobs SwiftPM:failure",
          });
        }
        return initializeOperationalState(options);
      },
      githubFetch: fakeFetch([], [
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, { name: "vampyre:review", url: "https://api.github.com/labels/vampyre" }),
        jsonResponse(200, [
          {
            number: 3,
            title: "Vampyre review: Pinmark",
            html_url: "https://github.com/scwlkr/pinmark/issues/3",
          },
        ]),
        jsonResponse(201, {
          number: 3,
          html_url: "https://github.com/scwlkr/pinmark/issues/3#issuecomment-recovery-task",
        }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 208 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, true);
    assert.match(report.taskContext?.task ?? "", /Repair the recoverable blocker/);
    assert.match(report.taskContext?.task ?? "", /Native validation failure/);
    assert.match(report.taskContext?.task ?? "", /actions\/runs\/9201/);
    assert.match(report.taskContext?.task ?? "", /Expected conclusion success/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("build agent classifies worker context exhaustion and preserves the worktree", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-build-agent-context-"));
  const repoPath = join(workspaceRoot, "repos", "palette-wow");

  try {
    await mkdir(join(repoPath, ".git"), { recursive: true });

    const report = await runBuildAgent({
      host: "local",
      workspaceRoot,
      local: true,
      projectId: "palette-wow",
      now: () => new Date("2026-05-28T23:00:00.000Z"),
      env: secretEnv(),
      task: "Attempt a small safe docs edit.",
      workerCommand: "codex exec",
      commandRunner: fakeContextExhaustionCommandRunner(repoPath),
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
          html_url: "https://github.com/scwlkr/paletteWOW/issues/16#issuecomment-context",
        }),
      ]),
      telegramFetch: fakeFetch([], [jsonResponse(200, { ok: true, result: { message_id: 205 } })]) as TelegramFetch,
    });

    assert.equal(report.ready, false);
    assert.equal(report.worker?.status, "context-exhausted");
    assert.equal(report.runJournal?.status, "blocked");
    assert.equal(report.worktree?.cleanup, "preserved");
    assert.match(report.blockers.join("\n"), /context-exhaustion/);

    const blockers = spawnSync(
      "sqlite3",
      [
        join(workspaceRoot, "data", "vampyre.sqlite"),
        "select summary from project_blockers where id='run-20260528T230000Z-palette-wow:context-exhaustion';",
      ],
      { encoding: "utf8" },
    );
    assert.equal(blockers.status, 0);
    assert.match(blockers.stdout, /Build Agent context-exhaustion/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
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
      projectId: "palette-wow",
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

function fakeWorkerChangeCommandRunner(repoPath: string): BuildAgentCommandRunner {
  return async (spec: BuildAgentCommandSpec) => {
    const args = spec.args.join(" ");
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree add -b vampyre/build-agent/palette-wow/20260528T220000Z")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails test")) {
      return ok("3 runs, 0 failures");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails zeitwerk:check")) {
      return ok("All is good!");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails assets:precompile")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("printf 'worker changed docs")) {
      assert.match(spec.cwd ?? "", /worktrees\/palette-wow-20260528T220000Z$/);
      assert.match(spec.env?.["VAMPYRE_TASK_CONTEXT_PATH"] ?? "", /task-context\.md$/);
      assert.equal(spec.env?.["GITHUB_TOKEN"], undefined);
      assert.equal(spec.env?.["TELEGRAM_BOT_TOKEN"], undefined);
      return ok("worker changed docs");
    }
    if (spec.command === "git" && args.includes("status --porcelain")) {
      return ok("M docs/STATUS.md\n?? docs/new-note.md");
    }
    if (spec.command === "git" && args.includes("add -A")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("diff --cached --quiet")) {
      return { exitCode: 1, stdout: "", stderr: "" };
    }
    if (spec.command === "git" && args.includes("commit -m")) {
      return ok("[vampyre/build-agent/palette-wow/20260528T220000Z abc1234] Vampyre work");
    }
    if (spec.command === "git" && args.includes("rev-parse --short HEAD")) {
      return ok("abc1234");
    }
    if (spec.command === "git" && args.includes("push -u origin vampyre/build-agent/palette-wow/20260528T220000Z")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree remove --force")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("branch -D vampyre/build-agent/palette-wow/20260528T220000Z")) {
      return ok("");
    }

    throw new Error(`unexpected command: ${spec.command} ${args}`);
  };
}

function fakeDirectMainCommandRunner(repoPath: string): BuildAgentCommandRunner {
  return async (spec: BuildAgentCommandSpec) => {
    const args = spec.args.join(" ");
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree add -b vampyre/build-agent/screenshot-tool/20260529T120000Z")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("git diff --check")) {
      assert.match(spec.cwd ?? "", /worktrees\/screenshot-tool-20260529T120000Z$/);
      return ok("");
    }
    if (spec.command === "sh" && args.includes("printf 'worker changed pinmark")) {
      assert.match(spec.cwd ?? "", /worktrees\/screenshot-tool-20260529T120000Z$/);
      return ok("worker changed pinmark");
    }
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("status --porcelain")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("status --porcelain")) {
      return ok("M Sources/PinmarkApp/CaptureEditorView.swift\nM docs/STATUS.md");
    }
    if (spec.command === "git" && args.includes("add -A")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("diff --cached --quiet")) {
      return { exitCode: 1, stdout: "", stderr: "" };
    }
    if (spec.command === "git" && args.includes("commit -m")) {
      return ok("[vampyre/build-agent/screenshot-tool/20260529T120000Z def5678] Vampyre work");
    }
    if (spec.command === "git" && args.includes("rev-parse --short HEAD")) {
      return ok("def5678");
    }
    if (spec.command === "git" && args.includes("push origin HEAD:main")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("checkout main")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("merge --ff-only origin/main")) {
      return ok("Updating def5678..def5678");
    }
    if (spec.command === "git" && args.includes("push -u origin")) {
      throw new Error("direct-main output should not push a review branch");
    }
    if (spec.command === "git" && args.includes("worktree remove --force")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("branch -D vampyre/build-agent/screenshot-tool/20260529T120000Z")) {
      return ok("");
    }

    throw new Error(`unexpected command: ${spec.command} ${args}`);
  };
}

function fakeStatusTaskCommandRunner(workspaceRoot: string, repoPath: string): BuildAgentCommandRunner {
  return async (spec: BuildAgentCommandSpec) => {
    const args = spec.args.join(" ");
    const worktreePath = join(workspaceRoot, "worktrees", "screenshot-tool-20260529T130000Z");

    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree add -b vampyre/build-agent/screenshot-tool/20260529T130000Z")) {
      await writeInitialBuilderDocsShape(
        worktreePath,
        "# Pinmark Status\n\n## Next action\n\nAdd crop handles while preserving copy/save behavior.\n\n## Blockers\n\nNone.\n",
      );
      return ok("");
    }
    if (spec.command === "sh" && args.includes("git diff --check")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("printf 'worker used status task")) {
      assert.match(await readFile(spec.env?.["VAMPYRE_TASK_CONTEXT_PATH"] ?? "", "utf8"), /Add crop handles/);
      return ok("worker used status task");
    }
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("status --porcelain")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("status --porcelain")) {
      return ok("M docs/status.md");
    }
    if (spec.command === "git" && args.includes("add -A")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("diff --cached --quiet")) {
      return { exitCode: 1, stdout: "", stderr: "" };
    }
    if (spec.command === "git" && args.includes("commit -m")) {
      return ok("[vampyre/build-agent/screenshot-tool/20260529T130000Z f00ba47] Vampyre work");
    }
    if (spec.command === "git" && args.includes("rev-parse --short HEAD")) {
      return ok("f00ba47");
    }
    if (spec.command === "git" && args.includes("push origin HEAD:main")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("checkout main")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("merge --ff-only origin/main")) {
      return ok("Updating f00ba47..f00ba47");
    }
    if (spec.command === "git" && args.includes("worktree remove --force")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("branch -D vampyre/build-agent/screenshot-tool/20260529T130000Z")) {
      return ok("");
    }

    throw new Error(`unexpected command: ${spec.command} ${args}`);
  };
}

async function writeInitialBuilderDocsShape(worktreePath: string, statusMarkdown: string): Promise<void> {
  await mkdir(join(worktreePath, "docs", "concepts"), { recursive: true });
  await mkdir(join(worktreePath, "docs", "guides"), { recursive: true });
  await mkdir(join(worktreePath, "docs", "reference"), { recursive: true });
  await mkdir(join(worktreePath, "docs", "architecture"), { recursive: true });
  await mkdir(join(worktreePath, "docs", "decisions"), { recursive: true });
  await mkdir(join(worktreePath, "docs", "todo"), { recursive: true });
  await writeFile(join(worktreePath, "AGENTS.md"), "# Pinmark Agent Instructions\n");
  await writeFile(join(worktreePath, "README.md"), "# Pinmark\n");
  await writeFile(join(worktreePath, "CHANGELOG.md"), "# Changelog\n");
  await writeFile(join(worktreePath, "docs", "index.md"), "# Pinmark Docs\n");
  await writeFile(join(worktreePath, "docs", "map.md"), "# Docs Map\n");
  await writeFile(join(worktreePath, "docs", "status.md"), statusMarkdown);
  await writeFile(join(worktreePath, "docs", "concepts", "index.md"), "# Concepts\n");
  await writeFile(join(worktreePath, "docs", "concepts", "project.md"), "# Project\n");
  await writeFile(join(worktreePath, "docs", "concepts", "core-workflow.md"), "# Core Workflow\n");
  await writeFile(join(worktreePath, "docs", "guides", "index.md"), "# Guides\n");
  await writeFile(join(worktreePath, "docs", "guides", "installation.md"), "# Installation\n");
  await writeFile(join(worktreePath, "docs", "guides", "first-run.md"), "# First Run\n");
  await writeFile(join(worktreePath, "docs", "guides", "troubleshooting.md"), "# Troubleshooting\n");
  await writeFile(join(worktreePath, "docs", "reference", "index.md"), "# Reference\n");
  await writeFile(join(worktreePath, "docs", "reference", "cli.md"), "# CLI\n");
  await writeFile(join(worktreePath, "docs", "reference", "config.md"), "# Config\n");
  await writeFile(join(worktreePath, "docs", "reference", "env.md"), "# Env\n");
  await writeFile(join(worktreePath, "docs", "architecture", "index.md"), "# Architecture\n");
  await writeFile(join(worktreePath, "docs", "architecture", "overview.md"), "# Overview\n");
  await writeFile(join(worktreePath, "docs", "architecture", "file-layout.md"), "# File Layout\n");
  await writeFile(join(worktreePath, "docs", "architecture", "data-flow.md"), "# Data Flow\n");
  await writeFile(join(worktreePath, "docs", "decisions", "index.md"), "# Decisions\n");
  await writeFile(join(worktreePath, "docs", "todo", "index.md"), "# Todo\n");
  await writeFile(join(worktreePath, "docs", "todo", "docs-todo.md"), "# Docs Todo\n");
  await writeFile(join(worktreePath, "docs", "todo", "missing-features.md"), "# Missing Features\n");
  await writeFile(join(worktreePath, "docs", "todo", "needs-verification.md"), "# Needs Verification\n");
}

function fakeLegacyBuilderDocsCommandRunner(workspaceRoot: string, repoPath: string): BuildAgentCommandRunner {
  return async (spec: BuildAgentCommandSpec) => {
    const args = spec.args.join(" ");
    const worktreePath = join(workspaceRoot, "worktrees", "screenshot-tool-20260529T133000Z");

    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree add -b vampyre/build-agent/screenshot-tool/20260529T133000Z")) {
      await mkdir(join(worktreePath, "docs", "adr"), { recursive: true });
      await writeFile(join(worktreePath, "README.md"), "# Pinmark\n");
      await writeFile(join(worktreePath, "CONTEXT.md"), "# Pinmark Context\n");
      await writeFile(
        join(worktreePath, "docs", "STATUS.md"),
        "# Pinmark Status\n\n## Next action\n\nAdd old product action.\n",
      );
      await writeFile(join(worktreePath, "docs", "ROADMAP.md"), "# Pinmark Roadmap\n");
      await writeFile(join(worktreePath, "docs", "adr", "0001-project-shape.md"), "# Project shape\n");
      return ok("");
    }
    if (spec.command === "sh" && args.includes("git diff --check")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("printf 'worker migrated docs")) {
      assert.match(await readFile(spec.env?.["VAMPYRE_TASK_CONTEXT_PATH"] ?? "", "utf8"), /Migrate this Builder repo/);
      return ok("worker migrated docs");
    }
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("status --porcelain")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("status --porcelain")) {
      return ok("R  docs/STATUS.md -> docs/status.md\nA  docs/map.md\nD  CONTEXT.md");
    }
    if (spec.command === "git" && args.includes("add -A")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("diff --cached --quiet")) {
      return { exitCode: 1, stdout: "", stderr: "" };
    }
    if (spec.command === "git" && args.includes("commit -m")) {
      return ok("[vampyre/build-agent/screenshot-tool/20260529T133000Z d0c5abc] Vampyre work");
    }
    if (spec.command === "git" && args.includes("rev-parse --short HEAD")) {
      return ok("d0c5abc");
    }
    if (spec.command === "git" && args.includes("push origin HEAD:main")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("checkout main")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("merge --ff-only origin/main")) {
      return ok("Updating d0c5abc..d0c5abc");
    }
    if (spec.command === "git" && args.includes("worktree remove --force")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("branch -D vampyre/build-agent/screenshot-tool/20260529T133000Z")) {
      return ok("");
    }

    throw new Error(`unexpected command: ${spec.command} ${args}`);
  };
}

function fakeRecoveryTaskCommandRunner(repoPath: string): BuildAgentCommandRunner {
  return async (spec: BuildAgentCommandSpec) => {
    const args = spec.args.join(" ");
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree add -b vampyre/build-agent/screenshot-tool/20260529T140000Z")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("git diff --check")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree remove --force")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("branch -D vampyre/build-agent/screenshot-tool/20260529T140000Z")) {
      return ok("");
    }

    throw new Error(`unexpected command: ${spec.command} ${args}`);
  };
}

function fakeContextExhaustionCommandRunner(repoPath: string): BuildAgentCommandRunner {
  return async (spec: BuildAgentCommandSpec) => {
    const args = spec.args.join(" ");
    if (spec.command === "git" && args.includes("-C") && args.includes(repoPath) && args.includes("fetch --prune origin")) {
      return ok("");
    }
    if (spec.command === "git" && args.includes("worktree add -b vampyre/build-agent/palette-wow/20260528T230000Z")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails test")) {
      return ok("3 runs, 0 failures");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails zeitwerk:check")) {
      return ok("All is good!");
    }
    if (spec.command === "sh" && args.includes("bundle exec rails assets:precompile")) {
      return ok("");
    }
    if (spec.command === "sh" && args.includes("codex exec")) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "maximum context length exceeded",
      };
    }
    if (spec.command === "git" && args.includes("worktree remove --force")) {
      throw new Error("context-exhausted worktree should be preserved");
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

async function writeProjectRegistry(workspaceRoot: string, projects: Record<string, unknown>[]): Promise<void> {
  await mkdir(join(workspaceRoot, "config"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "config", "project-registry.json"),
    `${JSON.stringify({
      version: 1,
      projects,
    })}\n`,
  );
}

function pinmarkProject(options?: {
  nativeValidation?: Record<string, unknown> | undefined;
  visualProof?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  const project: Record<string, unknown> = {
    id: "screenshot-tool",
    displayName: "Pinmark",
    mode: "builder",
    githubRepo: "scwlkr/pinmark",
    rawIdea: "A real macOS screenshot tool with quick markup features similar in spirit to ShareX.",
    cadence: "builder-loop-after-owner-approval",
    autonomyPolicy: "continuous-product-loop-direct-main",
    paused: false,
    validationCommands: ["git diff --check"],
  };
  if (options?.nativeValidation) {
    project["nativeValidation"] = options.nativeValidation;
  }
  if (options?.visualProof) {
    project["visualProof"] = options.visualProof;
  }
  return project;
}

function nativeValidationConfig(options?: { timeoutSeconds?: number | undefined }): Record<string, unknown> {
  return {
    provider: "github-actions",
    workflowId: "macos-validation.yml",
    runnerLabel: "macos-15",
    requiredConclusion: "success",
    timeoutSeconds: options?.timeoutSeconds ?? 1800,
  };
}

function visualProofConfig(): Record<string, unknown> {
  return {
    provider: "github-actions-artifact",
    required: true,
    artifactName: "pinmark-visual-proof",
    imageFilePattern: "pinmark-product.png",
  };
}

function workflowRun(
  id: number,
  status: string,
  conclusion: string | undefined,
  branch: string,
  repo = "scwlkr/pinmark",
): Record<string, unknown> {
  const run: Record<string, unknown> = {
    id,
    status,
    html_url: `https://github.com/${repo}/actions/runs/${id}`,
    head_branch: branch,
    event: "workflow_dispatch",
    created_at: "2026-05-29T12:00:00.000Z",
  };
  if (conclusion) {
    run["conclusion"] = conclusion;
  }
  return run;
}

function workflowJob(
  id: number,
  name: string,
  status: string,
  conclusion: string,
  repo = "scwlkr/pinmark",
): Record<string, unknown> {
  return {
    id,
    name,
    status,
    conclusion,
    html_url: `https://github.com/${repo}/actions/runs/${id}/job/${id}`,
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
  arrayBuffer?(): Promise<ArrayBuffer>;
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

function bytesResponse(status: number, body: Buffer): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    async text() {
      return body.toString("utf8");
    },
    async arrayBuffer() {
      return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    },
  };
}

function zipStoredFile(fileName: string, content: Buffer): Buffer {
  const name = Buffer.from(fileName);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + name.length + content.length;
  const centralSize = central.length + name.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, name, content, central, name, end]);
}

function ok(stdout: string): RemoteCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}
