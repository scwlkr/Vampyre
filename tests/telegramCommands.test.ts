import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  runTelegramOperationalCommands,
  type TelegramCommandFetch,
  type TelegramCommandFetchInit,
  type TelegramCommandFetchResponse,
} from "../src/telegram/commands.js";
import {
  initializeOperationalState,
  readNotificationDeliveryState,
  readTelegramUpdateCursor,
} from "../src/state/operationalState.js";

test("Telegram /status replies only to the authorized chat and persists update cursor", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-telegram-commands-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:00:00.000Z"),
    });
    const sentTexts: string[] = [];
    const fetchImpl = fakeTelegramFetch({
      updates: [
        telegramUpdate(10, "999", "/status"),
        telegramUpdate(11, "12345", "/status"),
      ],
      sentTexts,
    });

    const result = await runTelegramOperationalCommands({
      state,
      workspaceRoot,
      now: () => new Date("2026-05-28T12:01:00.000Z"),
      env: {
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_CHAT_ID: "12345",
      },
      fetchImpl,
    });

    assert.equal(result.status, "processed");
    assert.equal(result.processedUpdateCount, 2);
    assert.equal(result.sentMessageCount, 1);
    assert.match(sentTexts[0] ?? "", /Vampyre status/);
    assert.match(sentTexts[0] ?? "", /Work Pause: not paused/);
    assert.doesNotMatch(sentTexts.join("\n"), /secret-token|TELEGRAM_BOT_TOKEN/);
    assert.equal(await readTelegramUpdateCursor(state.databasePath), 11);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Telegram /pause1min writes the shared Work Pause state", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-telegram-commands-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:00:00.000Z"),
    });
    const sentTexts: string[] = [];
    const fetchImpl = fakeTelegramFetch({
      updates: [telegramUpdate(20, "12345", "/pause1min")],
      sentTexts,
    });

    const result = await runTelegramOperationalCommands({
      state,
      workspaceRoot,
      now: () => new Date("2026-05-28T12:02:00.000Z"),
      env: {
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_CHAT_ID: "12345",
      },
      fetchImpl,
    });

    assert.equal(result.status, "processed");
    assert.equal(result.stateChanged, true);
    assert.match(sentTexts[0] ?? "", /Work Pause active until 2026-05-28T12:03:00.000Z/);

    const refreshed = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:02:30.000Z"),
    });
    assert.equal(refreshed.workPause?.active, true);
    assert.equal(refreshed.workPause?.source, "telegram");
    assert.equal(refreshed.workPause?.reason, "/pause1min");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Telegram pause state survives a confirmation send failure", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-telegram-commands-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:00:00.000Z"),
    });
    const fetchImpl: TelegramCommandFetch = async (url) => {
      if (url.includes("/getUpdates")) {
        return jsonResponse({
          ok: true,
          result: [telegramUpdate(30, "12345", "/pause1min")],
        });
      }

      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        async text() {
          return JSON.stringify({
            ok: false,
            description: "temporary send failure",
          });
        },
      };
    };

    const result = await runTelegramOperationalCommands({
      state,
      workspaceRoot,
      now: () => new Date("2026-05-28T12:05:00.000Z"),
      env: {
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_CHAT_ID: "12345",
      },
      fetchImpl,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.stateChanged, true);
    assert.match(result.blockers?.[0] ?? "", /temporary send failure/);

    const refreshed = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:05:30.000Z"),
    });
    assert.equal(refreshed.workPause?.active, true);
    assert.equal(refreshed.workPause?.source, "telegram");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Telegram sends the scheduled Daily Brief once per due UTC day", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-telegram-daily-brief-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:00:00.000Z"),
    });
    const sentTexts: string[] = [];

    const first = await runTelegramOperationalCommands({
      state,
      workspaceRoot,
      now: () => new Date("2026-05-28T14:05:00.000Z"),
      env: {
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_CHAT_ID: "12345",
      },
      fetchImpl: fakeTelegramFetch({
        updates: [],
        sentTexts,
      }),
    });

    assert.equal(first.status, "processed");
    assert.equal(first.processedUpdateCount, 0);
    assert.equal(first.sentMessageCount, 1);
    assert.match(sentTexts[0] ?? "", /Vampyre daily brief/);
    assert.match(sentTexts[0] ?? "", /Projects:/);

    const delivery = await readNotificationDeliveryState(state.databasePath, "telegram-daily-brief");
    assert.equal(delivery?.lastSentAt, "2026-05-28T14:05:00.000Z");

    const second = await runTelegramOperationalCommands({
      state,
      workspaceRoot,
      now: () => new Date("2026-05-28T14:06:00.000Z"),
      env: {
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_CHAT_ID: "12345",
      },
      fetchImpl: fakeTelegramFetch({
        updates: [],
        sentTexts,
      }),
    });

    assert.equal(second.status, "skipped");
    assert.equal(second.sentMessageCount, 0);
    assert.equal(sentTexts.length, 1);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Telegram unauthorized command attempts trigger one suppressed immediate alert", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-telegram-unauthorized-"));

  try {
    const state = await initializeOperationalState({
      workspaceRoot,
      now: () => new Date("2026-05-28T12:00:00.000Z"),
    });
    const sentTexts: string[] = [];

    const first = await runTelegramOperationalCommands({
      state,
      workspaceRoot,
      now: () => new Date("2026-05-28T12:10:00.000Z"),
      env: {
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_CHAT_ID: "12345",
      },
      fetchImpl: fakeTelegramFetch({
        updates: [
          telegramUpdate(40, "999", "/status"),
          telegramUpdate(41, "999", "/pause1min"),
          telegramUpdate(42, "999", "/resume"),
        ],
        sentTexts,
      }),
    });

    assert.equal(first.status, "processed");
    assert.equal(first.processedUpdateCount, 3);
    assert.equal(first.sentMessageCount, 1);
    assert.match(sentTexts[0] ?? "", /Vampyre immediate alert/);
    assert.match(sentTexts[0] ?? "", /Unauthorized Telegram command attempts/);
    assert.doesNotMatch(sentTexts[0] ?? "", /999/);
    assert.equal(await readTelegramUpdateCursor(state.databasePath), 42);

    const second = await runTelegramOperationalCommands({
      state,
      workspaceRoot,
      now: () => new Date("2026-05-28T12:11:00.000Z"),
      env: {
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_CHAT_ID: "12345",
      },
      fetchImpl: fakeTelegramFetch({
        updates: [telegramUpdate(43, "999", "/status")],
        sentTexts,
      }),
    });

    assert.equal(second.status, "skipped");
    assert.equal(second.sentMessageCount, 0);
    assert.equal(sentTexts.length, 1);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

function fakeTelegramFetch(options: {
  updates: unknown[];
  sentTexts: string[];
}): TelegramCommandFetch {
  return async (url: string, init?: TelegramCommandFetchInit): Promise<TelegramCommandFetchResponse> => {
    if (url.includes("/getUpdates")) {
      return jsonResponse({
        ok: true,
        result: options.updates,
      });
    }

    if (url.includes("/sendMessage")) {
      const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      if (typeof body["text"] === "string") {
        options.sentTexts.push(body["text"]);
      }
      return jsonResponse({
        ok: true,
        result: {
          message_id: 42,
        },
      });
    }

    throw new Error(`unexpected Telegram URL: ${url}`);
  };
}

function jsonResponse(value: unknown): TelegramCommandFetchResponse {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async text() {
      return JSON.stringify(value);
    },
  };
}

function telegramUpdate(updateId: number, chatId: string, text: string): unknown {
  return {
    update_id: updateId,
    message: {
      chat: {
        id: chatId,
      },
      text,
    },
  };
}
