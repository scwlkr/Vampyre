import { createSshRunner, type RemoteCommandRunner } from "../doctor/ssh.js";
import { workspaceRootPrelude, validateWorkspaceRoot } from "../remote/paths.js";

export type HostSetupStatus = "pass" | "fail";

export interface HostSetupStep {
  name: string;
  status: HostSetupStatus;
  summary: string;
  details?: string | undefined;
}

export interface HostSetupOptions {
  host: string;
  workspaceRoot: string;
  runner?: RemoteCommandRunner;
}

export interface HostSetupReport {
  host: string;
  workspaceRoot: string;
  steps: HostSetupStep[];
  blockers: string[];
  ready: boolean;
}

const REQUIRED_PNPM_VERSION = "10.33.0";

export async function runHostSetup(options: HostSetupOptions): Promise<HostSetupReport> {
  validateWorkspaceRoot(options.workspaceRoot);

  const runner = options.runner ?? createSshRunner(options.host);
  const steps: HostSetupStep[] = [];

  const sshStep = await checkSsh(runner);
  steps.push(sshStep);
  if (sshStep.status === "fail") {
    return createReport(options.host, options.workspaceRoot, steps);
  }

  steps.push(await ensureWorkspace(runner, options.workspaceRoot));
  steps.push(await ensureEnvStub(runner, options.workspaceRoot));
  steps.push(await ensureSystemNode(runner));
  steps.push(await ensurePnpm(runner));

  return createReport(options.host, options.workspaceRoot, steps);
}

function createReport(host: string, workspaceRoot: string, steps: HostSetupStep[]): HostSetupReport {
  const blockers = steps
    .filter((step) => step.status === "fail")
    .map((step) => `${step.name}: ${step.summary}`);

  return {
    host,
    workspaceRoot,
    steps,
    blockers,
    ready: blockers.length === 0,
  };
}

async function checkSsh(runner: RemoteCommandRunner): Promise<HostSetupStep> {
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

async function ensureWorkspace(
  runner: RemoteCommandRunner,
  workspaceRoot: string,
): Promise<HostSetupStep> {
  const result = await runner(`
${workspaceRootPrelude(workspaceRoot)}
mkdir -p "$root/config" "$root/data" "$root/logs" "$root/repos" "$root/worktrees" "$root/reports" "$root/artifacts"
chmod 700 "$root" "$root/config"
test -d "$root" && test -w "$root" && printf 'workspace-ready:%s\\n' "$root"
`);

  if (result.exitCode !== 0) {
    return {
      name: "Workspace Root",
      status: "fail",
      summary: `${workspaceRoot} could not be created or made writable`,
      details: summarizeFailure(result),
    };
  }

  return {
    name: "Workspace Root",
    status: "pass",
    summary: result.stdout || `${workspaceRoot} is ready`,
  };
}

async function ensureEnvStub(
  runner: RemoteCommandRunner,
  workspaceRoot: string,
): Promise<HostSetupStep> {
  const result = await runner(`
${workspaceRootPrelude(workspaceRoot)}
env_file="$root/config/vampyre.env"
if [ ! -f "$env_file" ]; then
  umask 077
  {
    printf 'GITHUB_TOKEN=\\n'
    printf 'TELEGRAM_BOT_TOKEN=\\n'
    printf 'TELEGRAM_CHAT_ID=\\n'
    printf 'OPENROUTER_API_KEY=\\n'
  } > "$env_file"
fi
chmod 600 "$env_file"
mode="$(stat -c '%a' "$env_file" 2>/dev/null || stat -f '%Lp' "$env_file" 2>/dev/null || printf unknown)"
printf 'env-stub-mode:%s\\n' "$mode"
test "$mode" = 600
`);

  if (result.exitCode !== 0) {
    return {
      name: "Env stub",
      status: "fail",
      summary: "env stub could not be created with 0600 permissions",
      details: sanitizeSecretOutput(result),
    };
  }

  return {
    name: "Env stub",
    status: "pass",
    summary: "env stub exists with 0600 permissions",
    details: sanitizeSecretOutput(result),
  };
}

async function ensureSystemNode(runner: RemoteCommandRunner): Promise<HostSetupStep> {
  const result = await runner("command -v node >/dev/null && node --version");
  if (result.exitCode !== 0) {
    return {
      name: "Node.js",
      status: "fail",
      summary: "system Node.js is not visible in the non-interactive SSH environment",
      details: summarizeFailure(result),
    };
  }

  return {
    name: "Node.js",
    status: "pass",
    summary: firstLine(result.stdout),
  };
}

async function ensurePnpm(runner: RemoteCommandRunner): Promise<HostSetupStep> {
  const result = await runner("command -v pnpm >/dev/null && pnpm --version");
  if (result.exitCode !== 0) {
    return {
      name: "pnpm",
      status: "fail",
      summary: `system pnpm ${REQUIRED_PNPM_VERSION} is not visible in the non-interactive SSH environment`,
      details: summarizeFailure(result),
    };
  }

  return {
    name: "pnpm",
    status: "pass",
    summary: firstLine(result.stdout),
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
