import { createHash } from "node:crypto";
import {
  buildCheckInSummary,
  formatTelegramCheckInSummary,
  formatTelegramDailyBrief,
} from "../checkin/checkInSummary.js";
import {
  DEFAULT_RUNTIME_POLICY,
  formatRuntimePolicySummary,
  parseDurationMs,
  type RuntimePolicy,
  type RuntimePolicyTelegramCommandKey,
} from "../config/runtimePolicy.js";
import { formatWorkPauseConfirmation } from "../control/workPause.js";
import {
  clearWorkPauseState,
  initializeOperationalState,
  readNotificationDeliveryState,
  readActiveBuildAgentLock,
  readTelegramUpdateCursor,
  recordNotificationDelivery,
  recordTelegramUnauthorizedAlert,
  recordTelegramUnauthorizedAttempt,
  recordTelegramUpdateCursor,
  setWorkPauseState,
  type ActiveBuildAgentLockSnapshot,
  type TelegramUnauthorizedAttemptRecord,
  type OperationalStateOptions,
  type OperationalStateReport,
  type WorkPauseRuntimeStatus,
} from "../state/operationalState.js";

export interface TelegramOperationalCommandOptions {
  state: OperationalStateReport;
  workspaceRoot: string;
  now?: (() => Date) | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  fetchImpl?: TelegramCommandFetch | undefined;
  initializeState?: ((options: OperationalStateOptions) => Promise<OperationalStateReport>) | undefined;
}

export interface TelegramOperationalCommandResult {
  status: "processed" | "skipped" | "failed";
  summary: string;
  processedUpdateCount: number;
  sentMessageCount: number;
  stateChanged: boolean;
  blockers?: string[] | undefined;
}

export interface TelegramCommandFetchInit {
  method: string;
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
}

export interface TelegramCommandFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

export type TelegramCommandFetch = (
  url: string,
  init?: TelegramCommandFetchInit,
) => Promise<TelegramCommandFetchResponse>;

type TelegramCommandName = RuntimePolicyTelegramCommandKey;

interface TelegramUpdate {
  updateId: number;
  chatId?: string | undefined;
  text?: string | undefined;
}

interface TelegramSendResult {
  messageId: string;
}

interface TelegramBotCommand {
  command: string;
  description: string;
}

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const DAILY_BRIEF_NOTIFICATION_ID = "telegram-daily-brief";
const BOT_COMMAND_MENU_NOTIFICATION_ID = "telegram-bot-command-menu";

