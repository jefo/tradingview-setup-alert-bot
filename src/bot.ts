import { Bot, Context, GrammyError, HttpError } from "grammy";
import { config } from "./config";
import { MarketContext } from "./market-context";
import { publisherClient, subscriberClient } from "./redis";
import { logger } from "./logger";
import { MdStringBuilder } from './utils/md-string-builder';
import type { SignalContext } from "./signals";
import type { SetupEvaluation } from "./engine/types";
import { formatConfirmedSetup, formatSetupInvalidated, formatZoneEntry } from "./engine/format";

const bot = new Bot<Context>(config.bot.token);
const marketContext = new MarketContext();
let botStarted = false;

const MAX_MESSAGE_LENGTH = 4000;
const PIN_KEY = config.redis.keys.pinnedMessage(config.bot.channel);

function escapeForTelegram(text: string): string {
  return new MdStringBuilder().append(text).toString();
}

function clipMessage(text: string, limit = MAX_MESSAGE_LENGTH): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function isMarkdownParseError(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  return error.error_code === 400 && /parse entities|can't parse/i.test(error.description);
}

function retryAfterMs(error: unknown): number | undefined {
  if (error instanceof GrammyError && error.error_code === 429) {
    const retryAfter = (error.parameters as { retry_after?: number } | undefined)?.retry_after;
    return (retryAfter ?? 1) * 1000;
  }
  return undefined;
}

async function getPinnedMessageId(): Promise<number | null> {
  try {
    const stored = await publisherClient.get(PIN_KEY);
    return stored ? Number(stored) : null;
  } catch (error) {
    logger.warn("Failed to read pinned message id", error);
    return null;
  }
}

async function setPinnedMessageId(messageId: number): Promise<void> {
  try {
    await publisherClient.set(PIN_KEY, messageId.toString());
  } catch (error) {
    logger.warn("Failed to persist pinned message id", error);
  }
}

async function clearPinnedMessageId(): Promise<void> {
  try {
    await publisherClient.set(PIN_KEY, "");
  } catch (error) {
    logger.warn("Failed to clear pinned message id", error);
  }
}

/**
 * Sends a plain-text message. MarkdownV2 escaping is applied exactly once here.
 * If Telegram rejects the entities, the same text is sent without parse_mode.
 */
