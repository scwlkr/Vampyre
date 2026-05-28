import { workspaceRootPrelude, validateWorkspaceRoot } from "../remote/paths.js";
import { createSshRunner, type RemoteCommandRunner } from "./ssh.js";

export type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  summary: string;
  details?: string | undefined;
}

export interface HostDoctorOptions {
  host: string;
  workspaceRoot: string;
  runner?: RemoteCommandRunner;
}

export interface HostDoctorReport {
  host: string;
  workspaceRoot: string;
  checks: DoctorCheck[];
  blockers: string[];
  warnings: string[];
  ready: boolean;
}

const REQUIRED_SECRET_KEYS = ["GITHUB_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] as const;
const OPTIONAL_SECRET_KEYS = ["OPENROUTER_API_KEY"] as const;

export async function runHostDoctor(options: HostDoctorOptions): Promise<HostDoctorReport> {
  validateWorkspaceRoot(options.workspaceRoot);

  const runner = options.runner ?? createSshRunner(options.host);
  const checks: DoctorCheck[] = [];

  const sshCheck = await checkSsh(runner);
  checks.push(sshCheck);
  if (sshCheck.status === "fail") {
    return createReport(options.host, options.workspaceRoot, checks);
  }

  checks.push(await checkSystemdUser(runner));
  checks.push(await checkTool(runner, "Node.js", "node", "node --version"));
  checks.push(await checkTool(runner, "pnpm", "pnpm", "pnpm --version"));
  checks.push(await checkTool(runner, "Git", "git", "git --version"));
  checks.push(await checkWorkspaceRoot(runner, options.workspaceRoot));
  checks.push(await checkEnvStub(runner, options.workspaceRoot));
  checks.push(await checkGitHubAuth(runner, options.workspaceRoot));
  checks.push(await checkSqlite(runner));
  checks.push(await checkServiceReadiness(runner));

  return createReport(options.host, options.workspaceRoot, checks);
}

function createReport(host: string, workspaceRoot: string, checks: DoctorCheck[]): HostDoctorReport {
  const blockers = checks
    .filter((check) => check.status === "fail")
    .map((check) => `${check.name}: ${check.summary}`);
  const warnings = checks
    .filter((check) => check.status === "warn")
    .map((check) => `${check.name}: ${check.summary}`);

  return {
    host,
    workspaceRoot,
    checks,
    blockers,
    warnings,
    ready: blockers.length === 0,
  };
}

async function checkSsh(runner: RemoteCommandRunner): Promise<DoctorCheck> {
  const result = await runner("printf 'reachable:%s:%s\\n' \"$(hostname)\" \"$(id -un)\"");
  if (result.exitCode !== 0) {
    return {
      name: "SSH reachability",
      status: "fail",
      summary: "non-interactive SSH failed",
      details: summarizeFailure(result),
    };
  }

  return {
    name: "SSH reachability",
    status: "pass",
    summary: result.stdout || "host reached",
  };
}

async function checkSystemdUser(runner: RemoteCommandRunner): Promise<DoctorCheck> {
  const result = await runner(
    "test \"$(ps -p 1 -o comm= 2>/dev/null)\" = systemd && systemctl --user status >/dev/null",
  );
  if (result.exitCode !== 0) {
    return {
      name: "systemd user support",
      status: "fail",
      summary: "systemd --user is not available to the runtime user",
      details: summarizeFailure(result),
    };
  }

  return {
    name: "systemd user support",
    status: "pass",
    summary: "systemctl --user is available",
  };
}

async function checkTool(
  runner: RemoteCommandRunner,
  name: string,
  commandName: string,
  versionCommand: string,
): Promise<DoctorCheck> {
  const result = await runner(`command -v ${commandName} >/dev/null && ${versionCommand}`);
  if (result.exitCode !== 0) {
    return {
      name,
      status: "fail",
      summary: `${commandName} is not visible in the non-interactive SSH environment`,
      details: summarizeFailure(result),
    };
  }

  return {
    name,
    status: "pass",
    summary: firstLine(result.stdout),
  };
}

async function checkWorkspaceRoot(
  runner: RemoteCommandRunner,
  workspaceRoot: string,
): Promise<DoctorCheck> {
  const result = await runner(`
${workspaceRootPrelude(workspaceRoot)}
test -d "$root" && test -w "$root" && test -x "$root" && printf 'writable:%s\\n' "$root"
`);
  if (result.exitCode !== 0) {
    return {
      name: "Workspace Root",
      status: "fail",
      summary: `${workspaceRoot} is missing or not writable by the runtime user`,
      details: summarizeFailure(result),
    };
  }

  return {
    name: "Workspace Root",
    status: "pass",
    summary: result.stdout || `${workspaceRoot} is writable`,
  };
}

async function checkEnvStub(
  runner: RemoteCommandRunner,
  workspaceRoot: string,
): Promise<DoctorCheck> {
  const requiredKeys = REQUIRED_SECRET_KEYS.join(" ");
  const optionalKeys = OPTIONAL_SECRET_KEYS.join(" ");
  const result = await runner(`
${workspaceRootPrelude(workspaceRoot)}
env_file="$root/config/vampyre.env"
if [ ! -d "$root" ]; then
  printf 'workspace-missing\\n'
  exit 2
fi
if [ ! -f "$env_file" ]; then
  umask 077
  mkdir -p "$root/config"
  {
    printf 'GITHUB_TOKEN=\\n'
    printf 'TELEGRAM_BOT_TOKEN=\\n'
    printf 'TELEGRAM_CHAT_ID=\\n'
    printf 'OPENROUTER_API_KEY=\\n'
  } > "$env_file"
  chmod 600 "$env_file"
  printf 'stub-created\\n'
else
  mode="$(stat -c '%a' "$env_file" 2>/dev/null || stat -f '%Lp' "$env_file" 2>/dev/null || printf unknown)"
  if [ "$mode" != "600" ]; then
    printf 'mode:%s\\n' "$mode"
    exit 3
  fi
  printf 'stub-present\\n'
fi
for key in ${requiredKeys}; do
  if grep -Eq "^$key=.+" "$env_file"; then
    printf '%s:present\\n' "$key"
  else
    printf '%s:missing\\n' "$key"
  fi
done
for key in ${optionalKeys}; do
  if grep -Eq "^$key=.+" "$env_file"; then
    printf '%s:present\\n' "$key"
  else
    printf '%s:missing-optional\\n' "$key"
  fi
done
`);

  if (result.exitCode === 2) {
    return {
      name: "Env stub",
      status: "fail",
      summary: "workspace root is missing, so the env stub cannot be created",
      details: sanitizeSecretOutput(result),
    };
  }

  if (result.exitCode === 3) {
    return {
      name: "Env stub",
      status: "fail",
      summary: `${workspaceRoot}/config/vampyre.env does not have 0600 permissions`,
      details: sanitizeSecretOutput(result),
    };
  }

  if (result.exitCode !== 0) {
    return {
      name: "Env stub",
      status: "fail",
      summary: "env stub check failed",
      details: sanitizeSecretOutput(result),
    };
  }

  const safeLines = result.stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.includes("="));
  const missingRequired = REQUIRED_SECRET_KEYS.filter((key) => safeLines.includes(`${key}:missing`));

  if (missingRequired.length > 0) {
    return {
      name: "Env stub",
      status: "fail",
      summary: `required secret presence missing: ${missingRequired.join(", ")}`,
      details: safeLines.join("; "),
    };
  }

  return {
    name: "Env stub",
    status: "pass",
    summary: "env file exists with required secret presence metadata",
    details: safeLines.join("; "),
  };
}

