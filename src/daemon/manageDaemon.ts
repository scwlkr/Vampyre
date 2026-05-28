import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { createSshRunner, validateHost, type RemoteCommandRunner } from "../doctor/ssh.js";
import { shellQuote, validateWorkspaceRoot, workspaceRootPrelude } from "../remote/paths.js";
import { buildServiceUnit } from "./service.js";

export type DaemonAction = "install" | "start" | "stop" | "restart" | "status" | "logs";
export type DaemonStepStatus = "pass" | "fail";

export interface DaemonCommandOptions {
  action: DaemonAction;
  host: string;
  workspaceRoot: string;
  runner?: RemoteCommandRunner;
}

export interface DaemonStep {
  name: string;
  status: DaemonStepStatus;
  summary: string;
  details?: string | undefined;
}

export interface DaemonCommandReport {
  host: string;
  workspaceRoot: string;
  action: DaemonAction;
  steps: DaemonStep[];
  blockers: string[];
  output?: string | undefined;
  ready: boolean;
}

export async function runDaemonCommand(options: DaemonCommandOptions): Promise<DaemonCommandReport> {
  validateHost(options.host);
  validateWorkspaceRoot(options.workspaceRoot);

  const runner = options.runner ?? createSshRunner(options.host);
  const steps: DaemonStep[] = [];
  let output: string | undefined;

  if (options.action === "install") {
    steps.push(await ensureBuiltArtifacts());
    steps.push(await deployBuiltApp(options.host, options.workspaceRoot));
    steps.push(await installServiceUnit(runner, options.workspaceRoot));
  } else if (options.action === "logs") {
    const logs = await runner("journalctl --user -u vampyre.service -n 80 --no-pager");
    output = [logs.stdout, logs.stderr].filter(Boolean).join("\n");
    steps.push(commandStep("Logs", logs, "fetched recent service logs"));
  } else {
    const command = systemctlCommand(options.action);
    const result = await runner(command);
    output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    steps.push(commandStep(`Daemon ${options.action}`, result, `${options.action} command completed`));
  }

  return createReport(options, steps, output);
}

function createReport(
  options: DaemonCommandOptions,
  steps: DaemonStep[],
  output: string | undefined,
): DaemonCommandReport {
  const blockers = steps
    .filter((step) => step.status === "fail")
    .map((step) => `${step.name}: ${step.summary}`);

  return {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    action: options.action,
    steps,
    blockers,
    output,
    ready: blockers.length === 0,
  };
}

async function ensureBuiltArtifacts(): Promise<DaemonStep> {
  try {
    await stat("dist/cli.js");
    await stat("dist/daemon/runDaemon.js");
    return {
      name: "Build artifacts",
      status: "pass",
      summary: "dist contains CLI and daemon entrypoints",
    };
  } catch {
    return {
      name: "Build artifacts",
      status: "fail",
      summary: "run pnpm build before daemon install",
    };
  }
}

async function deployBuiltApp(host: string, workspaceRoot: string): Promise<DaemonStep> {
  const remoteCommand = `sh -lc ${shellQuote(`
${workspaceRootPrelude(workspaceRoot)}
mkdir -p "$root/app"
tar -xzf - -C "$root/app"
`)}`;
  const result = await runPipeline(
    { command: "tar", args: ["-czf", "-", "dist", "package.json"] },
    { command: "ssh", args: ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, remoteCommand] },
  );

  if (result.exitCode !== 0) {
    return {
      name: "Deploy app",
      status: "fail",
      summary: "could not copy built app to runtime workspace",
      details: firstLine(result.stderr) || firstLine(result.stdout),
    };
  }

  return {
    name: "Deploy app",
    status: "pass",
    summary: "copied built app to runtime workspace",
  };
}

async function installServiceUnit(
  runner: RemoteCommandRunner,
  workspaceRoot: string,
): Promise<DaemonStep> {
  const unit = buildServiceUnit("$root");
  const result = await runner(`
${workspaceRootPrelude(workspaceRoot)}
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/vampyre.service" <<EOF
${unit}
EOF
systemctl --user daemon-reload
systemctl --user enable vampyre.service
systemctl --user status vampyre.service --no-pager >/dev/null 2>&1 || true
printf 'service-installed:%s\\n' "$HOME/.config/systemd/user/vampyre.service"
`);

  return commandStep("Install service", result, "installed and enabled vampyre.service");
}

function systemctlCommand(action: Exclude<DaemonAction, "install" | "logs">): string {
  if (action === "status") {
    return "systemctl --user status vampyre.service --no-pager";
  }

  return `systemctl --user ${action} vampyre.service`;
}

function commandStep(
  name: string,
  result: { exitCode: number; stdout: string; stderr: string },
  passSummary: string,
): DaemonStep {
  if (result.exitCode !== 0) {
    return {
      name,
      status: "fail",
      summary: firstLine(result.stderr) || firstLine(result.stdout) || "command failed",
      details: [result.stdout, result.stderr].filter(Boolean).join("\n") || undefined,
    };
  }

  return {
    name,
    status: "pass",
    summary: passSummary,
    details: result.stdout || undefined,
  };
}

interface LocalProcessSpec {
  command: string;
  args: string[];
}

interface LocalProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runPipeline(
  first: LocalProcessSpec,
  second: LocalProcessSpec,
): Promise<LocalProcessResult> {
  return new Promise<LocalProcessResult>((resolve, reject) => {
    const firstChild = spawn(first.command, first.args, { stdio: ["ignore", "pipe", "pipe"] });
    const secondChild = spawn(second.command, second.args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let firstExitCode: number | null = null;
    let secondExitCode: number | null = null;

    firstChild.stdout.pipe(secondChild.stdin);
    firstChild.stderr.setEncoding("utf8");
    secondChild.stdout.setEncoding("utf8");
    secondChild.stderr.setEncoding("utf8");

    firstChild.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    secondChild.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    secondChild.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    firstChild.on("error", reject);
    secondChild.on("error", reject);

    firstChild.on("close", (code) => {
      firstExitCode = code ?? 1;
      maybeResolve();
    });
    secondChild.on("close", (code) => {
      secondExitCode = code ?? 1;
      maybeResolve();
    });

    function maybeResolve(): void {
      if (firstExitCode === null || secondExitCode === null) {
        return;
      }

      resolve({
        exitCode: firstExitCode === 0 && secondExitCode === 0 ? 0 : secondExitCode || firstExitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    }
  });
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
