import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import { parseGitHubRepo } from "./client.js";
import { shellQuote, validateWorkspaceRoot, workspaceRootPrelude } from "../remote/paths.js";

export type GitHubCheckStatus = "pass" | "warn" | "fail";

export interface GitHubControlCheck {
  name: string;
  status: GitHubCheckStatus;
  summary: string;
  details?: string | undefined;
}

export interface GitHubCheckOptions {
  host: string;
  workspaceRoot: string;
  repo?: string | undefined;
  runner?: RemoteCommandRunner | undefined;
}

export interface GitHubCheckReport {
  host: string;
  workspaceRoot: string;
  ready: boolean;
  checks: GitHubControlCheck[];
  blockers: string[];
  warnings: string[];
  details?: string | undefined;
}

export async function runGitHubCheck(options: GitHubCheckOptions): Promise<GitHubCheckReport> {
  validateHost(options.host);
  validateWorkspaceRoot(options.workspaceRoot);
  if (options.repo) {
    parseGitHubRepo(options.repo);
  }

  const runner = options.runner ?? createSshRunner(options.host);
  const result = await runner(githubCheckRemoteCommand(options.workspaceRoot, options.repo));
  const parsed = parseRemoteReport(result.stdout);

  if (parsed.ok) {
    return createReport(options.host, options.workspaceRoot, parsed.checks);
  }

  const summary = firstLine(result.stderr) || parsed.message || firstLine(result.stdout) || "GitHub check failed";
  const report = createReport(options.host, options.workspaceRoot, [
    {
      name: "GitHub check",
      status: "fail",
      summary,
    },
  ]);
  const details = summarizeOutput(result);
  if (details) {
    report.details = details;
  }
  return report;
}

function createReport(host: string, workspaceRoot: string, checks: GitHubControlCheck[]): GitHubCheckReport {
  const blockers = checks
    .filter((check) => check.status === "fail")
    .map((check) => `${check.name}: ${check.summary}`);
  const warnings = checks
    .filter((check) => check.status === "warn")
    .map((check) => `${check.name}: ${check.summary}`);

  return {
    host,
    workspaceRoot,
    ready: blockers.length === 0,
    checks,
    blockers,
    warnings,
  };
}

