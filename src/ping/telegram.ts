import { createSshRunner, type RemoteCommandRunner } from "../doctor/ssh.js";
import { shellQuote, validateWorkspaceRoot, workspaceRootPrelude } from "../remote/paths.js";

export interface TelegramPingOptions {
  host: string;
  workspaceRoot: string;
  message?: string | undefined;
  runner?: RemoteCommandRunner;
}

export interface TelegramPingReport {
  host: string;
  workspaceRoot: string;
  status: "pass" | "fail";
  summary: string;
  details?: string | undefined;
  ready: boolean;
}

const DEFAULT_MESSAGE = "Vampyre Telegram ping from wlkrlab.";

export async function runTelegramPing(options: TelegramPingOptions): Promise<TelegramPingReport> {
  validateWorkspaceRoot(options.workspaceRoot);

  const runner = options.runner ?? createSshRunner(options.host);
  const message = options.message ?? DEFAULT_MESSAGE;
  const result = await runner(`
${workspaceRootPrelude(options.workspaceRoot)}
env_file="$root/config/vampyre.env"
if [ ! -f "$env_file" ]; then
  printf 'env-missing\\n'
  exit 2
fi
set -a
. "$env_file"
set +a
if [ -z "\${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "\${TELEGRAM_CHAT_ID:-}" ]; then
  printf 'telegram-config-missing\\n'
  exit 3
fi
VAMPYRE_PING_MESSAGE=${shellQuote(message)} node --input-type=module <<'NODE'
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const text = process.env.VAMPYRE_PING_MESSAGE;

const response = await fetch(\`https://api.telegram.org/bot\${token}/sendMessage\`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    chat_id: chatId,
    text,
  }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok || body.ok !== true) {
  const description = typeof body.description === "string" ? body.description : "telegram request failed";
  console.error(\`telegram-error:\${response.status}:\${description}\`);
  process.exit(4);
}
console.log(\`telegram-message-sent:\${body.result?.message_id ?? "unknown"}\`);
NODE
`);

  if (result.exitCode !== 0) {
    return {
      host: options.host,
      workspaceRoot: options.workspaceRoot,
      status: "fail",
      summary: summarizeFailure(result) || "Telegram ping failed",
      ready: false,
    };
  }

  return {
    host: options.host,
    workspaceRoot: options.workspaceRoot,
    status: "pass",
    summary: "Telegram ping sent",
    details: result.stdout || undefined,
    ready: true,
  };
}

function summarizeFailure(result: { stdout: string; stderr: string }): string | undefined {
  return firstLine(result.stderr) || firstLine(result.stdout) || undefined;
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
