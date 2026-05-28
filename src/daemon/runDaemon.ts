const HEARTBEAT_INTERVAL_MS = 30_000;

interface DaemonRuntimeOptions {
  workspaceRoot: string;
  now?: () => Date;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  stdout?: Pick<NodeJS.WriteStream, "write">;
}

export function createHeartbeatPayload(workspaceRoot: string, now = new Date()): string {
  return JSON.stringify({
    event: "heartbeat",
    component: "vampyre-daemon",
    workspaceRoot,
    scheduler: "not-started",
    agent: "not-started",
    at: now.toISOString(),
  });
}

export async function runForegroundDaemon(options: DaemonRuntimeOptions): Promise<void> {
  const workspaceRoot = options.workspaceRoot;
  const now = options.now ?? (() => new Date());
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const stdout = options.stdout ?? process.stdout;

  stdout.write(`${createHeartbeatPayload(workspaceRoot, now())}\n`);

  await new Promise<void>((resolve) => {
    const interval = setIntervalFn(() => {
      stdout.write(`${createHeartbeatPayload(workspaceRoot, now())}\n`);
    }, HEARTBEAT_INTERVAL_MS);

    const stop = (): void => {
      clearIntervalFn(interval);
      stdout.write(
        `${JSON.stringify({
          event: "shutdown",
          component: "vampyre-daemon",
          workspaceRoot,
          at: now().toISOString(),
        })}\n`,
      );
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runForegroundDaemon({
    workspaceRoot: process.env["VAMPYRE_WORKSPACE_ROOT"] ?? "/home/wlkrlab/vampyre",
  });
}
