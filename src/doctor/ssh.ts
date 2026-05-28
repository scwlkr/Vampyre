import { spawn } from "node:child_process";

export interface RemoteCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type RemoteCommandRunner = (command: string) => Promise<RemoteCommandResult>;

export function createSshRunner(host: string): RemoteCommandRunner {
  validateHost(host);

  return async (command: string) =>
    new Promise<RemoteCommandResult>((resolve, reject) => {
      const child = spawn(
        "ssh",
        ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, `sh -lc ${shellQuote(command)}`],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

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

export function validateHost(host: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(host)) {
    throw new Error("host must contain only letters, numbers, dots, underscores, or dashes");
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
