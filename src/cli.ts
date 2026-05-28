#!/usr/bin/env node
import { runDaemonCommand, type DaemonAction } from "./daemon/manageDaemon.js";
import { runForegroundDaemon } from "./daemon/runDaemon.js";
import { runHostDoctor } from "./doctor/hostDoctor.js";
import { runHostSetup } from "./host/setupHost.js";
import { runTelegramPing } from "./ping/telegram.js";

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

function printHelp(): void {
  console.log(`Usage:
  vampyre doctor --host wlkrlab [--workspace-root ~/vampyre]
  vampyre host setup --host wlkrlab [--workspace-root ~/vampyre]
  vampyre ping telegram --host wlkrlab [--workspace-root ~/vampyre]
  vampyre -ping telegram --host wlkrlab [--workspace-root ~/vampyre]
  vampyre daemon run [--workspace-root ~/vampyre]
  vampyre daemon install|start|stop|restart|status|logs --host wlkrlab [--workspace-root ~/vampyre]

Commands:
  doctor        Check runtime host readiness without printing secret values
  host setup    Create runtime workspace/env stub and verify system toolchain
  ping telegram Send a Telegram test message from the runtime host
  daemon run    Run the placeholder daemon in the foreground
  daemon ...    Manage the systemd --user service on the runtime host`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
