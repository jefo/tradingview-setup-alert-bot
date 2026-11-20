import { logger } from "./logger";
import { Signal, SignalContext, createSignal } from "../signals";
import { ISignalValidator } from "../types/signal-processing";
import { ISignalEnricher } from "../types/signal-processing";
import { ISignalRepository } from "../types/signal-processing";
import { IEventPublisher } from "../types/signal-processing";
import { IMessageSubscriber } from "../types/signal-processing";
import type { SetupEngine } from "../engine/setup-engine";
import type { SetupEvaluation } from "../engine/types";

export class SignalProcessor {
  private readonly recentlySeen = new Map<string, number>();
  private static readonly DUPLICATE_WINDOW_MS = 60_000;

  constructor(
    private readonly validator: ISignalValidator,
    private readonly enricher: ISignalEnricher,
    private readonly repository: ISignalRepository,
    private readonly publisher: IEventPublisher,
    private readonly subscriber: IMessageSubscriber,
    private readonly setupEngine?: SetupEngine,
  ) {}

  async start(): Promise<void> {
    try {
      await this.subscriber.subscribe("raw_signals");
      this.subscriber.on("message", this.handleMessage.bind(this));
      logger.info("Signal processor started");
    } catch (error) {
      logger.error("Error starting signal processor", error);
      throw error;
    }
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    if (channel !== "raw_signals") return;
    try {
      await this.processSignal(message);
    } catch (error) {
      // The Redis event emitter does not await handlers. Swallow here so a bad
      // alert never becomes an unhandled rejection that kills the process.
      logger.error("Unhandled error while processing raw signal", error);
    }
  }

  private async processSignal(rawSignal: string): Promise<void> {
    // Create the signal first: invalid payloads are rejected before any I/O.
    const signal = createSignal(rawSignal);
    logger.info("Processing signal", { signal });

    // In-memory dedup keeps the demo usable even when MongoDB is unavailable.
    if (this.isDuplicate(signal)) {
      logger.info("Duplicate signal ignored (in-memory window)", { signal });
      await this.publishMonitoring("info", "signal_rejected", {
        reason: "duplicate_memory",
        type: signal.type,
      });
      return;
    }

    // Storage is optional for the demo: if Mongo is down we still deliver alerts.
    const recentSignals = await this.loadRecentSignals();

    if (!this.validator.validate(signal, recentSignals)) {
      logger.info("Signal validation failed", { signal });
      await this.publishMonitoring("info", "signal_rejected", { type: signal.type });
      return;
    }

    const enrichedSignal = this.enricher.enrich(signal, recentSignals);

    const baseContext: SignalContext = enrichedSignal.context ?? {
      isChochInPOI: false,
      isSwingPOI: false,
      hasImbalanceTarget: false,
    };

    let context = baseContext;
    let setup: SetupEvaluation | undefined;

    if (this.setupEngine) {
      try {
        setup = await this.setupEngine.evaluate(enrichedSignal, baseContext);
        // The engine is the source of truth for confirmation flags.
        context = { ...baseContext, ...setup.context };
      } catch (error) {
        logger.error("SetupEngine evaluation failed, suppressing legacy setup flags", error);
        setup = {
          events: [],
          context: {
            isChochInPOI: false,
            isSwingPOI: false,
            hasImbalanceTarget: false,
          },
        };
        context = { ...baseContext, ...setup.context };
      }
    }

    await this.saveSignal(enrichedSignal);

    await this.publisher.publishProcessedSignal(enrichedSignal, context, setup);

    await this.publishMonitoring("info", "signal_processed", {
      type: enrichedSignal.type,
      level: enrichedSignal.level,
      state: enrichedSignal.state,
      symbol: enrichedSignal.context?.symbol,
      setupEvent: setup?.confirmed ? 'confirmed' : setup?.zoneEntered ? 'zone_entered' : undefined,
    });
  }

  private isDuplicate(signal: Signal): boolean {
    const now = Date.now();
    for (const [key, timestamp] of this.recentlySeen) {
      if (now - timestamp > SignalProcessor.DUPLICATE_WINDOW_MS) {
        this.recentlySeen.delete(key);
      }
    }

    const key = [
      signal.type,
      signal.state ?? '',
      signal.level,
      signal.direction ?? '',
      signal.normalized,
    ].join(':');

    const previous = this.recentlySeen.get(key);
    this.recentlySeen.set(key, now);
    return previous !== undefined && now - previous < SignalProcessor.DUPLICATE_WINDOW_MS;
  }

  private async loadRecentSignals(): Promise<Signal[]> {
    try {
      return await this.repository.getRecentSignals(50);
    } catch (error) {
      logger.warn("Recent signals unavailable, continuing without history", error);
      return [];
    }
  }

  private async saveSignal(signal: Signal): Promise<void> {
    try {
      await this.repository.saveSignal(signal);
    } catch (error) {
      logger.warn("Failed to persist signal, continuing", error);
    }
  }

  private async publishMonitoring(
    type: "info" | "error" | "warning",
    event: string,
    data?: unknown
  ): Promise<void> {
    try {
      await this.publisher.publishMonitoringEvent({
        type,
        service: "signal_processor",
        event,
        data,
      });
    } catch (error) {
      logger.warn("Failed to publish monitoring event", error);
    }
  }

  async stop(): Promise<void> {
    await this.subscriber.quit();
    logger.info("Signal processor stopped");
  }
}
