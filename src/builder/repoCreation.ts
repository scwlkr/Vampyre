import { spawn } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import { runApprovalCheck, type ApprovalKind } from "../github/approvalLookup.js";
import {
  checkGitHubRepoAccess,
  createGitHubClient,
  createGitHubRepository,
  GitHubApiError,
  parseGitHubRepo,
  replaceGitHubRepositoryTopics,
  type GitHubClient,
  type GitHubFetch,
  type GitHubRepositorySummary,
} from "../github/client.js";
import { loadProjectRegistry } from "../registry/projectRegistry.js";
import { shellQuote, validateWorkspaceRoot, workspacePath, workspaceRootPrelude } from "../remote/paths.js";

export const BUILDER_REPO_TEMPLATES = ["pinmark", "minimark"] as const;

export type BuilderRepoTemplate = (typeof BUILDER_REPO_TEMPLATES)[number];

export interface BuilderRepoCreateOptions {
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
  local?: boolean | undefined;
  now?: (() => Date) | undefined;
  runner?: RemoteCommandRunner | undefined;
  commandRunner?: BuilderCommandRunner | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  githubClient?: GitHubClient | undefined;
  githubFetch?: GitHubFetch | undefined;
}

export interface BuilderRepoCreateReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  blockers: string[];
  approval: BuilderRepoApprovalSummary;
  repository: BuilderRepoSummary;
  proof: string[];
  details?: string | undefined;
}

export interface BuilderRepoApprovalSummary {
  controlRepo: string;
  projectId: string;
  kind: ApprovalKind;
  key: string;
  approved: boolean;
  issueUrl?: string | undefined;
  commentUrl?: string | undefined;
}

export interface BuilderRepoSummary {
  repo: string;
  template: BuilderRepoTemplate;
  action: "created" | "existing" | "blocked";
  private: boolean;
  path?: string | undefined;
  url?: string | undefined;
  commit?: string | undefined;
  topics?: string[] | undefined;
}

export interface BuilderCommandSpec {
  command: string;
  args: string[];
  cwd?: string | undefined;
}

export interface BuilderCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type BuilderCommandRunner = (spec: BuilderCommandSpec) => Promise<BuilderCommandResult>;

interface GitHubRepoEnsureResult {
  action: "created" | "existing";
  repository: GitHubRepositorySummary;
}

const PINMARK_TOPICS = [
  "macos",
  "swift",
  "swiftui",
  "screenshot",
  "screen-capture",
  "annotation",
  "ocr",
  "privacy-first",
  "local-first",
];

const MINIMARK_TOPICS = [
  "macos",
  "swift",
  "swiftui",
  "markdown",
  "editor",
  "scratchpad",
  "local-first",
  "privacy-first",
];

export async function runBuilderRepoCreate(options: BuilderRepoCreateOptions): Promise<BuilderRepoCreateReport> {
  validateOptions(options);

  if (options.local === true) {
    return runLocalBuilderRepoCreate(options);
  }

  validateHost(options.host);
  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(builderRepoCreateRemoteCommand(options));
  const parsed = parseRemoteBuilderRepoCreateReport(result.stdout);

  if (parsed.ok) {
    return {
      ...parsed.value,
      host: options.host,
      workspaceRoot: options.workspaceRoot,
    };
  }

  const summary =
    firstLine(result.stderr) || parsed.message || firstLine(result.stdout) || "remote Builder repo creation failed";
  const report: BuilderRepoCreateReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: [`Builder repo creation: ${summary}`],
    approval: approvalSummary(options, false),
    repository: blockedRepository(options),
    proof: [],
  };
  const details = summarizeOutput(result);
  if (details) {
    report.details = details;
  }
  return report;
}

