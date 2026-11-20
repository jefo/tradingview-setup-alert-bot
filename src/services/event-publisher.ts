import { Signal, SignalContext } from "../signals";
import type { SetupEvaluation } from "../engine/types";
import { IEventPublisher, MonitoringEvent } from "../types/signal-processing";
import { IRedisClient } from "./redis-client";
import { logger } from "./logger";

export class EventPublisher implements IEventPublisher {
  constructor(private readonly redisClient: IRedisClient) {}

  async publishProcessedSignal(
    signal: Signal,
    context: SignalContext,
    setup?: SetupEvaluation,
  ): Promise<void> {
    try {
      await this.redisClient.publish(
        "processed_signals",
        JSON.stringify({
          signal,
          context,
          setup,
          timestamp: new Date()
        })
      );
    } catch (error) {
      logger.error("Error publishing processed signal", error);
      throw error;
    }
  }

  async publishMonitoringEvent(event: MonitoringEvent): Promise<void> {
    try {
      await this.redisClient.publish(
        "monitoring",
        JSON.stringify({
          ...event,
          timestamp: event.timestamp || new Date()
        })
      );
    } catch (error) {
      logger.error("Error publishing monitoring event", error);
      throw error;
    }
  }
}
