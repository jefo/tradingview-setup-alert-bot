import { Signal, SignalContext, analyzeSignalContext, parseSignalPayload } from "../signals";
import { ISignalEnricher } from "../types/signal-processing";
import { logger } from "./logger";

/**
 * Enriches a raw signal with setup context (POI flags) and market metadata
 * parsed from the raw TradingView alert: symbol, timeframe, price, range.
 *
 * No values are invented here. If the alert does not carry a symbol or price,
 * the corresponding fields stay undefined and the message omits them.
 */
export class SignalEnricher implements ISignalEnricher {
  enrich(currentSignal: Signal, recentSignals: Signal[]): Signal {
    try {
      const setupContext = analyzeSignalContext(currentSignal, recentSignals);
      const payload = parseSignalPayload(currentSignal.raw);

      const context: SignalContext = {
        ...setupContext,
        ...payload,
      };

      return {
        ...currentSignal,
        context,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error("Error enriching signal", { error, signal: currentSignal });
      // Context enrichment must never drop an alert. Fall back to the bare signal.
      return currentSignal;
    }
  }
}