export function formatBuilderRepoCreateReport(report: BuilderRepoCreateReport): string {
  const lines: string[] = [
    "Vampyre Builder repo create",
    `Host: ${report.host}`,
    `Workspace Root: ${report.workspaceRoot}`,
    `Control Repo: ${report.approval.controlRepo}`,
    `Project: ${report.approval.projectId}`,
    `Approval Kind: ${report.approval.kind}`,
    `Approval Key: ${report.approval.key}`,
    `Approval: ${report.approval.approved ? "approved" : "missing"}`,
    "",
    `Repository: ${report.repository.repo}`,
    `Template: ${report.repository.template}`,
    `Action: ${report.repository.action}`,
    `Private: ${report.repository.private ? "yes" : "no"}`,
  ];

  if (report.repository.url) {
    lines.push(`URL: ${report.repository.url}`);
  }
  if (report.repository.path) {
    lines.push(`Runtime path: ${report.repository.path}`);
  }
  if (report.repository.commit) {
    lines.push(`Commit: ${report.repository.commit}`);
  }
  if (report.repository.topics && report.repository.topics.length > 0) {
    lines.push(`Topics: ${report.repository.topics.join(", ")}`);
  }
  if (report.approval.issueUrl) {
    lines.push("");
    lines.push(`Approval Issue: ${report.approval.issueUrl}`);
  }
  if (report.approval.commentUrl) {
    lines.push(`Approval Comment: ${report.approval.commentUrl}`);
  }
  if (report.proof.length > 0) {
    lines.push("");
    lines.push("Proof:");
    for (const proof of report.proof) {
      lines.push(`- ${proof}`);
    }
  }
  if (report.blockers.length > 0) {
    lines.push("");
    lines.push("Blockers:");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  return lines.join("\n");
}

export function builderRepoCreateReportToJson(report: BuilderRepoCreateReport): string {
  return JSON.stringify(report, null, 2);
}

function validateOptions(options: BuilderRepoCreateOptions): void {
  validateWorkspaceRoot(options.workspaceRoot);
  parseGitHubRepo(options.controlRepo);
  parseGitHubRepo(options.repo);
  validateRequiredString(options.projectId, "--project");
  validateRequiredString(options.approvalKey, "--approval-key");
  validateRequiredString(options.description, "--description");
  if (!isBuilderRepoTemplate(options.template)) {
    throw new Error(`--template must be ${BUILDER_REPO_TEMPLATES.join(" or ")}`);
  }
}

async function runLocalBuilderRepoCreate(options: BuilderRepoCreateOptions): Promise<BuilderRepoCreateReport> {
  const env = options.env ?? process.env;
  const token = envValue(env, "GITHUB_TOKEN");
  const base = baseReport(options);
  if (!token && !options.githubClient) {
    return {
      ...base,
      blockers: ["GitHub: GITHUB_TOKEN is missing"],
    };
  }

  const githubClient =
    options.githubClient ??
    createGitHubClient({
      token: token ?? "",
      fetchImpl: options.githubFetch,
    });

  const approval = await runApprovalCheck({
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    repo: options.controlRepo,
    projectId: options.projectId,
    kind: options.approvalKind,
    key: options.approvalKey,
    local: true,
    env,
    githubClient,
    githubFetch: options.githubFetch,
  });

  if (!approval.ready || !approval.approved) {
    return {
      ...base,
      approval: approvalSummary(options, false),
      blockers: approval.blockers.length > 0 ? approval.blockers : ["Approval: repo plan is not approved"],
    };
  }

  let repoResult: GitHubRepoEnsureResult;
  try {
    repoResult = await ensureGitHubRepository(githubClient, options);
  } catch (error) {
    return {
      ...base,
      approval: approvalSummaryFromReport(options, approval),
      blockers: [`GitHub: ${sanitizeError(error, env)}`],
    };
  }

  if (repoResult.action === "existing" && repoResult.repository.private !== true) {
    return {
      ...base,
      approval: approvalSummaryFromReport(options, approval),
      repository: {
        ...base.repository,
        action: "existing",
        private: false,
        url: repoResult.repository.htmlUrl,
      },
      blockers: ["GitHub: existing Builder repository is not private"],
    };
  }

  let topics: string[];
  try {
    topics = await replaceGitHubRepositoryTopics(githubClient, options.repo, options.topics ?? defaultTopics(options.template));
  } catch (error) {
    return {
      ...base,
      approval: approvalSummaryFromReport(options, approval),
      repository: {
        ...base.repository,
        action: repoResult.action,
        private: repoResult.repository.private,
        url: repoResult.repository.htmlUrl,
      },
      blockers: [`GitHub topics: ${sanitizeError(error, env)}`],
    };
  }

  const commandRunner = options.commandRunner ?? runLocalCommand;
  const repoName = parseGitHubRepo(options.repo).name;
  const repoPath = workspacePath(options.workspaceRoot, "repos", repoName);
  const redactions = gitAuthRedactions(token);
  const initResult = await initializeProjectRepository({
    repoPath,
    repo: options.repo,
    template: options.template,
    token,
    commandRunner,
    now: options.now ?? (() => new Date()),
    redactions,
  });
  if (!initResult.ok) {
    return {
      ...base,
      approval: approvalSummaryFromReport(options, approval),
      repository: {
        ...base.repository,
        action: repoResult.action,
        private: repoResult.repository.private,
        path: repoPath,
        url: repoResult.repository.htmlUrl,
        topics,
      },
      blockers: [initResult.blocker],
    };
  }

  try {
    await recordBuilderRepoInRegistry(options.workspaceRoot, options.projectId, options.repo, options.template);
  } catch (error) {
    return {
      ...base,
      approval: approvalSummaryFromReport(options, approval),
      repository: {
        repo: options.repo,
        template: options.template,
        action: repoResult.action,
        private: repoResult.repository.private,
        path: repoPath,
        url: repoResult.repository.htmlUrl,
        commit: initResult.commit,
        topics,
      },
      blockers: [`Project Registry: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  return {
    ...base,
    ready: true,
    approval: approvalSummaryFromReport(options, approval),
    repository: {
      repo: options.repo,
      template: options.template,
      action: repoResult.action,
      private: repoResult.repository.private,
      path: repoPath,
      url: repoResult.repository.htmlUrl,
      commit: initResult.commit,
      topics,
    },
    proof: [
      `Approval gate passed via ${approval.github?.commentUrl ?? approval.github?.issueUrl ?? options.controlRepo}`,
      `${repoResult.action === "created" ? "Created" : "Confirmed"} private GitHub repository ${options.repo}`,
      `Wrote ${templateDisplayName(options.template)} Project Contract into ${repoPath}`,
      `Committed and pushed initial main branch at ${initResult.commit}`,
      `Recorded ${options.repo} in the Project Registry for ${options.projectId}`,
    ],
  };
}

async function recordBuilderRepoInRegistry(
  workspaceRoot: string,
  projectId: string,
  repo: string,
  template: BuilderRepoTemplate,
): Promise<void> {
  const loaded = await loadProjectRegistry(workspaceRoot);
  let found = false;
  const projects = loaded.registry.projects.map((project) => {
    if (project.id !== projectId) {
      return project;
    }

    found = true;
    return {
      ...project,
      displayName: templateDisplayName(template),
      githubRepo: repo,
    };
  });

  if (!found) {
    throw new Error(`project ${projectId} is missing`);
  }

  await writeFile(
    loaded.path,
    `${JSON.stringify(
      {
        ...loaded.registry,
        projects,
      },
      null,
      2,
    )}\n`,
    { mode: 0o644 },
  );
}

function templateDisplayName(template: BuilderRepoTemplate): string {
  if (template === "pinmark") {
    return "Pinmark";
  }

  if (template === "minimark") {
    return "MiniMark";
  }

  return template;
}

function defaultTopics(template: BuilderRepoTemplate): string[] {
  if (template === "minimark") {
    return MINIMARK_TOPICS;
  }

  return PINMARK_TOPICS;
}

function isBuilderRepoTemplate(value: string): value is BuilderRepoTemplate {
  return BUILDER_REPO_TEMPLATES.some((template) => template === value);
}

async function ensureGitHubRepository(
  client: GitHubClient,
  options: BuilderRepoCreateOptions,
): Promise<GitHubRepoEnsureResult> {
  const repo = parseGitHubRepo(options.repo);
  try {
    const existing = await checkGitHubRepoAccess(client, options.repo);
    return {
      action: "existing",
      repository: {
        fullName: existing.fullName,
        private: existing.private,
        url: `https://api.github.com/repos/${repo.owner}/${repo.name}`,
        sshUrl: `git@github.com:${repo.owner}/${repo.name}.git`,
        htmlUrl: `https://github.com/${repo.owner}/${repo.name}`,
      },
    };
  } catch (error) {
    if (!(error instanceof GitHubApiError && error.status === 404)) {
      throw error;
    }
  }

  const created = await createGitHubRepository(client, {
    owner: repo.owner,
    name: repo.name,
    private: true,
    description: options.description,
    hasIssues: true,
    hasProjects: false,
    hasWiki: false,
    hasDiscussions: false,
  });
  return {
    action: "created",
    repository: created,
  };
}

type InitRepoResult =
  | {
      ok: true;
      commit: string;
    }
  | {
      ok: false;
      blocker: string;
    };

async function initializeProjectRepository(options: {
  repoPath: string;
  repo: string;
  template: BuilderRepoTemplate;
  token?: string | undefined;
  commandRunner: BuilderCommandRunner;
  now: () => Date;
  redactions: string[];
}): Promise<InitRepoResult> {
  const existingEntries = (await pathExists(options.repoPath)) ? await readdir(options.repoPath) : [];
  if (existingEntries.length > 0) {
    return {
      ok: false,
      blocker: `Runtime repository path already exists and is not empty: ${options.repoPath}`,
    };
  }

  await mkdir(options.repoPath, { recursive: true });
  await writeBuilderProjectFiles(options.repoPath, options.template, options.now());
  const displayName = templateDisplayName(options.template);

  const gitSteps: Array<{ args: string[]; label: string }> = [
    { label: "init", args: ["-C", options.repoPath, "init", "-b", "main"] },
    { label: "config user.name", args: ["-C", options.repoPath, "config", "user.name", "Vampyre"] },
    {
      label: "config user.email",
      args: ["-C", options.repoPath, "config", "user.email", "vampyre@local.invalid"],
    },
    { label: "add", args: ["-C", options.repoPath, "add", "."] },
    { label: "commit", args: ["-C", options.repoPath, "commit", "-m", `Create ${displayName} project contract`] },
    { label: "remote add", args: ["-C", options.repoPath, "remote", "add", "origin", `https://github.com/${options.repo}.git`] },
    {
      label: "push",
      args: [...gitAuthArgs(options.token), "-C", options.repoPath, "push", "-u", "origin", "main"],
    },
  ];

  for (const step of gitSteps) {
    const result = await options.commandRunner({ command: "git", args: step.args });
    if (result.exitCode !== 0) {
      return {
        ok: false,
        blocker: `Git ${step.label}: ${sanitizeOutput(errorSummary(result), options.redactions)}`,
      };
    }
  }

  const commit = await options.commandRunner({
    command: "git",
    args: ["-C", options.repoPath, "rev-parse", "--short", "HEAD"],
  });
  if (commit.exitCode !== 0 || commit.stdout.trim().length === 0) {
    return {
      ok: false,
      blocker: `Git rev-parse: ${sanitizeOutput(errorSummary(commit), options.redactions)}`,
    };
  }

  return {
    ok: true,
    commit: commit.stdout.trim(),
  };
}

async function writeBuilderProjectFiles(repoPath: string, template: BuilderRepoTemplate, now: Date): Promise<void> {
  const files = template === "minimark" ? minimarkProjectFiles(now) : pinmarkProjectFiles(now);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const path = join(repoPath, relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    }),
  );
}

