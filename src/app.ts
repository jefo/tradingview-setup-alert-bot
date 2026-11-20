import { SignalProcessor } from "./services/signal-processor";
import { SignalValidator } from "./services/signal-validator";
import { SignalEnricher } from "./services/signal-enricher";
import { SignalRepository } from "./services/signal-repository";
import { EventPublisher } from "./services/event-publisher";
import { startBot, stopBot } from "./bot";
import { publisherClient, subscriberClient, stateClient } from "./redis";
import { connectToDatabase, closeDatabase } from "./data/db";
import { logger } from "./logger";
import { SetupEngine } from "./engine/setup-engine";
import { RedisSetupStateStore } from "./engine/state-store";
import { DEFAULT_SETUP_CONFIG } from "./engine/config";
import { config } from "./config";

const setupEngine = new SetupEngine(new RedisSetupStateStore(stateClient), {
  ...DEFAULT_SETUP_CONFIG,
  windows: {
    poiToEntryMs: config.setup.poiToEntrySeconds * 1000,
    entryToConfirmMs: config.setup.entryToConfirmSeconds * 1000,
    bosToChochMs: config.setup.bosToChochSeconds * 1000,
  },
});

const signalProcessor = new SignalProcessor(
  new SignalValidator(),
  new SignalEnricher(),
  new SignalRepository(),
  new EventPublisher(publisherClient),
  subscriberClient,
  setupEngine,
);

let shuttingDown = false;

async function startServices() {
  try {
    // Mongo is optional for the demo: alerts still flow if it is unavailable.
    try {
      await connectToDatabase();
    } catch (error) {
      logger.warn("MongoDB is unavailable, continuing without persistence", error);
    }

    await signalProcessor.start();
    await startBot();
  } catch (error) {
    logger.error('Failed to start services:', error);
    process.exit(1);
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down services...');
  try {
    await stopBot();
    await signalProcessor.stop();
    await publisherClient.quit();
    await stateClient.quit();
    await closeDatabase().catch(() => undefined);
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

startServices();