function githubCheckRemoteCommand(workspaceRoot: string, repo: string | undefined): string {
  return [
    workspaceRootPrelude(workspaceRoot),
    'env_file="$root/config/vampyre.env"',
    'if [ ! -f "$env_file" ]; then',
    '  printf \'{"checks":[{"name":"GitHub auth","status":"fail","summary":"env file missing"}]}\\n\'',
    "  exit 0",
    "fi",
    "set -a",
    '. "$env_file"',
    "set +a",
    `VAMPYRE_WORKSPACE_ROOT="$root" VAMPYRE_GITHUB_REPO=${shellQuote(repo ?? "")} node --input-type=module <<'NODE'`,
    'import { readFile } from "node:fs/promises";',
    "",
    'const root = process.env.VAMPYRE_WORKSPACE_ROOT ?? "";',
    'const requestedRepo = process.env.VAMPYRE_GITHUB_REPO ?? "";',
    "const checks = [];",
    "",
    "function add(name, status, summary, details) {",
    "  const check = { name, status, summary };",
    "  if (details) check.details = details;",
    "  checks.push(check);",
    "}",
    "",
    "function finish() {",
    "  console.log(JSON.stringify({ checks }));",
    "  process.exitCode = checks.some((check) => check.status === \"fail\") ? 10 : 0;",
    "}",
    "",
    "function failureSummary(response, body) {",
    "  const message = body && typeof body.message === \"string\" ? body.message : response.statusText;",
    "  return `HTTP ${response.status}${message ? `: ${message}` : \"\"}`;",
    "}",
    "",
    "async function github(path) {",
    '  const response = await fetch(`https://api.github.com${path}`, {',
    '    headers: {',
    '      accept: "application/vnd.github+json",',
    '      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,' ,
    '      "user-agent": "vampyre-mvp",',
    '      "x-github-api-version": "2022-11-28"',
    "    }",
    "  });",
    "  const body = await response.json().catch(() => ({}));",
    "  return { response, body };",
    "}",
    "",
    "function validRepoName(value) {",
    "  return /^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/.test(value);",
    "}",
    "",
    "async function registryRepos() {",
    "  if (requestedRepo) return [requestedRepo];",
    "  try {",
    "    const registry = JSON.parse(await readFile(`${root}/config/project-registry.json`, \"utf8\"));",
    "    const projects = Array.isArray(registry.projects) ? registry.projects : [];",
    "    return [...new Set(projects.map((project) => project.githubRepo).filter((value) => typeof value === \"string\" && value.length > 0))];",
    "  } catch (error) {",
    '    add("Project Registry", "warn", "registry unavailable for repo access checks");',
    "    return [];",
    "  }",
    "}",
    "",
    "if (!process.env.GITHUB_TOKEN) {",
    '  add("GitHub auth", "fail", "GITHUB_TOKEN is missing");',
    "  finish();",
    "} else {",
    '  const auth = await github("/user");',
    "  if (!auth.response.ok) {",
    '    add("GitHub auth", "fail", failureSummary(auth.response, auth.body));',
    "    finish();",
    "  } else {",
    '    add("GitHub auth", "pass", "authenticated");',
    "    const repos = await registryRepos();",
    "    if (repos.length === 0) {",
    '      add("GitHub repo access", "warn", "no GitHub repos configured for access checks");',
    "    }",
    "    for (const repo of repos) {",
    "      if (!validRepoName(repo)) {",
    '        add(`GitHub repo ${repo}`, "fail", "repo must use owner/name format");',
    "        continue;",
    "      }",
    "      const [owner, name] = repo.split(\"/\");",
    "      const repoResult = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);",
    "      if (!repoResult.response.ok) {",
    "        add(`GitHub repo ${repo}`, \"fail\", failureSummary(repoResult.response, repoResult.body));",
    "        continue;",
    "      }",
    "      const visibility = repoResult.body.private === true ? \"private\" : \"public\";",
    "      const permissions = repoResult.body.permissions && typeof repoResult.body.permissions === \"object\"",
    "        ? Object.entries(repoResult.body.permissions).filter(([, allowed]) => allowed === true).map(([key]) => key).sort().join(\",\")",
    "        : \"unreported\";",
    "      add(`GitHub repo ${repo}`, \"pass\", `accessible:${visibility}`, `permissions:${permissions}`);",
    "    }",
    "    finish();",
    "  }",
    "}",
    "NODE",
  ].join("\n");
}

type ParseResult =
  | {
      ok: true;
      checks: GitHubControlCheck[];
    }
  | {
      ok: false;
      message: string;
    };

function parseRemoteReport(stdout: string): ParseResult {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "remote GitHub check returned invalid JSON" };
    }

    const checks = (parsed as Record<string, unknown>)["checks"];
    if (!Array.isArray(checks)) {
      return { ok: false, message: "remote GitHub check did not return checks" };
    }

    return {
      ok: true,
      checks: checks.map(readCheck),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `remote GitHub check returned invalid JSON: ${message}`,
    };
  }
}

function readCheck(value: unknown): GitHubControlCheck {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("remote GitHub check item must be an object");
  }
  const object = value as Record<string, unknown>;
  const status = object["status"];
  if (status !== "pass" && status !== "warn" && status !== "fail") {
    throw new Error("remote GitHub check item has invalid status");
  }

  const check: GitHubControlCheck = {
    name: readString(object, "name"),
    status,
    summary: readString(object, "summary"),
  };
  const details = object["details"];
  if (typeof details === "string" && details.length > 0) {
    check.details = details;
  }
  return check;
}

function readString(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`remote GitHub check item has invalid ${key}`);
  }
  return value;
}

function summarizeOutput(result: { stdout: string; stderr: string }): string | undefined {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return output.length > 0 ? output : undefined;
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