async function sendMessage(
  chatId: string,
  plainText: string,
  retryCount = 0,
  maxRetries = config.bot.retryLimit
): Promise<number | undefined> {
  const text = clipMessage(plainText);
  try {
    const sent = await bot.api.sendMessage(chatId, escapeForTelegram(text), {
      parse_mode: "MarkdownV2",
      disable_notification: /structure break/i.test(text),
    });
    return sent.message_id;
  } catch (error: unknown) {
    if (isMarkdownParseError(error)) {
      logger.warn("MarkdownV2 rejected, falling back to plain text");
      const sent = await bot.api.sendMessage(chatId, text);
      return sent.message_id;
    }

    if (retryCount < maxRetries) {
      const retryAfter = retryAfterMs(error);
      const delay = retryAfter ?? Math.min(1000 * Math.pow(2, retryCount), 10000);
      logger.info(`Retrying message send (attempt ${retryCount + 1}) after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return sendMessage(chatId, plainText, retryCount + 1, maxRetries);
    }

    throw error;
  }
}

async function updatePinnedMessage(): Promise<void> {
  const plain = marketContext.getPinnedMessage();
  if (!plain) return;

  const text = clipMessage(plain);
  const formatted = escapeForTelegram(text);
  const pinnedId = await getPinnedMessageId();

  if (pinnedId) {
    try {
      await bot.api.editMessageText(config.bot.channel, pinnedId, formatted, {
        parse_mode: "MarkdownV2",
      });
      return;
    } catch (error: unknown) {
      if (error instanceof GrammyError && /message to edit not found/i.test(error.description)) {
        await clearPinnedMessageId();
      } else if (isMarkdownParseError(error)) {
        try {
          await bot.api.editMessageText(config.bot.channel, pinnedId, text);
          return;
        } catch (plainError) {
          logger.warn("Failed to edit pinned message as plain text", plainError);
          return;
        }
      } else {
        logger.warn("Failed to edit pinned message", error);
        return;
      }
    }
  }

  try {
    const sent = await sendMessage(config.bot.channel, text);
    if (!sent) return;
    await bot.api.pinChatMessage(config.bot.channel, sent);
    await setPinnedMessageId(sent);
  } catch (error) {
    logger.error("Failed to create pinned message", error);
  }
}

function setupChatMessage(setup: SetupEvaluation): { text: string; importance: number } | undefined {
  if (setup.confirmed) {
    return { text: formatConfirmedSetup(setup.confirmed), importance: 3 };
  }
  if (setup.invalidated) {
    return { text: formatSetupInvalidated(setup.invalidated), importance: 2 };
  }
  if (setup.zoneEntered) {
    return { text: formatZoneEntry(setup.zoneEntered), importance: 1 };
  }
  return undefined;
}

async function handleProcessedSignal(message: string): Promise<void> {
  try {
    const { signal, context, setup } = JSON.parse(message) as {
      signal: { type: string; [key: string]: unknown };
      context?: SignalContext;
      setup?: SetupEvaluation;
    };

    const safeContext: SignalContext = {
      isChochInPOI: false,
      isSwingPOI: false,
      hasImbalanceTarget: false,
      ...(context ?? {}),
    };

    // The board/pin still uses the legacy market context, but chat messages
    // now come from the setup engine only.
    let pinDecision: ReturnType<typeof marketContext.updateContext> | undefined;
    try {
      pinDecision = marketContext.updateContext(signal as never, safeContext);
    } catch (error) {
      logger.warn("Failed to update market context board", error);
    }

    const chatEvent = setup ? setupChatMessage(setup) : undefined;

    if (config.bot.dryRun) {
      logger.info("DRY_RUN signal", {
        shouldPin: pinDecision?.shouldPin ?? false,
        setupEvent: setup?.confirmed ? 'confirmed' : setup?.zoneEntered ? 'zone_entered' : setup?.invalidated ? 'invalidated' : 'none',
        message: chatEvent?.text ?? '(no chat message; structure/pin only)',
      });
      return;
    }

    if (pinDecision?.shouldPin) {
      await updatePinnedMessage();
    }

    if (setup) {
      if (chatEvent) {
        const messageId = await sendMessage(config.bot.channel, chatEvent.text);
        if (messageId) {
          logger.info("Setup event sent", { messageId, importance: chatEvent.importance });
        }
      }
      return;
    }

    // Legacy path for deployments without the engine.
    if (pinDecision?.shouldLog && pinDecision.message) {
      const messageId = await sendMessage(config.bot.channel, pinDecision.message);
      if (messageId && pinDecision.importance > 0) {
        logger.info("Setup message sent", { messageId, importance: pinDecision.importance });
      }
    }
  } catch (error) {
    logger.error("Error processing signal:", error);
    try {
      await publisherClient.publish("monitoring", JSON.stringify({
        type: "error",
        service: "bot",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      }));
    } catch {
      // best-effort monitoring
    }
  }
}

// Cleanup old market context data periodically
const cleanupTimer = setInterval(async () => {
  try {
    marketContext.cleanup();
    logger.info("Cleaned up old market context data");
  } catch (error) {
    logger.error("Error during cleanup:", error);
  }
}, config.bot.messageCleanupInterval);
cleanupTimer.unref?.();

bot.catch((error) => {
  if (error instanceof GrammyError) {
    logger.error("Telegram API error", { description: error.description, code: error.error_code });
  } else if (error instanceof HttpError) {
    logger.error("Telegram HTTP error", error);
  } else {
    logger.error("Bot error", error);
  }
});

export async function startBot(): Promise<void> {
  subscriberClient.on("message", async (channel, message) => {
    if (channel === "processed_signals") {
      await handleProcessedSignal(message);
    }
  });

  await subscriberClient.subscribe("processed_signals");

  if (config.bot.channel === "@smc_shark_screener") {
    logger.warn("Using the public @smc_shark_screener channel. For a demo, set TELEGRAM_CHANNEL to a private test channel.");
  }

  if (config.bot.dryRun) {
    logger.info("DRY_RUN enabled: signals are logged, nothing is sent to Telegram");
    return;
  }

  logger.info(`Bot started, target channel: ${config.bot.channel}`);
  botStarted = true;
  await bot.start({
    onStart: () => {
      logger.info("Bot started successfully");
    },
    drop_pending_updates: true,
    allowed_updates: ["message", "edited_message", "callback_query"],
  });
}

export async function stopBot(): Promise<void> {
  if (!botStarted) return;
  botStarted = false;
  logger.info("Stopping bot gracefully");
  await bot.stop();
}

export { bot, marketContext };
