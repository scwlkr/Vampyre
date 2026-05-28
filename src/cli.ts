#!/usr/bin/env node
import { runHostDoctor } from "./doctor/hostDoctor.js";

const DEFAULT_HOST = "wlkrlab";
const DEFAULT_WORKSPACE_ROOT = "~/vampyre";

type ParsedArgs =
  | {
      command: "doctor";
      host: string;
      workspaceRoot: string;
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

    const report = await runHostDoctor({
      host: parsed.host,
      workspaceRoot: parsed.workspaceRoot,
    });
    printDoctorReport(report);
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

  const [command, ...rest] = argv;
  if (command !== "doctor") {
    throw new Error(`unknown command: ${command ?? ""}`);
  }

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

function printHelp(): void {
  console.log(`Usage:
  vampyre doctor --host wlkrlab [--workspace-root ~/vampyre]

Commands:
  doctor    Check runtime host readiness without printing secret values`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