export async function runTelegramOperationalCommands(
  options: TelegramOperationalCommandOptions,
): Promise<TelegramOperationalCommandResult> {
  const env = options.env ?? process.env;
  const token = envValue(env, "TELEGRAM_BOT_TOKEN");
  const authorizedChatId = envValue(env, "TELEGRAM_CHAT_ID");
  const runtimePolicy = options.state.runtimePolicy ?? DEFAULT_RUNTIME_POLICY;

  if (!token || !authorizedChatId) {
    return {
      status: "skipped",
      summary: "Telegram operational commands skipped because Telegram config is missing",
      processedUpdateCount: 0,
      sentMessageCount: 0,
      stateChanged: false,
    };
  }

  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const blockers: string[] = [];
  const commandMenu = await maybeSyncTelegramBotCommandMenu({
    state: options.state,
    token,
    now,
    fetchImpl,
    runtimePolicy,
  });
  if (commandMenu.blocker) {
    blockers.push(commandMenu.blocker);
  }
  const lastUpdateId = await readTelegramUpdateCursor(options.state.databasePath);
  const updates = await fetchTelegramUpdates({
    token,
    fetchImpl,
    offset: lastUpdateId === undefined ? undefined : lastUpdateId + 1,
  });

  const initializeState = options.initializeState ?? initializeOperationalState;
  let currentState = options.state;
  let sentMessageCount = 0;
  let authorizedCommandCount = 0;
  let unauthorizedAlertCount = 0;
  let dailyBriefSent = false;
  let stateChanged = false;
  let maxUpdateId = lastUpdateId ?? 0;

  for (const update of updates) {
    maxUpdateId = Math.max(maxUpdateId, update.updateId);
    const command = telegramCommandName(update.text, runtimePolicy);
    if (!command) {
      continue;
    }

    if (update.chatId !== authorizedChatId) {
      const unauthorized = await handleUnauthorizedCommandAttempt({
        update,
        state: currentState,
        token,
        authorizedChatId,
        now,
        fetchImpl,
        runtimePolicy,
      });
      if (unauthorized.sent) {
        sentMessageCount += 1;
        unauthorizedAlertCount += 1;
      }
      if (unauthorized.blocker) {
        blockers.push(unauthorized.blocker);
      }
      continue;
    }

    const message = await handleAuthorizedCommand({
      command,
      state: currentState,
      workspaceRoot: options.workspaceRoot,
      now,
      initializeState,
      runtimePolicy,
    });

    currentState = message.state;
    stateChanged = stateChanged || message.stateChanged;
    try {
      await sendTelegramMessage({
        token,
        chatId: authorizedChatId,
        text: message.text,
        fetchImpl,
      });
      sentMessageCount += 1;
      authorizedCommandCount += 1;
    } catch (error) {
      blockers.push(`Telegram sendMessage: ${sanitizeTelegramError(error)}`);
    }
  }

  const dailyBrief = await maybeSendDailyBrief({
    state: currentState,
    token,
    authorizedChatId,
    now,
    env,
    fetchImpl,
    runtimePolicy,
  });
  if (dailyBrief.sent) {
    sentMessageCount += 1;
    dailyBriefSent = true;
  }
  if (dailyBrief.blocker) {
    blockers.push(dailyBrief.blocker);
  }

  if (updates.length > 0) {
    await recordTelegramUpdateCursor(options.state.databasePath, {
      lastUpdateId: maxUpdateId,
      updatedAt: now().toISOString(),
    });
  }

  return {
    status:
      blockers.length > 0 ? "failed" : sentMessageCount > 0 || commandMenu.synced ? "processed" : "skipped",
    summary: telegramResultSummary({
      blockers,
      commandMenuSynced: commandMenu.synced,
      sentMessageCount,
      authorizedCommandCount,
      unauthorizedAlertCount,
      dailyBriefSent,
      processedUpdateCount: updates.length,
    }),
    processedUpdateCount: updates.length,
    sentMessageCount,
    stateChanged,
    blockers: blockers.length > 0 ? blockers : undefined,
  };
}

async function maybeSendDailyBrief(options: {
  state: OperationalStateReport;
  token: string;
  authorizedChatId: string;
  now: () => Date;
  env: NodeJS.ProcessEnv;
  fetchImpl: TelegramCommandFetch;
  runtimePolicy: RuntimePolicy;
}): Promise<{ sent: boolean; blocker?: string | undefined }> {
  if (!options.runtimePolicy.telegram.dailyBrief.enabled) {
    return { sent: false };
  }

  if (envValue(options.env, "VAMPYRE_DAILY_BRIEF_DISABLED") === "1") {
    return { sent: false };
  }

  const due = dailyBriefDue(options.now(), dailyBriefUtcHour(options.env, options.runtimePolicy));
  if (!due) {
    return { sent: false };
  }

  const previous = await readNotificationDeliveryState(options.state.databasePath, DAILY_BRIEF_NOTIFICATION_ID);
  if (previous?.metadataJson) {
    try {
      const metadata = JSON.parse(previous.metadataJson) as unknown;
      if (
        metadata &&
        typeof metadata === "object" &&
        !Array.isArray(metadata) &&
        (metadata as Record<string, unknown>)["day"] === due.day &&
        (metadata as Record<string, unknown>)["hourUtc"] === due.hourUtc
      ) {
        return { sent: false };
      }
    } catch {
      // Invalid metadata should not permanently block future daily briefs.
    }
  }

  const sentAt = options.now().toISOString();
  try {
    await sendTelegramMessage({
      token: options.token,
      chatId: options.authorizedChatId,
      text: formatTelegramDailyBrief(
        buildCheckInSummary({
          state: options.state,
          now: options.now,
        }),
      ),
      fetchImpl: options.fetchImpl,
    });
    await recordNotificationDelivery(options.state.databasePath, {
      id: DAILY_BRIEF_NOTIFICATION_ID,
      lastSentAt: sentAt,
      metadataJson: JSON.stringify(due),
      updatedAt: sentAt,
    });
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      blocker: `Telegram daily brief: ${sanitizeTelegramError(error)}`,
    };
  }
}