interface BuilderInitialDocsOptions {
  displayName: string;
  readmeLead: string;
  currentTarget: string[];
  projectConcept: string;
  technicalDirection: string[];
  boundaries: string[];
  coreWorkflow: string[];
  currentPhase: string;
  implemented: string[];
  partial: string[];
  planned: string[];
  missing: string[];
  needsVerification: string[];
  nextAction: string;
  blockers: string[];
  latestProof: string[];
  installationSteps: string[];
  firstRunSteps: string[];
  troubleshooting: string[];
  configNotes: string[];
  envNotes: string[];
  architectureOverview: string;
  fileLayout: string[];
  dataFlow: string[];
  decisionTitle: string;
  decisionContext: string;
  decisionConsequences: string[];
  docsTodo: string[];
  missingFeatures: string[];
  validationCommand: string;
}

function initialDocsProjectFiles(options: BuilderInitialDocsOptions): Record<string, string> {
  return {
    "AGENTS.md": `# ${options.displayName} Agent Instructions

## Source Of Truth

Before non-trivial work, read:

- \`README.md\`
- \`docs/index.md\`
- \`docs/map.md\`
- \`docs/status.md\`
- relevant files in \`docs/decisions/\`

Treat \`docs/status.md\` as the current handoff and keep it updated after meaningful implementation work.

## Working Rules

- Keep changes narrow and tied to the current status next action.
- Record verified product behavior in normal docs.
- Put planned, missing, or uncertain claims in \`docs/todo/\` until they are verified.
- Validate with \`${options.validationCommand}\` before handing off when that command is available.
`,
    "README.md": `# ${options.displayName}

${options.readmeLead}

## Current Target

${markdownBullets(options.currentTarget)}

## Project Docs

- [Docs index](docs/index.md)
- [Docs map](docs/map.md)
- [Status](docs/status.md)
- [Missing features](docs/todo/missing-features.md)
- [Needs verification](docs/todo/needs-verification.md)
`,
    "CHANGELOG.md": `# Changelog

## Unreleased

- Created the private Builder Mode project baseline.
- Added the initial modular docs structure.
- Added the first Swift package foundation.
`,
    "docs/index.md": `# ${options.displayName} Docs

Start here when working on ${options.displayName}.

## Core

- [Map](map.md)
- [Status](status.md)

## Concepts

- [Project](concepts/project.md)
- [Core workflow](concepts/core-workflow.md)

## Guides

- [Installation](guides/installation.md)
- [First run](guides/first-run.md)
- [Troubleshooting](guides/troubleshooting.md)

## Reference

- [CLI](reference/cli.md)
- [Config](reference/config.md)
- [Environment](reference/env.md)

## Architecture

- [Overview](architecture/overview.md)
- [File layout](architecture/file-layout.md)
- [Data flow](architecture/data-flow.md)

## Decisions

- [Project shape](decisions/0001-project-shape.md)

## Todo

- [Docs todo](todo/docs-todo.md)
- [Missing features](todo/missing-features.md)
- [Needs verification](todo/needs-verification.md)
`,
    "docs/map.md": `# ${options.displayName} Docs Map

## Root

- [Agent instructions](../AGENTS.md)
- [README](../README.md)
- [Changelog](../CHANGELOG.md)

## Docs

- [Index](index.md)
- [Status](status.md)

## Concepts

- [Project](concepts/project.md)
- [Core workflow](concepts/core-workflow.md)

## Guides

- [Installation](guides/installation.md)
- [First run](guides/first-run.md)
- [Troubleshooting](guides/troubleshooting.md)

## Reference

- [CLI](reference/cli.md)
- [Config](reference/config.md)
- [Environment](reference/env.md)

## Architecture

- [Overview](architecture/overview.md)
- [File layout](architecture/file-layout.md)
- [Data flow](architecture/data-flow.md)

## Decisions

- [Decision index](decisions/index.md)
- [0001 Project shape](decisions/0001-project-shape.md)

## Todo

- [Todo index](todo/index.md)
- [Docs todo](todo/docs-todo.md)
- [Missing features](todo/missing-features.md)
- [Needs verification](todo/needs-verification.md)
`,
    "docs/status.md": `# ${options.displayName} Status

## Current Phase

${options.currentPhase}

## Implemented

${markdownBullets(options.implemented)}

## Partial

${markdownBulletsOrNone(options.partial)}

## Planned

${markdownBullets(options.planned)}

## Missing

${markdownBullets(options.missing)}

## Needs Verification

${markdownBullets(options.needsVerification)}

## Next action

${options.nextAction}

## Blockers

${markdownBulletsOrNone(options.blockers)}

## Latest proof

${markdownBullets(options.latestProof)}
`,
    "docs/concepts/index.md": `# Concepts

- [Project](project.md)
- [Core workflow](core-workflow.md)
`,
    "docs/concepts/project.md": `# Project

${options.projectConcept}

## Technical Direction

${markdownBullets(options.technicalDirection)}

## Boundaries

${markdownBullets(options.boundaries)}
`,
    "docs/concepts/core-workflow.md": `# Core Workflow

${markdownNumbered(options.coreWorkflow)}
`,
    "docs/guides/index.md": `# Guides

- [Installation](installation.md)
- [First run](first-run.md)
- [Troubleshooting](troubleshooting.md)
`,
    "docs/guides/installation.md": `# Installation

${markdownNumbered(options.installationSteps)}
`,
    "docs/guides/first-run.md": `# First Run

${markdownNumbered(options.firstRunSteps)}
`,
    "docs/guides/troubleshooting.md": `# Troubleshooting

${markdownBullets(options.troubleshooting)}
`,
    "docs/reference/index.md": `# Reference

- [CLI](cli.md)
- [Config](config.md)
- [Environment](env.md)
`,
    "docs/reference/cli.md": `# CLI

No user-facing CLI is implemented in the initial baseline.

Development validation command:

\`\`\`sh
${options.validationCommand}
\`\`\`
`,
    "docs/reference/config.md": `# Config

${markdownBullets(options.configNotes)}
`,
    "docs/reference/env.md": `# Environment

${markdownBullets(options.envNotes)}
`,
    "docs/architecture/index.md": `# Architecture

- [Overview](overview.md)
- [File layout](file-layout.md)
- [Data flow](data-flow.md)
`,
    "docs/architecture/overview.md": `# Architecture Overview

${options.architectureOverview}
`,
    "docs/architecture/file-layout.md": `# File Layout

${markdownBullets(options.fileLayout)}
`,
    "docs/architecture/data-flow.md": `# Data Flow

${markdownNumbered(options.dataFlow)}
`,
    "docs/decisions/index.md": `# Decisions

- [0001 Project shape](0001-project-shape.md)
`,
    "docs/decisions/0001-project-shape.md": `# ${options.decisionTitle}

${options.decisionContext}

## Consequences

${markdownBullets(options.decisionConsequences)}
`,
    "docs/todo/index.md": `# Todo

- [Docs todo](docs-todo.md)
- [Missing features](missing-features.md)
- [Needs verification](needs-verification.md)
`,
    "docs/todo/docs-todo.md": `# Docs Todo

${markdownBulletsOrNone(options.docsTodo)}
`,
    "docs/todo/missing-features.md": `# Missing Features

${markdownBullets(options.missingFeatures)}
`,
    "docs/todo/needs-verification.md": `# Needs Verification

${markdownBullets(options.needsVerification)}
`,
  };
}

function markdownBullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function markdownBulletsOrNone(items: string[]): string {
  return items.length > 0 ? markdownBullets(items) : "- None.";
}

function markdownNumbered(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function pinmarkProjectFiles(now: Date): Record<string, string> {
  const date = now.toISOString().slice(0, 10);
  return {
    ...initialDocsProjectFiles({
      displayName: "Pinmark",
      readmeLead:
        "Pinmark is a private local-first macOS screenshot tool for capturing, marking up, redacting, pinning, OCRing, and exporting polished screenshots without a cloud account.",
      currentTarget: [
        "Native macOS app using Swift, SwiftUI, and AppKit where needed.",
        "Local history and settings stored on device.",
        "Screen Recording permission flow that explains exactly what the app needs.",
        "Capture, annotate, redact, pin, copy, save, and export polished screenshots.",
      ],
      projectConcept:
        "Pinmark is a fast local-first screenshot markup desk for Mac users who want to capture, redact, pin, annotate, OCR, and export polished screenshots without creating a cloud account.",
      technicalDirection: [
        "Platform: macOS.",
        "Language: Swift.",
        "UI: SwiftUI for primary surfaces, with AppKit where platform behavior requires it.",
        "Capture: native macOS capture path, with ScreenCaptureKit evaluated early.",
        "OCR: Apple Vision.",
        "Storage: local application support directory for history and settings.",
        "Secrets: none for the initial baseline.",
      ],
      boundaries: [
        "Keep the first baseline private until a Launch Visibility Gate approves public visibility.",
        "Optimize the local capture, markup, redaction, pinning, and export loop before cloud sharing.",
        "Defer uploads, accounts, team collaboration, recording, GIF export, scrolling capture, AI redaction, and public marketing.",
      ],
      coreWorkflow: [
        "User starts a screenshot capture.",
        "Pinmark explains and handles the Screen Recording permission requirement.",
        "User captures a region or screen.",
        "Pinmark opens the image in a markup editor.",
        "User annotates, redacts, pins, copies, saves, or exports the result.",
      ],
      currentPhase: "Phase 0 - Project Contract And Swift Foundation.",
      implemented: [
        "Private Builder Mode project baseline.",
        "Initial modular docs structure.",
        "Swift package foundation for early local-first domain code.",
      ],
      partial: [],
      planned: [
        "Native macOS app shell with menu-bar entry point.",
        "Screen Recording permission explanation.",
        "Capture and markup editor loop.",
        "Floating pin window, local history, and export polish.",
      ],
      missing: [
        "Native app target.",
        "Capture implementation.",
        "Markup editor.",
        "Local history.",
        "OCR spike.",
      ],
      needsVerification: [
        "The first native app shell launches on a Mac/Xcode-capable environment.",
        "Screen Recording permission behavior is testable and documented.",
        "Swift package validation passes after each product-loop change.",
      ],
      nextAction:
        "Create the native macOS app shell with a menu-bar entry point and Screen Recording permission explanation, then verify the app on a Mac/Xcode-capable environment.",
      blockers: [
        "Screen Recording permission behavior is difficult to test deterministically until Vampyre has stronger native macOS permission and TCC validation support.",
      ],
      latestProof: [
        `Repository initialized on ${date}.`,
        "Initial branch: main.",
        "Initial validation target: swift test.",
      ],
      installationSteps: [
        "Clone the private repository.",
        "Open a terminal at the repository root.",
        "Run `swift test` to verify the package foundation.",
      ],
      firstRunSteps: [
        "Run `swift test` from the repository root.",
        "Wait for the native app target before attempting an app launch.",
        "Record launch proof in docs/status.md after the first app shell exists.",
      ],
      troubleshooting: [
        "If `swift test` fails, check the installed Swift toolchain and macOS SDK.",
        "If native app validation fails, record the failing environment in docs/todo/needs-verification.md.",
        "Do not add cloud or account dependencies to fix local workflow issues.",
      ],
      configNotes: [
        "No user-editable config file exists in the initial baseline.",
        "Future settings should stay local-first unless a later decision changes that boundary.",
      ],
      envNotes: [
        "No environment variables are required for the initial baseline.",
        "No secrets are required for local package validation.",
      ],
      architectureOverview:
        "The initial repository is a Swift package foundation. The app target, capture layer, editor layer, local storage, and export path are planned but not implemented yet.",
      fileLayout: [
        "`Package.swift` defines the Swift package foundation.",
        "`Sources/PinmarkCore/` contains early domain code.",
        "`Tests/PinmarkCoreTests/` contains package tests.",
        "`docs/` contains the modular project docs.",
      ],
      dataFlow: [
        "Capture source produces an image.",
        "Editor state applies annotations and redactions.",
        "Export state writes the final image to clipboard or a user-selected file.",
        "Local history stores metadata and app-owned artifacts.",
      ],
      decisionTitle: "Start as a native local-first macOS app",
      decisionContext:
        "Pinmark will start as a native macOS app using Swift, SwiftUI, and AppKit where platform integration requires it.",
      decisionConsequences: [
        "The capture, permission, menu-bar, floating panel, and editor loops should use macOS-native primitives.",
        "Local history and settings stay on device for the initial baseline.",
        "ScreenCaptureKit, Apple Vision, and AppKit capture/editor integration should be evaluated before adding non-native abstractions.",
        "Linux runtime hosts can manage repository work, but native app validation needs a Mac/Xcode-capable environment.",
      ],
      docsTodo: [
        "Update docs/status.md after the first native app target lands.",
        "Add reference docs for user settings after settings exist.",
      ],
      missingFeatures: [
        "Native app shell.",
        "Screen Recording permission explanation.",
        "Region or full-screen capture.",
        "Markup editor.",
        "Redaction tools.",
        "Floating pin window.",
        "Local history.",
        "Clipboard and file export.",
        "Polished export preset.",
        "OCR spike.",
      ],
      validationCommand: "swift test",
    }),
    ".gitignore": `.DS_Store
.swiftpm/
.build/
DerivedData/
*.xcodeproj/project.xcworkspace/xcuserdata/
*.xcworkspace/xcuserdata/
xcuserdata/
*.xcuserstate
*.ipa
*.dSYM
`,
    "Package.swift": `// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Pinmark",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "PinmarkCore", targets: ["PinmarkCore"])
    ],
    targets: [
        .target(name: "PinmarkCore"),
        .testTarget(name: "PinmarkCoreTests", dependencies: ["PinmarkCore"])
    ]
)
`,
    "Sources/PinmarkCore/PinmarkBaseline.swift": `public struct PinmarkBaseline: Equatable {
    public var requiredCapabilities: [String]
    public var deferredCapabilities: [String]

    public init(
        requiredCapabilities: [String] = PinmarkBaseline.defaultRequiredCapabilities,
        deferredCapabilities: [String] = PinmarkBaseline.defaultDeferredCapabilities
    ) {
        self.requiredCapabilities = requiredCapabilities
        self.deferredCapabilities = deferredCapabilities
    }

    public static let defaultRequiredCapabilities = [
        "menu-bar app shell",
        "screen recording permission explanation",
        "region or full-screen capture",
        "markup editor",
        "redaction",
        "floating pin window",
        "local history",
        "clipboard and file export",
        "polished export preset"
    ]

    public static let defaultDeferredCapabilities = [
        "uploads",
        "cloud accounts",
        "team collaboration",
        "recording or GIF export",
        "scrolling capture",
        "AI redaction",
        "public launch"
    ]
}
`,
    "Tests/PinmarkCoreTests/PinmarkBaselineTests.swift": `import XCTest
@testable import PinmarkCore

final class PinmarkBaselineTests: XCTestCase {
    func testDefaultBaselineKeepsCaptureAndMarkupInScope() {
        let baseline = PinmarkBaseline()

        XCTAssertTrue(baseline.requiredCapabilities.contains("markup editor"))
        XCTAssertTrue(baseline.requiredCapabilities.contains("redaction"))
        XCTAssertTrue(baseline.requiredCapabilities.contains("clipboard and file export"))
    }

    func testDefaultBaselineDefersCloudAndPublicLaunchWork() {
        let baseline = PinmarkBaseline()

        XCTAssertTrue(baseline.deferredCapabilities.contains("uploads"))
        XCTAssertTrue(baseline.deferredCapabilities.contains("cloud accounts"))
        XCTAssertTrue(baseline.deferredCapabilities.contains("public launch"))
    }
}
`,
    "LICENSE": `MIT License

Copyright (c) 2026 Shane Walker

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  };
}

function minimarkProjectFiles(now: Date): Record<string, string> {
  const date = now.toISOString().slice(0, 10);
  return {
    ...initialDocsProjectFiles({
      displayName: "MiniMark",
      readmeLead:
        "MiniMark is a private no-permission macOS markdown scratchpad with a split editor and preview, auto-save, .md export, and recent documents.",
      currentTarget: [
        "Native macOS app using Swift and SwiftUI.",
        "Left-side markdown editor and right-side rendered preview.",
        "Auto-save drafts into app-owned local storage.",
        "Export to .md through an explicit user-chosen save location.",
        "Recent documents from app-owned storage.",
        "Deterministic screenshot-friendly sample document and settings states.",
      ],
      projectConcept:
        "MiniMark is a developer-leaning markdown scratchpad for quick local notes. It should feel useful with only app-owned storage and user-selected file export, which keeps validation deterministic and avoids macOS permission prompts.",
      technicalDirection: [
        "Platform: macOS.",
        "Language: Swift.",
        "UI: SwiftUI.",
        "Storage: app-owned Application Support storage for auto-saved drafts and recent documents.",
        "Export: user-selected .md export through the standard save flow.",
        "Markdown preview: start with a small deterministic renderer or platform-native attributed output before adopting heavier dependencies.",
        "Validation: hosted macOS GitHub Actions for Swift tests first, then app launch and screenshot artifact once the native shell exists.",
        "Secrets: none for the initial baseline.",
      ],
      boundaries: [
        "Never request Screen Recording, Accessibility, Camera, Microphone, Photos, Contacts, Calendar, Reminders, Location, Automation, Full Disk Access, or similar TCC-protected capabilities.",
        "Use app-owned storage and explicit user-selected export only.",
        "Keep the first baseline private until a Launch Visibility Gate approves public visibility.",
        "Optimize editor, preview, autosave, export, recent documents, and deterministic validation before sync or sharing.",
        "Defer cloud accounts, collaboration, AI features, screenshot capture, OCR, and permission-dependent integrations.",
      ],
      coreWorkflow: [
        "User opens MiniMark without any permission prompts.",
        "MiniMark loads an app-owned draft or deterministic sample document.",
        "User edits markdown on the left side.",
        "MiniMark renders a preview on the right side.",
        "MiniMark auto-saves the draft into app-owned storage.",
        "User exports a .md file only through an explicit save action.",
      ],
      currentPhase: "Phase 0 - Project Contract And Swift Foundation.",
      implemented: [
        "Private Builder Mode project baseline.",
        "Initial modular docs structure.",
        "Swift package foundation for no-permission product constraints.",
        "Hosted macOS SwiftPM validation workflow.",
      ],
      partial: [],
      planned: [
        "No-permission SwiftUI macOS app shell.",
        "Split markdown editor and preview.",
        "App-owned auto-save and recent documents.",
        "Explicit user-selected .md export.",
        "Deterministic visual proof artifact.",
      ],
      missing: [
        "Native app target.",
        "Editor and preview UI.",
        "Auto-save persistence.",
        "Recent documents list.",
        ".md export flow.",
        "Visual proof screenshot artifact.",
      ],
      needsVerification: [
        "The first native app shell launches without TCC permission prompts.",
        "Hosted macOS validation passes after each product-loop change.",
        "Visual proof renders the deterministic sample document once the app shell exists.",
      ],
      nextAction:
        "Create the first no-permission native macOS app shell: a SwiftUI split markdown editor/preview using app-owned local storage for auto-save, a deterministic sample document, and no TCC permission prompts. Keep export limited to explicit user-selected .md save flow.",
      blockers: [],
      latestProof: [
        `Repository initialized on ${date}.`,
        "Initial branch: main.",
        "Initial validation target: swift test through hosted macOS GitHub Actions.",
      ],
      installationSteps: [
        "Clone the private repository.",
        "Open a terminal at the repository root.",
        "Run `swift test` to verify the package foundation.",
      ],
      firstRunSteps: [
        "Run `swift test` from the repository root.",
        "Wait for the native app target before attempting an app launch.",
        "Record launch proof in docs/status.md after the first app shell exists.",
      ],
      troubleshooting: [
        "If `swift test` fails, check the installed Swift toolchain and macOS SDK.",
        "If a proposed feature needs a permission prompt, move it to docs/todo/missing-features.md instead of implementing it in the baseline.",
        "If screenshot proof is unstable, keep the deterministic sample document and settings state under test.",
      ],
      configNotes: [
        "No user-editable config file exists in the initial baseline.",
        "Future editor and preview settings should be stored in app-owned local storage.",
      ],
      envNotes: [
        "No environment variables are required for the initial baseline.",
        "No secrets are required for local package validation.",
      ],
      architectureOverview:
        "The initial repository is a Swift package foundation plus hosted macOS validation. The app target, local persistence, markdown rendering, export flow, and visual proof are planned but not implemented yet.",
      fileLayout: [
        "`Package.swift` defines the Swift package foundation.",
        "`Sources/MiniMarkCore/` contains early no-permission domain code.",
        "`Tests/MiniMarkCoreTests/` contains package tests.",
        "`.github/workflows/macos-validation.yml` runs hosted macOS SwiftPM validation.",
        "`docs/` contains the modular project docs.",
      ],
      dataFlow: [
        "App-owned storage loads a draft or deterministic sample document.",
        "Editor state updates markdown text.",
        "Preview state renders markdown output.",
        "Auto-save writes the draft back to app-owned storage.",
        "Explicit export writes a .md file to a user-selected location.",
      ],
      decisionTitle: "Start as a native no-permission macOS app",
      decisionContext:
        "MiniMark will start as a native macOS app using Swift and SwiftUI, with a product boundary that avoids TCC-protected permissions.",
      decisionConsequences: [
        "The first baseline should use only app-owned storage and user-selected .md export.",
        "Features requiring Screen Recording, Accessibility, Camera, Microphone, Photos, Contacts, Calendar, Location, Automation, Full Disk Access, or similar prompts are out of scope.",
        "Hosted macOS validation should be able to build, test, launch, and later capture screenshots without preconfigured permission state.",
        "Linux runtime hosts can manage repository work, but native app validation runs on macOS GitHub Actions.",
      ],
      docsTodo: [
        "Update docs/status.md after the first native app target lands.",
        "Add reference docs for settings once settings exist.",
        "Add troubleshooting notes for visual proof once screenshot capture exists.",
      ],
      missingFeatures: [
        "Native SwiftUI app shell.",
        "Split markdown editor and preview.",
        "App-owned draft persistence.",
        "Recent documents.",
        "Explicit .md export.",
        "Editor wrapping and preview style settings.",
        "Deterministic app launch screenshot artifact.",
      ],
      validationCommand: "swift test",
    }),
    ".github/workflows/macos-validation.yml": `name: macOS validation

on:
  workflow_dispatch:
    inputs:
      ref_name:
        description: Git ref to validate
        required: false
  push:
    branches:
      - main

jobs:
  swiftpm:
    name: SwiftPM
    runs-on: macos-15
    steps:
      - name: Check out repository
        uses: actions/checkout@v4
        with:
          ref: \${{ inputs.ref_name || github.ref }}

      - name: Run Swift tests
        run: swift test
`,
    ".gitignore": `.DS_Store
.swiftpm/
.build/
DerivedData/
*.xcodeproj/project.xcworkspace/xcuserdata/
*.xcworkspace/xcuserdata/
xcuserdata/
*.xcuserstate
*.ipa
*.dSYM
`,
    "Package.swift": `// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MiniMark",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "MiniMarkCore", targets: ["MiniMarkCore"])
    ],
    targets: [
        .target(name: "MiniMarkCore"),
        .testTarget(name: "MiniMarkCoreTests", dependencies: ["MiniMarkCore"])
    ]
)
`,
    "Sources/MiniMarkCore/MiniMarkBaseline.swift": `public struct MiniMarkBaseline: Equatable {
    public var requiredCapabilities: [String]
    public var forbiddenPermissions: [String]
    public var deferredCapabilities: [String]

    public init(
        requiredCapabilities: [String] = MiniMarkBaseline.defaultRequiredCapabilities,
        forbiddenPermissions: [String] = MiniMarkBaseline.defaultForbiddenPermissions,
        deferredCapabilities: [String] = MiniMarkBaseline.defaultDeferredCapabilities
    ) {
        self.requiredCapabilities = requiredCapabilities
        self.forbiddenPermissions = forbiddenPermissions
        self.deferredCapabilities = deferredCapabilities
    }

    public static let defaultRequiredCapabilities = [
        "split markdown editor and preview",
        "auto-save local drafts",
        "export to md",
        "recent documents",
        "deterministic sample document",
        "settings for preview and editor behavior"
    ]

    public static let defaultForbiddenPermissions = [
        "Screen Recording",
        "Accessibility",
        "Camera",
        "Microphone",
        "Photos",
        "Contacts",
        "Calendar",
        "Location",
        "Automation",
        "Full Disk Access"
    ]

    public static let defaultDeferredCapabilities = [
        "cloud sync",
        "accounts",
        "collaboration",
        "AI-assisted editing",
        "screenshot capture",
        "OCR",
        "public launch"
    ]
}
`,
    "Tests/MiniMarkCoreTests/MiniMarkBaselineTests.swift": `import XCTest
@testable import MiniMarkCore

final class MiniMarkBaselineTests: XCTestCase {
    func testDefaultBaselineKeepsScratchpadWorkflowInScope() {
        let baseline = MiniMarkBaseline()

        XCTAssertTrue(baseline.requiredCapabilities.contains("split markdown editor and preview"))
        XCTAssertTrue(baseline.requiredCapabilities.contains("auto-save local drafts"))
        XCTAssertTrue(baseline.requiredCapabilities.contains("export to md"))
        XCTAssertTrue(baseline.requiredCapabilities.contains("recent documents"))
    }

    func testDefaultBaselineForbidsPermissionPrompts() {
        let baseline = MiniMarkBaseline()

        XCTAssertTrue(baseline.forbiddenPermissions.contains("Screen Recording"))
        XCTAssertTrue(baseline.forbiddenPermissions.contains("Accessibility"))
        XCTAssertTrue(baseline.forbiddenPermissions.contains("Camera"))
        XCTAssertTrue(baseline.forbiddenPermissions.contains("Full Disk Access"))
    }

    func testDefaultBaselineDefersNetworkAndPermissionHeavyWork() {
        let baseline = MiniMarkBaseline()

        XCTAssertTrue(baseline.deferredCapabilities.contains("cloud sync"))
        XCTAssertTrue(baseline.deferredCapabilities.contains("AI-assisted editing"))
        XCTAssertTrue(baseline.deferredCapabilities.contains("screenshot capture"))
        XCTAssertTrue(baseline.deferredCapabilities.contains("public launch"))
    }
}
`,
    "LICENSE": `MIT License

Copyright (c) 2026 Shane Walker

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  };
}

