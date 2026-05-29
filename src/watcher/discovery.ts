import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import {
  createGitHubClient,
  listOpenGitHubIssues,
  listOpenGitHubPullRequests,
  type GitHubClient,
  type GitHubFetch,
  type GitHubIssueSummary,
  type GitHubPullRequestSummary,
} from "../github/client.js";
import { loadProjectRegistry, type ProjectProfile } from "../registry/projectRegistry.js";
import { shellQuote, validateWorkspaceRoot, workspacePath, workspaceRootPrelude } from "../remote/paths.js";

export interface WatcherDiscoveryOptions {
  host: string;
  workspaceRoot: string;
  projectId?: string | undefined;
  local?: boolean | undefined;
  now?: (() => Date) | undefined;
  runner?: RemoteCommandRunner | undefined;
  commandRunner?: WatcherCommandRunner | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  githubClient?: GitHubClient | undefined;
  githubFetch?: GitHubFetch | undefined;
}

export interface WatcherDiscoveryReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  blockers: string[];
  generatedAt: string;
  project?: WatcherDiscoveryProject | undefined;
  repository?: WatcherDiscoveryRepository | undefined;
  purpose?: string | undefined;
  docs?: WatcherDiscoveryDocs | undefined;
  validation?: WatcherDiscoveryValidation | undefined;
  github?: WatcherDiscoveryGitHub | undefined;
  firstSafeImprovement?: WatcherDiscoveryImprovement | undefined;
  proof: string[];
  reportPaths?: WatcherDiscoveryReportPaths | undefined;
  details?: string | undefined;
}

export interface WatcherDiscoveryProject {
  id: string;
  displayName: string;
  mode: string;
  githubRepo: string;
}

export interface WatcherDiscoveryRepository {
  path: string;
  currentBranch: string;
  commit: string;
  dirty: boolean;
  rootFiles: string[];
  configFiles: string[];
  appStructure: string[];
}

export interface WatcherDiscoveryDocs {
  context: WatcherDocPresence;
  status: WatcherDocPresence;
  roadmap: WatcherDocPresence;
}

export interface WatcherDocPresence {
  path: string;
  present: boolean;
}

export interface WatcherDiscoveryValidation {
  packageManager?: string | undefined;
  commands: string[];
  blocker?: string | undefined;
}

export interface WatcherDiscoveryGitHub {
  openIssues: WatcherGitHubItem[];
  openPullRequests: WatcherGitHubPullRequest[];
}

export interface WatcherGitHubItem {
  number: number;
  title: string;
  url: string;
  labels: string[];
}

export interface WatcherGitHubPullRequest extends WatcherGitHubItem {
  draft: boolean;
  headRef: string;
  baseRef: string;
}

export interface WatcherDiscoveryImprovement {
  title: string;
  reason: string;
  nextAction: string;
}

export interface WatcherDiscoveryReportPaths {
  markdown: string;
  json: string;
}

export interface WatcherCommandSpec {
  command: string;
  args: string[];
  cwd?: string | undefined;
}

export interface WatcherCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type WatcherCommandRunner = (spec: WatcherCommandSpec) => Promise<WatcherCommandResult>;

interface RepoInspection {
  repository: WatcherDiscoveryRepository;
  purpose: string;
  docs: WatcherDiscoveryDocs;
  validation: WatcherDiscoveryValidation;
  proof: string[];
}

interface PackageJsonSummary {
  name?: string | undefined;
  description?: string | undefined;
  scripts: Record<string, string>;
}

const DEFAULT_PROJECT_ID = "palette-wow";
const MAX_README_CHARS = 12000;

export async function runWatcherDiscovery(options: WatcherDiscoveryOptions): Promise<WatcherDiscoveryReport> {
  validateWorkspaceRoot(options.workspaceRoot);

  if (options.local === true) {
    return runLocalWatcherDiscovery(options);
  }

  validateHost(options.host);
  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(watcherDiscoveryRemoteCommand(options.host, options.workspaceRoot, projectId(options)));
  const parsed = parseRemoteWatcherDiscoveryReport(result.stdout);

  if (parsed.ok) {
    return {
      ...parsed.value,
      host: options.host,
      workspaceRoot: options.workspaceRoot,
    };
  }

  const summary =
    firstLine(result.stderr) || parsed.message || firstLine(result.stdout) || "remote watcher discovery failed";
  const report: WatcherDiscoveryReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: [`Watcher discovery: ${summary}`],
    generatedAt: nowIso(options),
    proof: [],
  };
  const details = summarizeOutput(result);
  if (details) {
    report.details = details;
  }
  return report;
}