async function handleUnauthorizedCommandAttempt(options: {
  update: TelegramUpdate;
  state: OperationalStateReport;
  token: string;
  authorizedChatId: string;
  now: () => Date;
  fetchImpl: TelegramCommandFetch;
  runtimePolicy: RuntimePolicy;
}): Promise<{ sent: boolean; blocker?: string | undefined }> {
  const attemptedAt = options.now();
  const sourceKey = telegramUnauthorizedSourceKey(options.update);
  const alertPolicy = options.runtimePolicy.telegram.unauthorizedAlerts;
  const record = await recordTelegramUnauthorizedAttempt(options.state.databasePath, {
    sourceKey,
    attemptedAt: attemptedAt.toISOString(),
    windowMs: parseDurationMs(alertPolicy.window, "runtimePolicy.telegram.unauthorizedAlerts.window"),
  });

  if (!shouldSendUnauthorizedAlert(record, attemptedAt, options.runtimePolicy)) {
    return { sent: false };
  }

  try {
    await sendTelegramMessage({
      token: options.token,
      chatId: options.authorizedChatId,
      text: unauthorizedAlertText(record),
      fetchImpl: options.fetchImpl,
    });
    await recordTelegramUnauthorizedAlert(options.state.databasePath, {
      sourceKey: record.sourceKey,
      alertAt: attemptedAt.toISOString(),
      suppressedUntil: new Date(
        attemptedAt.getTime() +
          parseDurationMs(alertPolicy.suppression, "runtimePolicy.telegram.unauthorizedAlerts.suppression"),
      ).toISOString(),
      lastAlertAttemptCount: record.attemptCount,
    });
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      blocker: `Telegram unauthorized alert: ${sanitizeTelegramError(error)}`,
    };
  }
}

function telegramResultSummary(options: {
  blockers: string[];
  commandMenuSynced: boolean;
  sentMessageCount: number;
  authorizedCommandCount: number;
  unauthorizedAlertCount: number;
  dailyBriefSent: boolean;
  processedUpdateCount: number;
}): string {
  if (options.blockers.length > 0) {
    return `Processed Telegram state with ${options.blockers.length} notification failure(s)`;
  }

  const parts: string[] = [];
  if (options.commandMenuSynced) {
    parts.push("bot command menu");
  }
  if (options.authorizedCommandCount > 0) {
    parts.push(`${options.authorizedCommandCount} authorized command(s)`);
  }
  if (options.unauthorizedAlertCount > 0) {
    parts.push(`${options.unauthorizedAlertCount} unauthorized alert(s)`);
  }
  if (options.dailyBriefSent) {
    parts.push("daily brief");
  }

  if (parts.length > 0 && options.sentMessageCount > 0) {
    return `Sent ${options.sentMessageCount} Telegram message(s): ${parts.join(", ")}`;
  }
  if (parts.length > 0) {
    return `Processed Telegram state: ${parts.join(", ")}`;
  }

  return options.processedUpdateCount > 0
    ? "Telegram updates contained no authorized operational commands or due alerts"
    : "Telegram operational commands found no new updates or due alerts";
}