function builderRepoCreateRemoteCommand(options: BuilderRepoCreateOptions): string {
  const args = [
    "builder",
    "repo",
    "create",
    "--local",
    "--json",
    "--host",
    options.host,
    "--workspace-root",
    "$root",
    "--control-repo",
    options.controlRepo,
    "--project",
    options.projectId,
    "--approval-kind",
    options.approvalKind,
    "--approval-key",
    options.approvalKey,
    "--repo",
    options.repo,
    "--description",
    options.description,
    "--template",
    options.template,
    "--topics",
    (options.topics ?? defaultTopics(options.template)).join(","),
  ];

  return `
${workspaceRootPrelude(options.workspaceRoot)}
env_file="$root/config/vampyre.env"
cli="$root/app/dist/cli.js"
if [ ! -f "$cli" ]; then
  printf 'remote-app-missing:%s\\n' "$cli"
  exit 2
fi
if [ ! -f "$env_file" ]; then
  printf 'env-missing\\n'
  exit 3
fi
set -a
. "$env_file"
set +a
node "$cli" ${args.map((arg) => (arg === "$root" ? '"$root"' : shellQuote(arg))).join(" ")}
`;
}

function baseReport(options: BuilderRepoCreateOptions): BuilderRepoCreateReport {
  return {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: [],
    approval: approvalSummary(options, false),
    repository: blockedRepository(options),
    proof: [],
  };
}

