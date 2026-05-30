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

function pinmarkProjectFiles(now: Date): Record<string, string> {
  const date = now.toISOString().slice(0, 10);
  return {
    "README.md": `# Pinmark

Pinmark is a local-first macOS screenshot tool for capturing, marking up, redacting, pinning, OCRing, and exporting polished screenshots without a cloud account.

The private initial baseline is focused on the native capture and markup loop before uploads, team workflows, recording, or public launch.

## Current Target

- Native macOS app using Swift, SwiftUI, and AppKit where needed.
- Local history and settings stored on device.
- Screen Recording permission flow that explains exactly what the app needs.
- Capture, annotate, redact, pin, copy, save, and export polished screenshots.

## Project Docs

- [CONTEXT.md](CONTEXT.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/STATUS.md](docs/STATUS.md)
`,
    "CONTEXT.md": `# Pinmark Context

Pinmark is a private Builder Mode project created from Vampyre's approved screenshot-tool direction.

## Product

Pinmark is a fast local-first screenshot markup desk for Mac users who want to capture, redact, pin, annotate, OCR, and export polished screenshots without creating a cloud account.

## Initial Technical Direction

- Platform: macOS
- Language: Swift
- UI: SwiftUI for primary surfaces, AppKit where needed for menu-bar behavior, floating panels, capture overlays, and editor windows
- Capture: native macOS capture path, with ScreenCaptureKit evaluated early
- OCR: Apple Vision
- Shortcuts: KeyboardShortcuts package candidate
- Updates: Sparkle deferred until direct-distribution packaging is needed
- Storage: local application support directory for history and settings
- Secrets: none for the initial baseline

## Boundaries

- Keep the first baseline private until a Launch Visibility Gate approves public visibility.
- Optimize the local capture, markup, redaction, pinning, and export loop before cloud sharing.
- Do not add uploads, accounts, team collaboration, recording, GIF export, scrolling capture, AI redaction, or public marketing in the initial baseline.
`,
    "docs/ROADMAP.md": `# Pinmark Roadmap

## Initial Baseline Goal

Build a private native macOS app that can capture screenshots, explain permissions, annotate and redact captures, pin an image, keep local history, and export to clipboard or file.

## Phase 0 - Project Contract And Swift Foundation

Outcome: the repository exists, project truth is recorded, and a small Swift package foundation is in place.

- Create README, context, roadmap, status, and ADRs.
- Add a Swift package foundation that can hold local-first capture and export domain code.
- Keep the repository private.

Exit criteria:

- Main branch exists with project docs and a compilable Swift package foundation.

## Phase 1 - Native App Shell

Outcome: the app launches as a private macOS menu-bar utility with explicit permission states.

- Create the Xcode app target.
- Add menu-bar entry point and settings/about surfaces.
- Add Screen Recording permission explanation and missing-permission state.
- Decide the first capture API path after a focused spike.

## Phase 2 - Capture And Markup Loop

Outcome: the app can capture an image and open it in a markup editor.

- Region or full-screen capture path.
- Editor shell with crop, arrow, rectangle, text, highlighter, and blur or pixelate redaction.
- Clipboard and file export.

## Phase 3 - Pinning, History, And Polish

Outcome: Pinmark feels useful for real daily screenshot work.

- Floating pin window for a captured image.
- Local history list with copy, reveal, and delete.
- Polished export preset with padding, background, and shadow.
- OCR spike with Apple Vision.

## Deferred Until After Initial Baseline

- Upload destinations or share links.
- Cloud accounts.
- Team collaboration.
- Screen recording or GIF export.
- Scrolling capture.
- AI redaction.
- Public launch.
`,
    "docs/STATUS.md": `# Pinmark Status

## Current phase

Phase 0 - Project Contract And Swift Foundation.

## Current state

- Private GitHub repository created from Vampyre's approved Pinmark Repo Plan.
- Project Contract files exist: README, CONTEXT, roadmap, status, and ADRs.
- Swift package foundation exists for early local-first domain code.
- Native Xcode app shell has not been created yet.

## Next action

Create the native macOS app shell with a menu-bar entry point and Screen Recording permission explanation, then verify the app on a Mac/Xcode-capable environment.

## Blockers

- macOS app build validation requires a Mac/Xcode-capable environment; the Vampyre runtime host is not the right build target for native macOS validation.

## Latest proof

- Repository initialized on ${date}.
- Initial branch: main.
- Initial validation target: swift test.
`,
    "docs/adr/0001-build-native-local-first-macos-app.md": `# Build a native local-first macOS app

Pinmark will start as a native macOS app using Swift, SwiftUI, and AppKit where platform integration requires it.

## Consequences

- The capture, permission, menu-bar, floating panel, and editor loops should use macOS-native primitives.
- Local history and settings stay on device for the initial baseline.
- ScreenCaptureKit, Apple Vision, and AppKit capture/editor integration should be evaluated before adding non-native abstractions.
- Linux runtime hosts can manage repository work, but native app validation needs a Mac/Xcode-capable environment.
`,
    "docs/adr/0002-start-private-until-launch-visibility-gate.md": `# Start private until launch visibility gate

Pinmark will remain private during the Initial Baseline.

## Consequences

- The first repo is private by default.
- Public visibility waits until the app has a real baseline and the Owner approves a Launch Visibility Gate.
- Distribution, signing, notarization, Sparkle, pricing, and public marketing stay deferred until the local capture and markup loop is useful.
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
    "README.md": `# MiniMark

MiniMark is a private no-permission macOS markdown scratchpad with a split editor and preview, auto-save, .md export, and recent documents.

The first baseline is intentionally small and deterministic so Vampyre can keep improving it through fast hosted macOS validation without Screen Recording, Accessibility, Camera, Microphone, Photos, Contacts, Calendar, Location, Automation, or Full Disk Access prompts.

## Current Target

- Native macOS app using Swift and SwiftUI.
- Left-side markdown editor and right-side rendered preview.
- Auto-save drafts into app-owned local storage.
- Export to .md through an explicit user-chosen save location.
- Recent documents from app-owned storage.
- Deterministic screenshot-friendly sample document and settings states.

## Project Docs

- [CONTEXT.md](CONTEXT.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/STATUS.md](docs/STATUS.md)
`,
    "CONTEXT.md": `# MiniMark Context

MiniMark is a private Builder Mode project created after pausing Pinmark until Vampyre has stronger native macOS permission and TCC test support.

## Product

MiniMark is a developer-leaning markdown scratchpad for quick local notes. It should feel useful with only app-owned storage and user-selected file export, which keeps validation deterministic and avoids macOS permission prompts.

## Initial Technical Direction

- Platform: macOS
- Language: Swift
- UI: SwiftUI
- Storage: app-owned Application Support storage for auto-saved drafts and recent documents
- Export: user-selected .md export through the standard save flow
- Markdown preview: start with a small deterministic renderer or platform-native attributed output before adopting heavier dependencies
- Validation: hosted macOS GitHub Actions for Swift tests first, then app launch and screenshot artifact once the native shell exists
- Secrets: none for the initial baseline

## No-Permission Boundary

MiniMark must not request Screen Recording, Accessibility, Camera, Microphone, Photos, Contacts, Calendar, Reminders, Location, Automation, Full Disk Access, or similar TCC-protected capabilities.

Use app-owned storage and explicit user-selected export only. If a proposed feature needs a permission prompt, defer it instead of adding it to the baseline.

## Boundaries

- Keep the first baseline private until a Launch Visibility Gate approves public visibility.
- Optimize editor, preview, autosave, export, recent documents, and deterministic validation before sync or sharing.
- Do not add cloud accounts, collaboration, AI features, menu-bar capture, screenshot capture, OCR, or permission-dependent integrations in the initial baseline.
`,
    "docs/ROADMAP.md": `# MiniMark Roadmap

## Initial Baseline Goal

Build a private native macOS markdown scratchpad that requires no TCC permissions and can be validated quickly through hosted macOS tests.

## Phase 0 - Project Contract And Swift Foundation

Outcome: the repository exists, project truth is recorded, and a small Swift package foundation is in place.

- Create README, context, roadmap, status, and ADRs.
- Add a Swift package foundation that records required app capabilities and forbidden permission classes.
- Add hosted macOS SwiftPM validation.
- Keep the repository private.

Exit criteria:

- Main branch exists with project docs, a compilable Swift package foundation, and a macOS validation workflow.

## Phase 1 - No-Permission App Shell

Outcome: the app launches without permission prompts and displays the core split scratchpad surface.

- Create the SwiftUI macOS app target.
- Add left-side markdown editor and right-side preview layout.
- Store drafts in app-owned local storage.
- Seed a deterministic sample document for repeatable screenshot tests.
- Confirm the app does not request TCC-protected permissions.

## Phase 2 - Scratchpad Workflow

Outcome: MiniMark can handle the daily local note loop.

- Auto-save draft edits.
- Recent documents list from app-owned storage.
- Export to .md through an explicit user save action.
- Basic settings for preview style and editor wrapping.
- Unit tests for markdown state and document persistence.

## Phase 3 - Deterministic Visual Proof

Outcome: Vampyre can attach a useful product screenshot after product-loop runs.

- Launch the app in hosted macOS validation without permission prompts.
- Render the deterministic sample document.
- Upload a GitHub Actions artifact named \`minimark-visual-proof\` containing \`minimark-product.png\`.
- Keep screenshot proof stable enough for quick visual review.

## Deferred Until After Initial Baseline

- Any permission-dependent feature.
- Cloud sync, accounts, sharing, or collaboration.
- AI-assisted editing.
- Screenshot capture, OCR, or screen annotation.
- Public launch.
`,
    "docs/STATUS.md": `# MiniMark Status

## Current phase

Phase 0 - Project Contract And Swift Foundation.

## Current state

- Private GitHub repository created from Vampyre's approved MiniMark repo plan.
- Project Contract files exist: README, CONTEXT, roadmap, status, and ADRs.
- Swift package foundation exists for early no-permission product constraints.
- Hosted macOS SwiftPM validation workflow exists.
- Native app shell has not been created yet.

## Next action

Create the first no-permission native macOS app shell: a SwiftUI split markdown editor/preview using app-owned local storage for auto-save, a deterministic sample document, and no TCC permission prompts. Keep export limited to explicit user-selected .md save flow.

## Blockers

- None for the current no-permission baseline. Do not add a feature that requires Screen Recording, Accessibility, Camera, Microphone, Photos, Contacts, Calendar, Location, Automation, or Full Disk Access.

## Latest proof

- Repository initialized on ${date}.
- Initial branch: main.
- Initial validation target: swift test through hosted macOS GitHub Actions.
`,
    "docs/adr/0001-build-native-no-permission-macos-app.md": `# Build a native no-permission macOS app

MiniMark will start as a native macOS app using Swift and SwiftUI, with a product boundary that avoids TCC-protected permissions.

## Consequences

- The first baseline should use only app-owned storage and user-selected .md export.
- Features requiring Screen Recording, Accessibility, Camera, Microphone, Photos, Contacts, Calendar, Location, Automation, Full Disk Access, or similar prompts are out of scope.
- Hosted macOS validation should be able to build, test, launch, and later capture screenshots without preconfigured permission state.
- Linux runtime hosts can manage repository work, but native app validation still runs on macOS GitHub Actions.
`,
    "docs/adr/0002-start-private-until-launch-visibility-gate.md": `# Start private until launch visibility gate

MiniMark will remain private during the Initial Baseline.

## Consequences

- The first repo is private by default.
- Public visibility waits until the app has a real no-permission baseline and the Owner approves a Launch Visibility Gate.
- Distribution, signing, notarization, pricing, and public marketing stay deferred until the scratchpad workflow is useful.
`,
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