async function checkSqlite(runner: RemoteCommandRunner): Promise<DoctorCheck> {
  const result = await runner("command -v sqlite3 >/dev/null && sqlite3 --version");
  if (result.exitCode !== 0) {
    return {
      name: "SQLite",
      status: "fail",
      summary: "sqlite3 is not visible in the non-interactive SSH environment",
      details: summarizeFailure(result),
    };
  }

  return {
    name: "SQLite",
    status: "pass",
    summary: firstLine(result.stdout),
  };
}

async function checkGitHubAuth(
  runner: RemoteCommandRunner,
  workspaceRoot: string,
): Promise<DoctorCheck> {
  const result = await runner(
    [
      workspaceRootPrelude(workspaceRoot),
      'env_file="$root/config/vampyre.env"',
      'if [ ! -f "$env_file" ]; then',
      "  printf 'github-env-missing\\n'",
      "  exit 2",
      "fi",
      "set -a",
      '. "$env_file"',
      "set +a",
      'if [ -z "${GITHUB_TOKEN:-}" ]; then',
      "  printf 'github-token-missing\\n'",
      "  exit 3",
      "fi",
      "node --input-type=module <<'NODE'",
      "const response = await fetch('https://api.github.com/user', {",
      "  headers: {",
      "    accept: 'application/vnd.github+json',",
      "    authorization: `Bearer ${process.env.GITHUB_TOKEN}`,",
      "    'user-agent': 'vampyre-mvp',",
      "    'x-github-api-version': '2022-11-28',",
      "  },",
      "});",
      "const body = await response.json().catch(() => ({}));",
      "if (!response.ok) {",
      "  const message = typeof body.message === 'string' ? body.message : response.statusText;",
      "  console.error(`github-auth-error:${response.status}:${message}`);",
      "  process.exit(4);",
      "}",
      "console.log('github-auth:ok');",
      "NODE",
    ].join("\n"),
  );

  if (result.exitCode !== 0) {
    return {
      name: "GitHub auth",
      status: "fail",
      summary: summarizeFailure(result) || "GitHub authentication failed",
    };
  }

  return {
    name: "GitHub auth",
    status: "pass",
    summary: "GitHub token authenticated",
    details: result.stdout || undefined,
  };
}

async function checkServiceReadiness(runner: RemoteCommandRunner): Promise<DoctorCheck> {
  const result = await runner("systemctl --user status vampyre.service --no-pager >/dev/null 2>&1");
  if (result.exitCode !== 0) {
    return {
      name: "Service readiness",
      status: "warn",
      summary: "vampyre.service is not installed yet",
    };
  }

  return {
    name: "Service readiness",
    status: "pass",
    summary: "vampyre.service is visible to systemd --user",
  };
}

function summarizeFailure(result: { stdout: string; stderr: string }): string | undefined {
  return firstLine(result.stderr) || firstLine(result.stdout) || undefined;
}

function sanitizeSecretOutput(result: { stdout: string; stderr: string }): string | undefined {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (!output) {
    return undefined;
  }

  return output
    .split("\n")
    .filter((line) => !line.includes("="))
    .join("; ");
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
