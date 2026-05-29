#!/usr/bin/env node
import {
  buildAgentRunReportToJson,
  formatBuildAgentRunReport,
  runBuildAgent,
} from "./agent/buildAgent.js";
import {
  builderRepoCreateReportToJson,
  formatBuilderRepoCreateReport,
  runBuilderRepoCreate,
  type BuilderRepoTemplate,
} from "./builder/repoCreation.js";
import { runDaemonCommand, type DaemonAction } from "./daemon/manageDaemon.js";
import { runForegroundDaemon } from "./daemon/runDaemon.js";
import { runHostDoctor } from "./doctor/hostDoctor.js";
import {
  approvalCheckReportToJson,
  formatApprovalCheckReport,
  isApprovalKind,
  runApprovalCheck,
  type ApprovalKind,
} from "./github/approvalLookup.js";
import { runGitHubCheck } from "./github/githubCheck.js";
import {
  formatPullRequestUpsertReport,
  pullRequestUpsertReportToJson,
  runPullRequestUpsert,
} from "./github/prWorkflow.js";
import {
  formatReviewRequestReport,
  reviewRequestReportToJson,
  runReviewRequest,
} from "./github/reviewWorkflow.js";
import { runHostSetup } from "./host/setupHost.js";
import { runTelegramPing } from "./ping/telegram.js";
import { formatStatusReport, runVampyreStatus, statusReportToJson } from "./status/vampyreStatus.js";
import {
  formatWatcherDiscoveryReport,
  runWatcherDiscovery,
  watcherDiscoveryReportToJson,
} from "./watcher/discovery.js";

const DEFAULT_HOST = "wlkrlab";
const DEFAULT_WORKSPACE_ROOT = "~/vampyre";