async function maybeSyncTelegramBotCommandMenu(options: {
  state: OperationalStateReport;
  token: string;
  now: () => Date;
  fetchImpl: TelegramCommandFetch;
  runtimePolicy: RuntimePolicy;
}): Promise<{ synced: boolean; blocker?: string | undefined }> {
  const commands = telegramBotCommandMenu(options.runtimePolicy);
  const metadataJson = telegramCommandMenuMetadata(commands);
  const previous = await readNotificationDeliveryState(options.state.databasePath, BOT_COMMAND_MENU_NOTIFICATION_ID);
  if (previous?.metadataJson) {
    try {
      const previousMetadata = JSON.parse(previous.metadataJson) as unknown;
      const nextMetadata = JSON.parse(metadataJson) as Record<string, unknown>;
      if (
        previousMetadata &&
        typeof previousMetadata === "object" &&
        !Array.isArray(previousMetadata) &&
        (previousMetadata as Record<string, unknown>)["hash"] === nextMetadata["hash"]
      ) {
        return { synced: false };
      }
    } catch {
      // Invalid metadata should not permanently block command menu sync.
    }
  }

  try {
    await setTelegramBotCommands({
      token: options.token,
      commands,
      fetchImpl: options.fetchImpl,
    });
    const syncedAt = options.now().toISOString();
    await recordNotificationDelivery(options.state.databasePath, {
      id: BOT_COMMAND_MENU_NOTIFICATION_ID,
      lastSentAt: syncedAt,
      metadataJson,
      updatedAt: syncedAt,
    });
    return { synced: true };
  } catch (error) {
    return {
      synced: false,
      blocker: `Telegram bot commands: ${sanitizeTelegramError(error)}`,
    };
  }
}

function telegramBotCommandMenu(runtimePolicy: RuntimePolicy): TelegramBotCommand[] {
  const commands = runtimePolicy.telegram.commands;
  return [
    {
      command: telegramBotCommandName(commands.status),
      description: "Show current Vampyre status",
    },
    {
      command: telegramBotCommandName(commands.policy),
      description: "Show runtime policy summary",
    },
    {
      command: telegramBotCommandName(commands.pause1min),
      description: "Pause new project work for one minute",
    },
    {
      command: telegramBotCommandName(commands.pause1hour),
      description: "Pause new project work for one hour",
    },
    {
      command: telegramBotCommandName(commands.pause1day),
      description: "Pause new project work for one day",
    },
    {
      command: telegramBotCommandName(commands.resume),
      description: "Resume new project work",
    },
  ];
}

function telegramCommandMenuMetadata(commands: TelegramBotCommand[]): string {
  const body = JSON.stringify(commands);
  return JSON.stringify({
    hash: createHash("sha256").update(body).digest("hex"),
    commands,
  });
}

function dailyBriefDue(now: Date, hourUtc: number): { day: string; hourUtc: number } | undefined {
  if (now.getUTCHours() < hourUtc) {
    return undefined;
  }

  return {
    day: now.toISOString().slice(0, 10),
    hourUtc,
  };
}