function approvalSummary(options: BuilderRepoCreateOptions, approved: boolean): BuilderRepoApprovalSummary {
  return {
    controlRepo: options.controlRepo,
    projectId: options.projectId,
    kind: options.approvalKind,
    key: options.approvalKey,
    approved,
  };
}

function approvalSummaryFromReport(
  options: BuilderRepoCreateOptions,
  report: Awaited<ReturnType<typeof runApprovalCheck>>,
): BuilderRepoApprovalSummary {
  const summary = approvalSummary(options, report.approved);
  if (report.github?.issueUrl) {
    summary.issueUrl = report.github.issueUrl;
  }
  if (report.github?.commentUrl) {
    summary.commentUrl = report.github.commentUrl;
  }
  return summary;
}

function blockedRepository(options: BuilderRepoCreateOptions): BuilderRepoSummary {
  return {
    repo: options.repo,
    template: options.template,
    action: "blocked",
    private: true,
  };
}

async function runLocalCommand(spec: BuilderCommandSpec): Promise<BuilderCommandResult> {
  return new Promise<BuilderCommandResult>((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function gitAuthArgs(token: string | undefined): string[] {
  if (!token) {
    return [];
  }

  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return ["-c", `http.extraHeader=AUTHORIZATION: basic ${basic}`];
}

function gitAuthRedactions(token: string | undefined): string[] {
  if (!token) {
    return [];
  }

  return [token, Buffer.from(`x-access-token:${token}`).toString("base64")];
}

function sanitizeOutput(value: string, redactions: string[]): string {
  let output = value;
  for (const redaction of redactions) {
    output = output.replaceAll(redaction, "[redacted]");
  }
  return output;
}

function errorSummary(result: BuilderCommandResult): string {
  const lines = [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.at(-1) ?? "command failed";
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function sanitizeError(error: unknown, env: NodeJS.ProcessEnv): string {
  let message = error instanceof Error ? error.message : String(error);

  for (const key of ["GITHUB_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    const value = envValue(env, key);
    if (value) {
      message = message.replaceAll(value, "[redacted]");
    }
  }

  return message;
}

function validateRequiredString(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} requires a value`);
  }
}

type ParseResult =
  | {
      ok: true;
      value: BuilderRepoCreateReport;
    }
  | {
      ok: false;
      message: string;
    };

function parseRemoteBuilderRepoCreateReport(stdout: string): ParseResult {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "remote Builder repo create returned invalid JSON" };
    }

    const report = parsed as BuilderRepoCreateReport;
    if (typeof report.ready !== "boolean" || !Array.isArray(report.blockers) || !report.repository) {
      return { ok: false, message: "remote Builder repo create did not return a report" };
    }

    return {
      ok: true,
      value: report,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `remote Builder repo create returned invalid JSON: ${message}`,
    };
  }
}

function summarizeOutput(result: { stdout: string; stderr: string }): string | undefined {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return output.length > 0 ? output : undefined;
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