type ParsedArgs =
  | {
      command: "doctor";
      host: string;
      workspaceRoot: string;
    }
  | {
      command: "host-setup";
      host: string;
      workspaceRoot: string;
    }
  | {
      command: "daemon-run";
      workspaceRoot: string;
    }
  | {
      command: "daemon-command";
      action: Exclude<DaemonAction, "install"> | "install";
      host: string;
      workspaceRoot: string;
    }
  | {
      command: "telegram-ping";
      host: string;
      workspaceRoot: string;
      message?: string | undefined;
    }
  | {
      command: "github-check";
      host: string;
      workspaceRoot: string;
      repo?: string | undefined;
    }
  | {
      command: "approval-check";
      host: string;
      workspaceRoot: string;
      repo: string;
      projectId: string;
      kind: ApprovalKind;
      key: string;
      local: boolean;
      json: boolean;
    }
  | {
      command: "pr-upsert";
      host: string;
      workspaceRoot: string;
      repo: string;
      head: string;
      base: string;
      title: string;
      body?: string | undefined;
      draft: boolean;
      local: boolean;
      json: boolean;
    }
  | {
      command: "review-request";
      host: string;
      workspaceRoot: string;
      local: boolean;
      json: boolean;
    }
  | {
      command: "builder-repo-create";
      host: string;
      workspaceRoot: string;
      controlRepo: string;
      projectId: string;
      approvalKind: ApprovalKind;
      approvalKey: string;
      repo: string;
      description: string;
      template: BuilderRepoTemplate;
      topics?: string[] | undefined;
      local: boolean;
      json: boolean;
    }
  | {
      command: "watcher-discover";
      host: string;
      workspaceRoot: string;
      projectId: string;
      local: boolean;
      json: boolean;
    }
  | {
      command: "agent-run";
      host: string;
      workspaceRoot: string;
      projectId?: string | undefined;
      workerCommand?: string | undefined;
      task?: string | undefined;
      local: boolean;
      json: boolean;
    }
  | {
      command: "status";
      host: string;
      workspaceRoot: string;
      local: boolean;
      json: boolean;
    }
  | {
      command: "help";
    };

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseArgs(argv);

    if (parsed.command === "help") {
      printHelp();
      return 0;
    }

    if (parsed.command === "doctor") {
      const report = await runHostDoctor({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
      });
      printDoctorReport(report);
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "daemon-run") {
      await runForegroundDaemon({ workspaceRoot: parsed.workspaceRoot });
      return 0;
    }

    if (parsed.command === "daemon-command") {
      const report = await runDaemonCommand({
        action: parsed.action,
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
      });
      printDaemonReport(report);
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "telegram-ping") {
      const report = await runTelegramPing({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
        message: parsed.message,
      });
      printTelegramPingReport(report);
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "github-check") {
      const report = await runGitHubCheck({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
        repo: parsed.repo,
      });
      printGitHubCheckReport(report);
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "approval-check") {
      const report = await runApprovalCheck({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
        repo: parsed.repo,
        projectId: parsed.projectId,
        kind: parsed.kind,
        key: parsed.key,
        local: parsed.local,
      });
      if (parsed.json) {
        console.log(approvalCheckReportToJson(report));
      } else {
        console.log(formatApprovalCheckReport(report));
      }
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "pr-upsert") {
      const report = await runPullRequestUpsert({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
        repo: parsed.repo,
        head: parsed.head,
        base: parsed.base,
        title: parsed.title,
        body: parsed.body,
        draft: parsed.draft,
        local: parsed.local,
      });
      if (parsed.json) {
        console.log(pullRequestUpsertReportToJson(report));
      } else {
        console.log(formatPullRequestUpsertReport(report));
      }
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "review-request") {
      const report = await runReviewRequest({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
        local: parsed.local,
      });
      if (parsed.json) {
        console.log(reviewRequestReportToJson(report));
      } else {
        console.log(formatReviewRequestReport(report));
      }
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "builder-repo-create") {
      const report = await runBuilderRepoCreate({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
        controlRepo: parsed.controlRepo,
        projectId: parsed.projectId,
        approvalKind: parsed.approvalKind,
        approvalKey: parsed.approvalKey,
        repo: parsed.repo,
        description: parsed.description,
        template: parsed.template,
        topics: parsed.topics,
        local: parsed.local,
      });
      if (parsed.json) {
        console.log(builderRepoCreateReportToJson(report));
      } else {
        console.log(formatBuilderRepoCreateReport(report));
      }
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "watcher-discover") {
      const report = await runWatcherDiscovery({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
        projectId: parsed.projectId,
        local: parsed.local,
      });
      if (parsed.json) {
        console.log(watcherDiscoveryReportToJson(report));
      } else {
        console.log(formatWatcherDiscoveryReport(report));
      }
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "agent-run") {
      const report = await runBuildAgent({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
        projectId: parsed.projectId,
        workerCommand: parsed.workerCommand,
        task: parsed.task,
        local: parsed.local,
      });
      if (parsed.json) {
        console.log(buildAgentRunReportToJson(report));
      } else {
        console.log(formatBuildAgentRunReport(report));
      }
      return report.ready ? 0 : 1;
    }

    if (parsed.command === "status") {
      const report = await runVampyreStatus({
        host: parsed.host,
        workspaceRoot: parsed.workspaceRoot,
        local: parsed.local,
      });
      if (parsed.json) {
        console.log(statusReportToJson(report));
      } else {
        console.log(formatStatusReport(report));
      }
      return report.ready ? 0 : 1;
    }

    const report = await runHostSetup({
      host: parsed.host,
      workspaceRoot: parsed.workspaceRoot,
    });
    printSetupReport(report);
    return report.ready ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`vampyre: ${message}`);
    return 1;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { command: "help" };
  }

  const [command, subcommand, ...restAfterSubcommand] = argv;

  if (command === "host" && subcommand === "setup") {
    return parseHostSetupArgs(restAfterSubcommand);
  }

  if (command === "daemon") {
    return parseDaemonArgs(subcommand, restAfterSubcommand);
  }

  if (command === "ping" && subcommand === "telegram") {
    return parseTelegramPingArgs(restAfterSubcommand);
  }

  if (command === "-ping" && subcommand === "telegram") {
    return parseTelegramPingArgs(restAfterSubcommand);
  }

  if (command === "github" && subcommand === "check") {
    return parseGitHubCheckArgs(restAfterSubcommand);
  }

  if (command === "approval" && subcommand === "check") {
    return parseApprovalCheckArgs(restAfterSubcommand);
  }

  if (command === "pr" && subcommand === "upsert") {
    return parsePullRequestUpsertArgs(restAfterSubcommand);
  }

  if (command === "review" && subcommand === "request") {
    return parseReviewRequestArgs(restAfterSubcommand);
  }

  if (command === "builder" && subcommand === "repo" && restAfterSubcommand[0] === "create") {
    return parseBuilderRepoCreateArgs(restAfterSubcommand.slice(1));
  }

  if (command === "watcher" && subcommand === "discover") {
    return parseWatcherDiscoveryArgs(restAfterSubcommand);
  }

  if (command === "agent" && subcommand === "run") {
    return parseAgentRunArgs(restAfterSubcommand);
  }

  if (command === "status") {
    const rest = [subcommand, ...restAfterSubcommand].filter((arg): arg is string => Boolean(arg));
    return parseStatusArgs(rest);
  }

  if (command !== "doctor") {
    throw new Error(`unknown command: ${command ?? ""}`);
  }

  const rest = [subcommand, ...restAfterSubcommand].filter((arg): arg is string => Boolean(arg));
  return parseDoctorArgs(rest);
}

function parseDoctorArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    throw new Error(`unknown doctor option: ${arg ?? ""}`);
  }

  return { command: "doctor", host, workspaceRoot };
}

function parseHostSetupArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    throw new Error(`unknown host setup option: ${arg ?? ""}`);
  }

  return { command: "host-setup", host, workspaceRoot };
}

function parseDaemonArgs(subcommand: string | undefined, rest: string[]): ParsedArgs {
  if (!subcommand) {
    throw new Error("daemon requires a subcommand");
  }

  if (subcommand === "run") {
    const { workspaceRoot } = parseHostOptions(rest, "daemon run");
    return { command: "daemon-run", workspaceRoot };
  }

  if (isDaemonAction(subcommand)) {
    const { host, workspaceRoot } = parseHostOptions(rest, `daemon ${subcommand}`);
    return {
      command: "daemon-command",
      action: subcommand,
      host,
      workspaceRoot,
    };
  }

  throw new Error(`unknown daemon subcommand: ${subcommand}`);
}

function parseHostOptions(rest: string[], commandName: string): { host: string; workspaceRoot: string } {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    throw new Error(`unknown ${commandName} option: ${arg ?? ""}`);
  }

  return { host, workspaceRoot };
}

function parseTelegramPingArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  let message: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    if (arg === "--message") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--message requires a value");
      }
      message = value;
      index += 1;
      continue;
    }

    throw new Error(`unknown ping telegram option: ${arg ?? ""}`);
  }

  return { command: "telegram-ping", host, workspaceRoot, message };
}

function parseGitHubCheckArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  let repo: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    if (arg === "--repo") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--repo requires a value");
      }
      repo = value;
      index += 1;
      continue;
    }

    throw new Error(`unknown github check option: ${arg ?? ""}`);
  }

  return { command: "github-check", host, workspaceRoot, repo };
}

function parseApprovalCheckArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  let repo: string | undefined;
  let projectId: string | undefined;
  let kind: ApprovalKind | undefined;
  let key: string | undefined;
  let local = false;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    if (arg === "--repo") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--repo requires a value");
      }
      repo = value;
      index += 1;
      continue;
    }

    if (arg === "--project") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--project requires a value");
      }
      projectId = value;
      index += 1;
      continue;
    }

    if (arg === "--kind") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--kind requires a value");
      }
      if (!isApprovalKind(value)) {
        throw new Error("--kind must be builder-vision, builder-repo-plan, or major-feature");
      }
      kind = value;
      index += 1;
      continue;
    }

    if (arg === "--key") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--key requires a value");
      }
      key = value;
      index += 1;
      continue;
    }

    if (arg === "--local") {
      local = true;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`unknown approval check option: ${arg ?? ""}`);
  }

  if (!repo) {
    throw new Error("--repo is required");
  }
  if (!projectId) {
    throw new Error("--project is required");
  }
  if (!kind) {
    throw new Error("--kind is required");
  }
  if (!key) {
    throw new Error("--key is required");
  }

  return { command: "approval-check", host, workspaceRoot, repo, projectId, kind, key, local, json };
}

function parsePullRequestUpsertArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  let repo: string | undefined;
  let head: string | undefined;
  let base: string | undefined;
  let title: string | undefined;
  let body: string | undefined;
  let draft = false;
  let local = false;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    if (arg === "--repo") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--repo requires a value");
      }
      repo = value;
      index += 1;
      continue;
    }

    if (arg === "--head") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--head requires a value");
      }
      head = value;
      index += 1;
      continue;
    }

    if (arg === "--base") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--base requires a value");
      }
      base = value;
      index += 1;
      continue;
    }

    if (arg === "--title") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--title requires a value");
      }
      title = value;
      index += 1;
      continue;
    }

    if (arg === "--body") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--body requires a value");
      }
      body = value;
      index += 1;
      continue;
    }

    if (arg === "--draft") {
      draft = true;
      continue;
    }

    if (arg === "--local") {
      local = true;
      host = "local";
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`unknown pr upsert option: ${arg ?? ""}`);
  }

  if (!repo) {
    throw new Error("--repo is required");
  }
  if (!head) {
    throw new Error("--head is required");
  }
  if (!base) {
    throw new Error("--base is required");
  }
  if (!title) {
    throw new Error("--title is required");
  }

  return { command: "pr-upsert", host, workspaceRoot, repo, head, base, title, body, draft, local, json };
}

function parseReviewRequestArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  let local = false;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    if (arg === "--local") {
      local = true;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`unknown review request option: ${arg ?? ""}`);
  }

  return { command: "review-request", host, workspaceRoot, local, json };
}

function parseBuilderRepoCreateArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  let controlRepo: string | undefined;
  let projectId: string | undefined;
  let approvalKind: ApprovalKind | undefined;
  let approvalKey: string | undefined;
  let repo: string | undefined;
  let description: string | undefined;
  let template: BuilderRepoTemplate | undefined;
  let topics: string[] | undefined;
  let local = false;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    if (arg === "--control-repo") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--control-repo requires a value");
      }
      controlRepo = value;
      index += 1;
      continue;
    }

    if (arg === "--project") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--project requires a value");
      }
      projectId = value;
      index += 1;
      continue;
    }

    if (arg === "--approval-kind") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--approval-kind requires a value");
      }
      if (!isApprovalKind(value)) {
        throw new Error("--approval-kind must be builder-vision, builder-repo-plan, or major-feature");
      }
      approvalKind = value;
      index += 1;
      continue;
    }

    if (arg === "--approval-key") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--approval-key requires a value");
      }
      approvalKey = value;
      index += 1;
      continue;
    }

    if (arg === "--repo") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--repo requires a value");
      }
      repo = value;
      index += 1;
      continue;
    }

    if (arg === "--description") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--description requires a value");
      }
      description = value;
      index += 1;
      continue;
    }

    if (arg === "--template") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--template requires a value");
      }
      if (value !== "pinmark") {
        throw new Error("--template must be pinmark");
      }
      template = value;
      index += 1;
      continue;
    }

    if (arg === "--topics") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--topics requires a value");
      }
      topics = value
        .split(",")
        .map((topic) => topic.trim())
        .filter((topic) => topic.length > 0);
      index += 1;
      continue;
    }

    if (arg === "--local") {
      local = true;
      host = "local";
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`unknown builder repo create option: ${arg ?? ""}`);
  }

  if (!controlRepo) {
    throw new Error("--control-repo is required");
  }
  if (!projectId) {
    throw new Error("--project is required");
  }
  if (!approvalKind) {
    throw new Error("--approval-kind is required");
  }
  if (!approvalKey) {
    throw new Error("--approval-key is required");
  }
  if (!repo) {
    throw new Error("--repo is required");
  }
  if (!description) {
    throw new Error("--description is required");
  }
  if (!template) {
    throw new Error("--template is required");
  }

  return {
    command: "builder-repo-create",
    host,
    workspaceRoot,
    controlRepo,
    projectId,
    approvalKind,
    approvalKey,
    repo,
    description,
    template,
    topics,
    local,
    json,
  };
}

function parseWatcherDiscoveryArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  let projectId = "palette-wow";
  let local = false;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    if (arg === "--project") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--project requires a value");
      }
      projectId = value;
      index += 1;
      continue;
    }

    if (arg === "--local") {
      local = true;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`unknown watcher discover option: ${arg ?? ""}`);
  }

  return { command: "watcher-discover", host, workspaceRoot, projectId, local, json };
}

function parseAgentRunArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  let projectId: string | undefined;
  let workerCommand: string | undefined;
  let task: string | undefined;
  let local = false;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    if (arg === "--project") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--project requires a value");
      }
      projectId = value;
      index += 1;
      continue;
    }

    if (arg === "--worker-command") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--worker-command requires a value");
      }
      workerCommand = value;
      index += 1;
      continue;
    }

    if (arg === "--task") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--task requires a value");
      }
      task = value;
      index += 1;
      continue;
    }

    if (arg === "--local") {
      local = true;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`unknown agent run option: ${arg ?? ""}`);
  }

  return { command: "agent-run", host, workspaceRoot, projectId, workerCommand, task, local, json };
}

function parseStatusArgs(rest: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  let local = false;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--host") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--workspace-root") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--workspace-root requires a value");
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    if (arg === "--local") {
      local = true;
      host = "local";
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`unknown status option: ${arg ?? ""}`);
  }

  return { command: "status", host, workspaceRoot, local, json };
}

function isDaemonAction(value: string): value is DaemonAction {
  return ["install", "start", "stop", "restart", "status", "logs"].includes(value);
}

function printDoctorReport(report: Awaited<ReturnType<typeof runHostDoctor>>): void {
  console.log(`Vampyre host doctor`);
  console.log(`Host: ${report.host}`);
  console.log(`Workspace Root: ${report.workspaceRoot}`);
  console.log("");

  for (const check of report.checks) {
    console.log(`${check.status.toUpperCase()} ${check.name}: ${check.summary}`);
    if (check.details) {
      console.log(`  ${check.details}`);
    }
  }

  if (report.blockers.length > 0) {
    console.log("");
    console.log("Blockers:");
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function printSetupReport(report: Awaited<ReturnType<typeof runHostSetup>>): void {
  console.log(`Vampyre host setup`);
  console.log(`Host: ${report.host}`);
  console.log(`Workspace Root: ${report.workspaceRoot}`);
  console.log("");

  for (const step of report.steps) {
    console.log(`${step.status.toUpperCase()} ${step.name}: ${step.summary}`);
    if (step.details) {
      console.log(`  ${step.details}`);
    }
  }

  if (report.blockers.length > 0) {
    console.log("");
    console.log("Blockers:");
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }
  }
}

function printDaemonReport(report: Awaited<ReturnType<typeof runDaemonCommand>>): void {
  console.log(`Vampyre daemon ${report.action}`);
  console.log(`Host: ${report.host}`);
  console.log(`Workspace Root: ${report.workspaceRoot}`);
  console.log("");

  for (const step of report.steps) {
    console.log(`${step.status.toUpperCase()} ${step.name}: ${step.summary}`);
    if (step.details && step.details !== report.output) {
      console.log(`  ${step.details}`);
    }
  }

  if (report.output) {
    console.log("");
    console.log(report.output);
  }

  if (report.blockers.length > 0) {
    console.log("");
    console.log("Blockers:");
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }
  }
}