function dailyBriefUtcHour(env: NodeJS.ProcessEnv, runtimePolicy: RuntimePolicy): number {
  const rawValue = envValue(env, "VAMPYRE_DAILY_BRIEF_UTC_HOUR");
  if (!rawValue) {
    return runtimePolicy.telegram.dailyBrief.hourUtc;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isInteger(value) && value >= 0 && value <= 23
    ? value
    : runtimePolicy.telegram.dailyBrief.hourUtc;
}

function shouldSendUnauthorizedAlert(
  record: TelegramUnauthorizedAttemptRecord,
  now: Date,
  runtimePolicy: RuntimePolicy,
): boolean {
  const alertPolicy = runtimePolicy.telegram.unauthorizedAlerts;
  if (record.attemptCount < alertPolicy.threshold) {
    return false;
  }

  const suppressedUntilMs = record.suppressedUntil ? Date.parse(record.suppressedUntil) : Number.NaN;
  const suppressionActive = !Number.isNaN(suppressedUntilMs) && suppressedUntilMs > now.getTime();
  if (!suppressionActive) {
    return true;
  }

  const lastAlertAttemptCount = record.lastAlertAttemptCount ?? record.attemptCount;
  return record.attemptCount >= lastAlertAttemptCount + alertPolicy.materialChangeCount;
}

function unauthorizedAlertText(record: TelegramUnauthorizedAttemptRecord): string {
  return [
    "Vampyre immediate alert",
    "Unauthorized Telegram command attempts reached the alert threshold.",
    `Source: ${record.sourceKey}`,
    `Attempts: ${record.attemptCount}`,
    `Window started: ${record.windowStartedAt}`,
    "No operational details were disclosed to the unauthorized chat.",
  ].join("\n");
}

function telegramUnauthorizedSourceKey(update: TelegramUpdate): string {
  const source = update.chatId ? `chat:${update.chatId}` : "chat:unknown";
  return `chat-${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
}

function sanitizeTelegramError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/bot[A-Za-z0-9:_-]+\/[A-Za-z]+/g, "bot[redacted]/method");
}

async function handleAuthorizedCommand(options: {
  command: TelegramCommandName;
  state: OperationalStateReport;
  workspaceRoot: string;
  now: () => Date;
  initializeState: (options: OperationalStateOptions) => Promise<OperationalStateReport>;
  runtimePolicy: RuntimePolicy;
}): Promise<{
  text: string;
  state: OperationalStateReport;
  stateChanged: boolean;
}> {
  if (options.command === "status") {
    return {
      text: formatTelegramCheckInSummary(
        buildCheckInSummary({
          state: options.state,
          now: options.now,
        }),
      ),
      state: options.state,
      stateChanged: false,
    };
  }

  if (options.command === "policy") {
    return {
      text: formatTelegramPolicyStatus(options.runtimePolicy),
      state: options.state,
      stateChanged: false,
    };
  }

  if (options.command === "resume") {
    await clearWorkPauseState(options.state.databasePath);
    const state = await options.initializeState({
      workspaceRoot: options.workspaceRoot,
      now: options.now,
    });
    const activeBuildAgentLock = await readActiveBuildAgentLock(state.databasePath);
    return {
      text: formatPauseConfirmation({
        action: "resume",
        workPause: state.workPause ?? { active: false },
        activeBuildAgentLock,
      }),
      state,
      stateChanged: true,
    };
  }

  const createdAt = options.now();
  await setWorkPauseState(options.state.databasePath, {
    pausedUntil: new Date(createdAt.getTime() + telegramPauseDurationMs(options.command, options.runtimePolicy)).toISOString(),
    source: "telegram",
    createdAt: createdAt.toISOString(),
    reason: options.runtimePolicy.telegram.commands[options.command],
  });
  const state = await options.initializeState({
    workspaceRoot: options.workspaceRoot,
    now: options.now,
  });
  const activeBuildAgentLock = await readActiveBuildAgentLock(state.databasePath);

  return {
    text: formatPauseConfirmation({
      action: "pause",
      workPause: state.workPause ?? { active: false },
      activeBuildAgentLock,
    }),
    state,
    stateChanged: true,
  };
}

function formatPauseConfirmation(options: {
  action: "pause" | "resume";
  workPause: WorkPauseRuntimeStatus;
  activeBuildAgentLock: ActiveBuildAgentLockSnapshot;
}): string {
  return formatWorkPauseConfirmation({
    host: "local",
    workspaceRoot: "local",
    ready: true,
    action: options.action,
    summary:
      options.action === "pause"
        ? `Work Pause active until ${options.workPause.pausedUntil ?? "unknown"}.`
        : "Work Pause cleared.",
    blockers: [],
    workPause: options.workPause,
    activeBuildAgentLock: options.activeBuildAgentLock,
  });
}

async function fetchTelegramUpdates(options: {
  token: string;
  fetchImpl: TelegramCommandFetch;
  offset?: number | undefined;
}): Promise<TelegramUpdate[]> {
  const params = new URLSearchParams({
    timeout: "0",
    allowed_updates: JSON.stringify(["message"]),
  });
  if (options.offset !== undefined) {
    params.set("offset", String(options.offset));
  }

  const body = await telegramApiRequest<unknown[]>({
    token: options.token,
    method: "GET",
    path: `/getUpdates?${params.toString()}`,
    fetchImpl: options.fetchImpl,
  });

  return body.map(parseTelegramUpdate).filter((update): update is TelegramUpdate => update !== undefined);
}

async function sendTelegramMessage(options: {
  token: string;
  chatId: string;
  text: string;
  fetchImpl: TelegramCommandFetch;
}): Promise<TelegramSendResult> {
  const body = await telegramApiRequest<Record<string, unknown>>({
    token: options.token,
    method: "POST",
    path: "/sendMessage",
    fetchImpl: options.fetchImpl,
    body: {
      chat_id: options.chatId,
      text: options.text,
    },
  });

  const messageId = body["message_id"];
  return {
    messageId: typeof messageId === "number" || typeof messageId === "string" ? String(messageId) : "unknown",
  };
}

async function setTelegramBotCommands(options: {
  token: string;
  commands: TelegramBotCommand[];
  fetchImpl: TelegramCommandFetch;
}): Promise<void> {
  await telegramApiRequest<boolean>({
    token: options.token,
    method: "POST",
    path: "/setMyCommands",
    fetchImpl: options.fetchImpl,
    body: {
      commands: options.commands,
    },
  });
}

async function telegramApiRequest<T>(options: {
  token: string;
  method: "GET" | "POST";
  path: string;
  fetchImpl: TelegramCommandFetch;
  body?: unknown;
}): Promise<T> {
  const init: TelegramCommandFetchInit = {
    method: options.method,
  };

  if (options.body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(options.body);
  }

  const response = await options.fetchImpl(`${TELEGRAM_API_BASE_URL}/bot${options.token}${options.path}`, init);
  const responseBody = await parseTelegramResponse(response);

  if (!response.ok || responseBody.ok !== true) {
    const description =
      typeof responseBody.description === "string" ? responseBody.description : response.statusText || "request failed";
    throw new Error(`Telegram ${options.method} ${options.path.split("?")[0]} failed with HTTP ${response.status}: ${description}`);
  }

  return responseBody.result as T;
}

async function parseTelegramResponse(response: TelegramCommandFetchResponse): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { ok: false, description: "invalid JSON response" };
  }
}

function parseTelegramUpdate(value: unknown): TelegramUpdate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const object = value as Record<string, unknown>;
  const updateId = object["update_id"];
  if (typeof updateId !== "number") {
    return undefined;
  }

  const message = object["message"];
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { updateId };
  }

  const messageObject = message as Record<string, unknown>;
  const chat = messageObject["chat"];
  let chatId: string | undefined;
  if (chat && typeof chat === "object" && !Array.isArray(chat)) {
    const rawChatId = (chat as Record<string, unknown>)["id"];
    if (typeof rawChatId === "number" || typeof rawChatId === "string") {
      chatId = String(rawChatId);
    }
  }

  const text = messageObject["text"];
  const update: TelegramUpdate = { updateId };
  if (chatId) {
    update.chatId = chatId;
  }
  if (typeof text === "string") {
    update.text = text;
  }
  return update;
}

function telegramCommandName(text: string | undefined, runtimePolicy: RuntimePolicy): TelegramCommandName | undefined {
  if (!text) {
    return undefined;
  }

  const firstToken = text.trim().split(/\s+/, 1)[0] ?? "";
  const command = firstToken.split("@", 1)[0];
  for (const [key, configuredCommand] of Object.entries(runtimePolicy.telegram.commands)) {
    if (command === configuredCommand) {
      return key as TelegramCommandName;
    }
  }

  return undefined;
}

function telegramBotCommandName(command: string): string {
  return command.startsWith("/") ? command.slice(1) : command;
}

function telegramPauseDurationMs(
  command: Exclude<TelegramCommandName, "status" | "policy" | "resume">,
  runtimePolicy: RuntimePolicy,
): number {
  return parseDurationMs(
    runtimePolicy.telegram.pauseDurations[command],
    `runtimePolicy.telegram.pauseDurations.${command}`,
  );
}

function formatTelegramPolicyStatus(runtimePolicy: RuntimePolicy): string {
  const lines = ["Vampyre policy"];
  lines.push(...formatRuntimePolicySummary(runtimePolicy));
  if (runtimePolicy.status.includeTelegramCommands) {
    lines.push(
      `Commands: ${Object.values(runtimePolicy.telegram.commands)
        .sort()
        .join(", ")}`,
    );
  }
  return lines.join("\n");
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function defaultFetch(): TelegramCommandFetch {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("global fetch is not available for Telegram command polling");
  }

  return globalThis.fetch as unknown as TelegramCommandFetch;
}
