import dotenv from "dotenv";
import { cleanEnv, str } from "envalid";

// Load environment variables from .env file
dotenv.config();

// Validate and clean environment variables
export const env =
  process.env.NODE_ENV === "test"
    ? {
        BOT_TOKEN: "test-token",
        REDIS_URL: "redis://mock",
        NODE_ENV: "test",
        PORT: "3000",
        TELEGRAM_CHANNEL: "@test_channel",
        WEBHOOK_SECRET: "test-secret",
        MONGODB_URL: "mongodb://127.0.0.1:27017/smcshark",
        MONGODB_DB: "smcshark_test",
        DRY_RUN: "false",
        SETUP_POI_TO_ENTRY_SECONDS: "86400",
        SETUP_ENTRY_TO_CONFIRM_SECONDS: "14400",
        SETUP_BOS_TO_CHOCH_SECONDS: "900"
      }
    : cleanEnv(process.env, {
        PORT: str({ default: "3000" }),
        BOT_TOKEN: str(),
        REDIS_URL: str({ default: "redis://127.0.0.1:6390" }),
        NODE_ENV: str({
          choices: ["development", "test", "production"],
          default: "development",
        }),
        TELEGRAM_CHANNEL: str({ default: "@smc_shark_screener" }),
        WEBHOOK_SECRET: str({ default: "" }),
        MONGODB_URL: str({ default: "mongodb://127.0.0.1:27017/smcshark" }),
        MONGODB_DB: str({ default: "smcshark" }),
        DRY_RUN: str({ default: "false" }),
        SETUP_POI_TO_ENTRY_SECONDS: str({ default: "86400" }),
        SETUP_ENTRY_TO_CONFIRM_SECONDS: str({ default: "14400" }),
        SETUP_BOS_TO_CHOCH_SECONDS: str({ default: "900" }),
      });

// Export validated configuration
export const config = {
  api: {
    port: parseInt(env.PORT) || 3000,
    webhookSecret: env.WEBHOOK_SECRET,
  },
  bot: {
    token: env.BOT_TOKEN,
    channel: env.TELEGRAM_CHANNEL,
    dryRun: env.DRY_RUN === "true",
    retryLimit: 3,
    retryDelay: 1000,
    messageCleanupInterval: 60 * 60 * 1000, // 1 hour
    messageRetention: {
      swingPOI: 24 * 60 * 60 * 1000,    // 24 hours
      choch: 12 * 60 * 60 * 1000,       // 12 hours
      liquidityGrab: 4 * 60 * 60 * 1000, // 4 hours
      default: 6 * 60 * 60 * 1000       // 6 hours
    },
    signalTimeout: {
      chochAfterPOI: 4 * 60 * 60 * 1000  // 4 hours to wait for CHOCH after POI
    }
  },
  redis: {
    url: env.REDIS_URL,
    retryAttempts: 3,
    retryDelay: 1000,
    keys: {
      marketContext: "market_context_backup",
      messageTracking: "message_tracking",
      lastSignal: "last_signal",
      pinnedMessage: (chatId: string) => `pinned_message:${chatId}`,
    }
  },
  mongodb: {
    url: env.MONGODB_URL,
    dbName: env.MONGODB_DB,
    options: {
      authSource: "admin",
    },
  },
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 120, // TradingView can burst, but not unbounded
  },
  setup: {
    poiToEntrySeconds: Number(env.SETUP_POI_TO_ENTRY_SECONDS),
    entryToConfirmSeconds: Number(env.SETUP_ENTRY_TO_CONFIRM_SECONDS),
    bosToChochSeconds: Number(env.SETUP_BOS_TO_CHOCH_SECONDS),
  },
  trading: {
    tsName: "alerts",
  },
};