function printTelegramPingReport(report: Awaited<ReturnType<typeof runTelegramPing>>): void {
  console.log(`Vampyre Telegram ping`);
  console.log(`Host: ${report.host}`);
  console.log(`Workspace Root: ${report.workspaceRoot}`);
  console.log("");
  console.log(`${report.status.toUpperCase()} Telegram: ${report.summary}`);
  if (report.details) {
    console.log(`  ${report.details}`);
  }
}

function printGitHubCheckReport(report: Awaited<ReturnType<typeof runGitHubCheck>>): void {
  console.log(`Vampyre GitHub check`);
  console.log(`Host: ${report.host}`);
  console.log(`Workspace Root: ${report.workspaceRoot}`);
  console.log("");

  for (const check of report.checks) {
    console.log(`${check.status.toUpperCase()} ${check.name}: ${check.summary}`);
    if (check.details) {
      console.log(`  ${check.details}`);
    }
  }

  if (report.blockers.length > 0) {
    console.log("");
    console.log("Blockers:");
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function printHelp(): void {
  console.log(`Usage:
  vampyre doctor --host wlkrlab [--workspace-root ~/vampyre]
  vampyre host setup --host wlkrlab [--workspace-root ~/vampyre]
  vampyre github check --host wlkrlab [--workspace-root ~/vampyre] [--repo owner/name]
  vampyre approval check --host wlkrlab --repo owner/name --project project-id --kind builder-vision|builder-repo-plan|major-feature --key approval-key
  vampyre pr upsert --host wlkrlab --repo owner/name --head branch --base branch --title title [--body body] [--draft]
  vampyre review request --host wlkrlab [--workspace-root ~/vampyre]
  vampyre builder repo create --host wlkrlab --control-repo owner/name --project project-id --approval-kind builder-repo-plan --approval-key key --repo owner/name --description text --template pinmark
  vampyre watcher discover --host wlkrlab [--workspace-root ~/vampyre] [--project palette-wow]
  vampyre agent run --host wlkrlab [--workspace-root ~/vampyre] [--project palette-wow] [--task text] [--worker-command command]
  vampyre ping telegram --host wlkrlab [--workspace-root ~/vampyre]
  vampyre -ping telegram --host wlkrlab [--workspace-root ~/vampyre]
  vampyre status --host wlkrlab [--workspace-root ~/vampyre]
  vampyre daemon run [--workspace-root ~/vampyre]
  vampyre daemon install|start|stop|restart|status|logs --host wlkrlab [--workspace-root ~/vampyre]

Commands:
  doctor        Check runtime host readiness without printing secret values
  host setup    Create runtime workspace/env stub and verify system toolchain
  github check  Verify GitHub token auth and repository access from the runtime host
  approval check Verify a GitHub formal approval record before gated work proceeds
  pr upsert     Create or update a GitHub PR for a target branch and send a Telegram link
  review request Create/update the GitHub review record and send a Telegram link
  builder repo create Create an approved private Builder repository and initial Project Contract
  watcher discover Inspect a Safe/Watcher project and write a discovery report
  agent run     Run the host Worktree Build Agent loop and record a Run Journal
  ping telegram Send a Telegram test message from the runtime host
  status        Load registry/state and report managed project status
  daemon run    Run the placeholder daemon in the foreground
  daemon ...    Manage the systemd --user service on the runtime host`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