export function formatWatcherDiscoveryReport(report: WatcherDiscoveryReport): string {
  const lines: string[] = [
    "Vampyre watcher discovery",
    `Host: ${report.host}`,
    `Workspace Root: ${report.workspaceRoot}`,
    `Generated At: ${report.generatedAt}`,
    "",
  ];

  if (report.project) {
    lines.push(`Project: ${report.project.displayName} (${report.project.id})`);
    lines.push(`Mode: ${report.project.mode}`);
    lines.push(`GitHub: ${report.project.githubRepo}`);
  }

  if (report.repository) {
    lines.push("");
    lines.push("Repository:");
    lines.push(`  Path: ${report.repository.path}`);
    lines.push(`  Branch: ${report.repository.currentBranch}`);
    lines.push(`  Commit: ${report.repository.commit}`);
    lines.push(`  Dirty: ${report.repository.dirty ? "yes" : "no"}`);
    lines.push(`  Config Files: ${formatList(report.repository.configFiles)}`);
    lines.push(`  App Structure: ${formatList(report.repository.appStructure)}`);
  }

  if (report.purpose) {
    lines.push("");
    lines.push(`Purpose: ${report.purpose}`);
  }

  if (report.docs) {
    lines.push("");
    lines.push("Repo Docs:");
    lines.push(`  ${formatDocPresence(report.docs.context)}`);
    lines.push(`  ${formatDocPresence(report.docs.status)}`);
    lines.push(`  ${formatDocPresence(report.docs.roadmap)}`);
  }

  if (report.validation) {
    lines.push("");
    lines.push("Validation:");
    if (report.validation.packageManager) {
      lines.push(`  Package Manager: ${report.validation.packageManager}`);
    }
    if (report.validation.commands.length > 0) {
      for (const command of report.validation.commands) {
        lines.push(`  - ${command}`);
      }
    } else {
      lines.push(`  Blocker: ${report.validation.blocker ?? "no validation command inferred"}`);
    }
  }

  if (report.github) {
    lines.push("");
    lines.push(`Open Issues: ${report.github.openIssues.length}`);
    for (const issue of report.github.openIssues.slice(0, 5)) {
      lines.push(`  - #${issue.number} ${issue.title}`);
    }
    lines.push(`Open PRs: ${report.github.openPullRequests.length}`);
    for (const pull of report.github.openPullRequests.slice(0, 5)) {
      lines.push(`  - #${pull.number} ${pull.title} (${pull.headRef} -> ${pull.baseRef})`);
    }
  }

  if (report.firstSafeImprovement) {
    lines.push("");
    lines.push("First Safe Improvement:");
    lines.push(`  Title: ${report.firstSafeImprovement.title}`);
    lines.push(`  Reason: ${report.firstSafeImprovement.reason}`);
    lines.push(`  Next Action: ${report.firstSafeImprovement.nextAction}`);
  }

  if (report.reportPaths) {
    lines.push("");
    lines.push("Report Files:");
    lines.push(`  Markdown: ${report.reportPaths.markdown}`);
    lines.push(`  JSON: ${report.reportPaths.json}`);
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

export function watcherDiscoveryReportToJson(report: WatcherDiscoveryReport): string {
  return JSON.stringify(report, null, 2);
}

async function runLocalWatcherDiscovery(options: WatcherDiscoveryOptions): Promise<WatcherDiscoveryReport> {
  const generatedAt = nowIso(options);
  const registry = await loadProjectRegistry(options.workspaceRoot);
  const profile = registry.registry.projects.find((candidate) => candidate.id === projectId(options));

  if (!profile) {
    return baseReport(options, generatedAt, {
      blockers: [`Project Registry: project ${projectId(options)} is missing`],
    });
  }

  const target = watcherProject(profile);
  if (!target.ok) {
    return baseReport(options, generatedAt, {
      blockers: [target.blocker],
    });
  }

  const project = target.value;
  const env = options.env ?? process.env;
  const token = envValue(env, "GITHUB_TOKEN");
  if (!token && !options.githubClient) {
    return baseReport(options, generatedAt, {
      project,
      blockers: ["GitHub: GITHUB_TOKEN is missing"],
    });
  }

  const commandRunner = options.commandRunner ?? runLocalCommand;
  const repoPath = workspacePath(options.workspaceRoot, "repos", project.id);
  const cloneResult = await ensureRuntimeRepo({
    repo: project.githubRepo,
    repoPath,
    token,
    commandRunner,
  });
  if (!cloneResult.ok) {
    return baseReport(options, generatedAt, {
      project,
      blockers: [cloneResult.blocker],
    });
  }

  const inspection = await inspectRepository({
    repoPath,
    commandRunner,
  });
  const githubClient = options.githubClient ?? createGitHubClient({ token: token ?? "", fetchImpl: options.githubFetch });
  const github = await inspectGitHub(githubClient, project.githubRepo);
  const report = baseReport(options, generatedAt, {
    project,
    repository: inspection.repository,
    purpose: inspection.purpose,
    docs: inspection.docs,
    validation: inspection.validation,
    github,
    firstSafeImprovement: firstSafeImprovement(inspection, github),
    proof: [
      ...cloneResult.proof,
      ...inspection.proof,
      `Checked GitHub open issues and pull requests for ${project.githubRepo}`,
    ],
  });

  const readyReport: WatcherDiscoveryReport = {
    ...report,
    ready: report.blockers.length === 0,
  };
  const reportPaths = await writeDiscoveryReports(options.workspaceRoot, project.id, readyReport);
  return {
    ...readyReport,
    reportPaths,
  };
}

function watcherDiscoveryRemoteCommand(host: string, workspaceRoot: string, requestedProjectId: string): string {
  return `
${workspaceRootPrelude(workspaceRoot)}
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
node "$cli" watcher discover --local --json --host ${shellQuote(host)} --workspace-root "$root" --project ${shellQuote(requestedProjectId)}
`;
}

function projectId(options: WatcherDiscoveryOptions): string {
  return options.projectId ?? DEFAULT_PROJECT_ID;
}

function nowIso(options: Pick<WatcherDiscoveryOptions, "now">): string {
  return (options.now ?? (() => new Date()))().toISOString();
}

type WatcherProjectResult =
  | {
      ok: true;
      value: WatcherDiscoveryProject;
    }
  | {
      ok: false;
      blocker: string;
    };

function watcherProject(profile: ProjectProfile): WatcherProjectResult {
  if (profile.mode !== "safe-watcher") {
    return {
      ok: false,
      blocker: `Project ${profile.displayName}: Watcher Discovery requires a Safe/Watcher project`,
    };
  }

  if (!profile.githubRepo) {
    return {
      ok: false,
      blocker: `Project ${profile.displayName}: no GitHub repository is configured`,
    };
  }

  return {
    ok: true,
    value: {
      id: profile.id,
      displayName: profile.displayName,
      mode: "Safe/Watcher",
      githubRepo: profile.githubRepo,
    },
  };
}

type EnsureRepoResult =
  | {
      ok: true;
      proof: string[];
    }
  | {
      ok: false;
      blocker: string;
    };

async function ensureRuntimeRepo(options: {
  repo: string;
  repoPath: string;
  token?: string | undefined;
  commandRunner: WatcherCommandRunner;
}): Promise<EnsureRepoResult> {
  await mkdir(dirname(options.repoPath), { recursive: true });
  const gitDirExists = await pathExists(join(options.repoPath, ".git"));
  const authArgs = gitAuthArgs(options.token);
  const redactions = gitAuthRedactions(options.token);
  const proof: string[] = [];

  if (!gitDirExists) {
    const clone = await options.commandRunner({
      command: "git",
      args: [...authArgs, "clone", `https://github.com/${options.repo}.git`, options.repoPath],
    });
    if (clone.exitCode !== 0) {
      return {
        ok: false,
        blocker: `Git clone: ${sanitizeOutput(errorSummary(clone), redactions)}`,
      };
    }
    proof.push(`Cloned ${options.repo} into runtime workspace path ${options.repoPath}`);
  } else {
    const fetch = await options.commandRunner({
      command: "git",
      args: [...authArgs, "-C", options.repoPath, "fetch", "--prune", "origin"],
    });
    if (fetch.exitCode !== 0) {
      return {
        ok: false,
        blocker: `Git fetch: ${sanitizeOutput(errorSummary(fetch), redactions)}`,
      };
    }
    proof.push(`Fetched existing runtime workspace clone at ${options.repoPath}`);

    const sync = await syncRuntimeRepoToOriginMain({
      repoPath: options.repoPath,
      commandRunner: options.commandRunner,
      redactions,
    });
    if (!sync.ok) {
      return sync;
    }
    proof.push(...sync.proof);
  }

  return {
    ok: true,
    proof,
  };
}

async function syncRuntimeRepoToOriginMain(options: {
  repoPath: string;
  commandRunner: WatcherCommandRunner;
  redactions: string[];
}): Promise<EnsureRepoResult> {
  const status = await options.commandRunner({
    command: "git",
    args: ["-C", options.repoPath, "status", "--porcelain"],
  });
  if (status.exitCode !== 0) {
    return {
      ok: false,
      blocker: `Git status: ${sanitizeOutput(errorSummary(status), options.redactions)}`,
    };
  }

  if (status.stdout.trim().length > 0) {
    return {
      ok: false,
      blocker: "Git sync: runtime workspace clone has uncommitted changes; refusing to update before discovery",
    };
  }

  const checkout = await options.commandRunner({
    command: "git",
    args: ["-C", options.repoPath, "checkout", "main"],
  });
  if (checkout.exitCode !== 0) {
    return {
      ok: false,
      blocker: `Git checkout main: ${sanitizeOutput(errorSummary(checkout), options.redactions)}`,
    };
  }

  const merge = await options.commandRunner({
    command: "git",
    args: ["-C", options.repoPath, "merge", "--ff-only", "origin/main"],
  });
  if (merge.exitCode !== 0) {
    return {
      ok: false,
      blocker: `Git fast-forward origin/main: ${sanitizeOutput(errorSummary(merge), options.redactions)}`,
    };
  }

  return {
    ok: true,
    proof: [`Fast-forwarded runtime workspace clone at ${options.repoPath} to origin/main`],
  };
}

async function inspectRepository(options: {
  repoPath: string;
  commandRunner: WatcherCommandRunner;
}): Promise<RepoInspection> {
  const [branch, commit, statusResult] = await Promise.all([
    gitText(options.commandRunner, options.repoPath, ["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    gitText(options.commandRunner, options.repoPath, ["rev-parse", "--short", "HEAD"], "unknown"),
    options.commandRunner({ command: "git", args: ["-C", options.repoPath, "status", "--porcelain"] }),
  ]);
  const rootEntries = await readdir(options.repoPath, { withFileTypes: true });
  const rootFiles = rootEntries.map((entry) => entry.name).filter((name) => name !== ".git").sort();
  const configFiles = rootFiles.filter(isConfigFile);
  const packageJson = await readPackageJson(join(options.repoPath, "package.json"));
  const readme = await readReadme(options.repoPath, rootFiles);
  const docs = await docsPresence(options.repoPath);
  const validation = inferValidation(packageJson, rootFiles);
  const appStructure = await inspectAppStructure(options.repoPath);

  return {
    repository: {
      path: options.repoPath,
      currentBranch: branch,
      commit,
      dirty: statusResult.stdout.trim().length > 0,
      rootFiles,
      configFiles,
      appStructure,
    },
    purpose: inferPurpose(readme, packageJson),
    docs,
    validation,
    proof: [
      "Read repository README when present",
      "Inspected package/config files at repository root",
      "Inspected app structure directories",
      "Checked repo-local CONTEXT.md, docs/STATUS.md, and docs/ROADMAP.md presence",
      "Inferred validation commands from package manager and project files",
    ],
  };
}

async function inspectGitHub(client: GitHubClient, repo: string): Promise<WatcherDiscoveryGitHub> {
  const [issues, pulls] = await Promise.all([listOpenGitHubIssues(client, repo), listOpenGitHubPullRequests(client, repo)]);
  return {
    openIssues: issues.map(githubIssue),
    openPullRequests: pulls.map(githubPullRequest),
  };
}

function githubIssue(issue: GitHubIssueSummary): WatcherGitHubItem {
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    labels: issue.labels,
  };
}

function githubPullRequest(pull: GitHubPullRequestSummary): WatcherGitHubPullRequest {
  return {
    number: pull.number,
    title: pull.title,
    url: pull.url,
    labels: [],
    draft: pull.draft,
    headRef: pull.headRef,
    baseRef: pull.baseRef,
  };
}

function inferPurpose(readme: string | undefined, packageJson: PackageJsonSummary | undefined): string {
  if (readme) {
    const heading = readme
      .split("\n")
      .map((line) => line.trim().replace(/^>\s?/, "").trim())
      .find((line) => line.startsWith("# ") && line.replace(/^#\s+/, "").length > 0);
    const paragraph = firstMeaningfulParagraph(readme);
    const parts = [heading?.replace(/^#\s+/, ""), paragraph].filter((part): part is string => Boolean(part));
    if (parts.length > 0) {
      return parts.join(" - ");
    }
  }

  if (packageJson?.description) {
    return packageJson.description;
  }

  if (packageJson?.name) {
    return `Package ${packageJson.name}; no README purpose text found.`;
  }

  return "No README purpose text or package description found.";
}

function firstMeaningfulParagraph(readme: string): string | undefined {
  const paragraphs = readme.split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const normalized = paragraph
      .split("\n")
      .map((line) => line.trim().replace(/^>\s?/, "").trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("[!") && !line.startsWith("!"))
      .join(" ");
    if (normalized.length > 0) {
      return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
    }
  }

  return undefined;
}

function inferValidation(
  packageJson: PackageJsonSummary | undefined,
  rootFiles: string[],
): WatcherDiscoveryValidation {
  if (rootFiles.includes("Gemfile")) {
    return inferRailsValidation(rootFiles);
  }

  const packageManager = inferPackageManager(rootFiles);
  const commands: string[] = [];

  if (packageJson) {
    for (const script of ["test", "typecheck", "lint", "build", "check"]) {
      if (packageJson.scripts[script]) {
        commands.push(`${packageManager} ${script}`);
      }
    }
  }

  if (commands.length === 0) {
    return {
      packageManager: packageJson ? packageManager : undefined,
      commands,
      blocker: packageJson
        ? "package.json exists, but no test/typecheck/lint/build/check scripts were found"
        : "no package.json was found, so no Node validation command could be inferred",
    };
  }

  return {
    packageManager,
    commands,
  };
}

function inferRailsValidation(rootFiles: string[]): WatcherDiscoveryValidation {
  const commands = ["bundle exec rails test"];

  if (rootFiles.includes("Rakefile")) {
    commands.push("bundle exec rails zeitwerk:check");
  }

  if (rootFiles.includes("package.json") || rootFiles.includes("Procfile.dev")) {
    commands.push("bundle exec rails assets:precompile");
  }

  return {
    packageManager: rootFiles.includes("Gemfile.lock") ? "bundler" : "bundler (Gemfile.lock missing)",
    commands,
  };
}

function inferPackageManager(rootFiles: string[]): string {
  if (rootFiles.includes("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (rootFiles.includes("yarn.lock")) {
    return "yarn";
  }
  if (rootFiles.includes("package-lock.json")) {
    return "npm run";
  }
  return "npm run";
}

function firstSafeImprovement(
  inspection: RepoInspection,
  github: WatcherDiscoveryGitHub,
): WatcherDiscoveryImprovement {
  const missingDocs = [inspection.docs.context, inspection.docs.status, inspection.docs.roadmap]
    .filter((doc) => !doc.present)
    .map((doc) => doc.path);

  if (missingDocs.length > 0) {
    return {
      title: `Add missing project truth docs: ${missingDocs.join(", ")}`,
      reason: "Safe/Watcher Mode needs repo-local project truth before it can make reliable daily forward-motion decisions.",
      nextAction: "Create these docs in an isolated worktree and open an Owner-reviewed PR.",
    };
  }

  if (inspection.validation.blocker) {
    return {
      title: "Turn the validation blocker into an explicit repo-local validation path",
      reason: inspection.validation.blocker,
      nextAction: "Use an isolated worktree to add or document the smallest validation command the current project stack supports.",
    };
  }

  if (github.openIssues.length > 0) {
    return {
      title: `Triage open issue #${github.openIssues[0]?.number ?? "unknown"} into the first Safe/Watcher PR candidate`,
      reason: "Open issue work is already user-facing project truth and can produce compounding product quality when scoped safely.",
      nextAction: "Inspect the issue in an isolated worktree, classify risk, run validation, and end with an Owner-reviewed PR if auto-safe.",
    };
  }

  return {
    title: "Add a Watcher status refresh with the inferred validation ladder",
    reason: "The project has no obvious open issue or doc blocker, so the lowest-risk forward motion is durable operational clarity.",
    nextAction: "Create a small PR that records current validation, app structure, and next safe maintenance target.",
  };
}

async function readReadme(repoPath: string, rootFiles: string[]): Promise<string | undefined> {
  const readmeName = rootFiles.find((name) => /^readme\.md$/i.test(name));
  if (!readmeName) {
    return undefined;
  }

  const content = await readFile(join(repoPath, readmeName), "utf8");
  return content.slice(0, MAX_README_CHARS);
}

async function readPackageJson(path: string): Promise<PackageJsonSummary | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const object = parsed as Record<string, unknown>;
    return {
      name: readOptionalString(object["name"]),
      description: readOptionalString(object["description"]),
      scripts: readScripts(object["scripts"]),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

function readScripts(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const scripts: Record<string, string> = {};
  for (const [key, script] of Object.entries(value)) {
    if (typeof script === "string" && script.trim().length > 0) {
      scripts[key] = script;
    }
  }
  return scripts;
}

async function docsPresence(repoPath: string): Promise<WatcherDiscoveryDocs> {
  const docs = {
    context: {
      path: "CONTEXT.md",
      present: await pathExists(join(repoPath, "CONTEXT.md")),
    },
    status: {
      path: "docs/STATUS.md",
      present: await pathExists(join(repoPath, "docs", "STATUS.md")),
    },
    roadmap: {
      path: "docs/ROADMAP.md",
      present: await pathExists(join(repoPath, "docs", "ROADMAP.md")),
    },
  };

  return docs;
}

async function inspectAppStructure(repoPath: string): Promise<string[]> {
  const candidates = [
    "app",
    "src",
    "pages",
    "components",
    "config",
    "db",
    "bin",
    "public",
    "lib",
    "server",
    "client",
    "tests",
    "test",
    "spec",
  ];
  const structure: string[] = [];

  for (const candidate of candidates) {
    const path = join(repoPath, candidate);
    if (!(await pathExists(path))) {
      continue;
    }

    structure.push(candidate);
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.slice(0, 12)) {
      structure.push(`${candidate}/${entry.name}${entry.isDirectory() ? "/" : ""}`);
    }
  }

  return structure.slice(0, 60);
}

function isConfigFile(name: string): boolean {
  return (
    [
      "package.json",
      "pnpm-lock.yaml",
      "package-lock.json",
      "yarn.lock",
      "Gemfile",
      "Gemfile.lock",
      "Rakefile",
      "config.ru",
      ".ruby-version",
      "tsconfig.json",
      "vite.config.ts",
      "vite.config.js",
      "next.config.js",
      "next.config.mjs",
      "tailwind.config.ts",
      "tailwind.config.js",
      "eslint.config.js",
      ".eslintrc",
      ".eslintrc.json",
    ].includes(name) || name.startsWith(".env.example")
  );
}

async function writeDiscoveryReports(
  workspaceRoot: string,
  selectedProjectId: string,
  report: WatcherDiscoveryReport,
): Promise<WatcherDiscoveryReportPaths> {
  const reportDir = workspacePath(workspaceRoot, "reports", "watcher-discovery", selectedProjectId);
  await mkdir(reportDir, { recursive: true, mode: 0o700 });
  const markdownPath = join(reportDir, "latest.md");
  const jsonPath = join(reportDir, "latest.json");
  const withPaths: WatcherDiscoveryReport = {
    ...report,
    reportPaths: {
      markdown: markdownPath,
      json: jsonPath,
    },
  };
  await writeFile(markdownPath, discoveryMarkdown(withPaths), { mode: 0o644 });
  await writeFile(jsonPath, `${watcherDiscoveryReportToJson(withPaths)}\n`, { mode: 0o644 });
  return withPaths.reportPaths!;
}

function discoveryMarkdown(report: WatcherDiscoveryReport): string {
  const lines: string[] = [
    `# Watcher Discovery Pass: ${report.project?.displayName ?? "unknown project"}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Purpose",
    "",
    report.purpose ?? "Unknown.",
    "",
    "## Current Status",
    "",
  ];

  if (report.repository) {
    lines.push(`- Runtime clone: ${report.repository.path}`);
    lines.push(`- Branch: ${report.repository.currentBranch}`);
    lines.push(`- Commit: ${report.repository.commit}`);
    lines.push(`- Dirty working tree: ${report.repository.dirty ? "yes" : "no"}`);
  }

  if (report.github) {
    lines.push(`- Open GitHub issues: ${report.github.openIssues.length}`);
    lines.push(`- Open GitHub PRs: ${report.github.openPullRequests.length}`);
  }

  lines.push("", "## Validation", "");
  if (report.validation?.commands.length) {
    for (const command of report.validation.commands) {
      lines.push(`- \`${command}\``);
    }
  } else {
    lines.push(`- Blocker: ${report.validation?.blocker ?? "no validation command inferred"}`);
  }

  lines.push("", "## First Safe Improvement", "");
  if (report.firstSafeImprovement) {
    lines.push(`- Title: ${report.firstSafeImprovement.title}`);
    lines.push(`- Reason: ${report.firstSafeImprovement.reason}`);
    lines.push(`- Next action: ${report.firstSafeImprovement.nextAction}`);
  } else {
    lines.push("- None identified.");
  }

  lines.push("", "## Proof", "");
  for (const proof of report.proof) {
    lines.push(`- ${proof}`);
  }

  if (report.blockers.length > 0) {
    lines.push("", "## Command Blockers", "");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function baseReport(
  options: WatcherDiscoveryOptions,
  generatedAt: string,
  fields: {
    blockers?: string[] | undefined;
    project?: WatcherDiscoveryProject | undefined;
    repository?: WatcherDiscoveryRepository | undefined;
    purpose?: string | undefined;
    docs?: WatcherDiscoveryDocs | undefined;
    validation?: WatcherDiscoveryValidation | undefined;
    github?: WatcherDiscoveryGitHub | undefined;
    firstSafeImprovement?: WatcherDiscoveryImprovement | undefined;
    proof?: string[] | undefined;
  },
): WatcherDiscoveryReport {
  const report: WatcherDiscoveryReport = {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    ready: false,
    blockers: fields.blockers ?? [],
    generatedAt,
    proof: fields.proof ?? [],
  };

  if (fields.project) {
    report.project = fields.project;
  }
  if (fields.repository) {
    report.repository = fields.repository;
  }
  if (fields.purpose) {
    report.purpose = fields.purpose;
  }
  if (fields.docs) {
    report.docs = fields.docs;
  }
  if (fields.validation) {
    report.validation = fields.validation;
  }
  if (fields.github) {
    report.github = fields.github;
  }
  if (fields.firstSafeImprovement) {
    report.firstSafeImprovement = fields.firstSafeImprovement;
  }

  return report;
}

async function gitText(
  commandRunner: WatcherCommandRunner,
  repoPath: string,
  args: string[],
  fallback: string,
): Promise<string> {
  const result = await commandRunner({
    command: "git",
    args: ["-C", repoPath, ...args],
  });
  return result.exitCode === 0 && result.stdout.trim().length > 0 ? result.stdout.trim() : fallback;
}

async function runLocalCommand(spec: WatcherCommandSpec): Promise<WatcherCommandResult> {
  return new Promise<WatcherCommandResult>((resolve, reject) => {
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

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function formatDocPresence(doc: WatcherDocPresence): string {
  return `${doc.path}: ${doc.present ? "present" : "missing"}`;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
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

function errorSummary(result: WatcherCommandResult): string {
  const lines = [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("Cloning into "));

  return lines.at(-1) ?? "command failed";
}

function summarizeOutput(result: { stdout: string; stderr: string }): string | undefined {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return output.length > 0 ? output : undefined;
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

type ParseResult =
  | {
      ok: true;
      value: WatcherDiscoveryReport;
    }
  | {
      ok: false;
      message: string;
    };

function parseRemoteWatcherDiscoveryReport(stdout: string): ParseResult {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "remote watcher discovery returned invalid JSON" };
    }

    return {
      ok: true,
      value: parsed as WatcherDiscoveryReport,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `remote watcher discovery returned invalid JSON: ${message}`,
    };
  }
}
