import { Signal } from "../signals";
import { ISignalRepository } from "../types/signal-processing";
import { alertsCollection } from "../data/db";
import { logger } from "./logger";

export class SignalRepository implements ISignalRepository {
  private lastWarnAt = 0;

  private warnThrottled(message: string, error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarnAt < 60_000) return;
    this.lastWarnAt = now;
    logger.warn(message, error);
  }

  async saveSignal(signal: Signal): Promise<void> {
    try {
      await alertsCollection.insertOne({
        msg: signal.raw,
        timestamp: signal.timestamp || new Date(),
        signalType: signal.type,
        signalState: signal.state,
        signalLevel: signal.level,
        direction: signal.direction,
        normalized: signal.normalized,
        context: signal.context
      });
    } catch (error) {
      this.warnThrottled("Error saving signal (persistence skipped)", error);
      // Persistence is best-effort for the demo.
    }
  }

  async getRecentSignals(limit: number): Promise<Signal[]> {
    try {
      const recentAlerts = await alertsCollection
        .find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      return recentAlerts.map(alert => ({
        raw: alert.msg,
        type: alert.signalType,
        state: alert.signalState,
        level: alert.signalLevel,
        direction: alert.direction,
        normalized: alert.normalized,
        context: alert.context,
        timestamp: alert.timestamp
      }));
    } catch (error) {
      this.warnThrottled("Recent signals unavailable, continuing without history", error);
      return [];
    }
  }
}
