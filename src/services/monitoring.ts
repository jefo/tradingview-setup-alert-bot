import { IRedisClient } from "./redis-client";
import { logger } from "../logger";
import { SignalType, SignalLevel } from "../signals";

interface MonitoringEvent {
  type: 'error' | 'warning' | 'info';
  service: string;
  event: string;
  error?: string;
  signal?: {
    type: SignalType;
    level: SignalLevel;
    timestamp: Date;
  };
  messageId?: number;
  status?: Record<string, string>;
  timestamp: Date;
}

interface SignalMetrics {
  totalSignals: number;
  swingPOICount: number;
  chochCount: number;
  liquidityGrabCount: number;
  successfulSetups: number;  // When we get CHOCH after Swing POI
}

export class MonitoringService {
  private subscriber: IRedisClient;
  private publisher: IRedisClient;
  private healthChecks: Map<string, Date>;
  private metrics: SignalMetrics;
  private lastSignalTimestamp: Map<SignalType, Date>;
  
  constructor(publisherClient: IRedisClient, subscriberClient: IRedisClient) {
    this.publisher = publisherClient;
    this.subscriber = subscriberClient;
    this.healthChecks = new Map();
    this.lastSignalTimestamp = new Map();
    this.metrics = {
      totalSignals: 0,
      swingPOICount: 0,
      chochCount: 0,
      liquidityGrabCount: 0,
      successfulSetups: 0
    };
  }

  async start() {
    // Subscribe to monitoring channel
    await this.subscriber.subscribe('monitoring');
    
    this.subscriber.on('message', (channel, message) => {
      if (channel === 'monitoring') {
        this.handleMonitoringEvent(JSON.parse(message));
      }
    });

    // Start periodic health check reporting
    setInterval(() => this.reportHealthStatus(), 60000); // Every minute
    
    // Start periodic metrics reporting
    setInterval(() => this.reportMetrics(), 300000); // Every 5 minutes

    logger.info('Monitoring service started');
  }

  private handleMonitoringEvent(event: MonitoringEvent) {
    // Update service last seen timestamp
    this.healthChecks.set(event.service, new Date());

    // Track signal metrics
    if (event.signal) {
      this.updateSignalMetrics(event);
    }

    // Log events based on type
    switch (event.type) {
      case 'error':
        logger.error(`[${event.service}] Error:`, { 
          error: event.error,
          signal: event.signal,
          messageId: event.messageId
        });
        break;
      case 'warning':
        logger.warn(`[${event.service}] Warning:`, event);
        break;
      case 'info':
        logger.info(`[${event.service}] Info:`, event);
        break;
    }
  }

  private updateSignalMetrics(event: MonitoringEvent) {
    if (!event.signal) return;

    this.metrics.totalSignals++;
    this.lastSignalTimestamp.set(event.signal.type, new Date(event.signal.timestamp));

    switch (event.signal.type) {
      case SignalType.ORDER_BLOCK:
      case SignalType.IMBALANCE:
        if (event.signal.level === SignalLevel.SWING) {
          this.metrics.swingPOICount++;
        }
        break;
      case SignalType.CHOCH:
        this.metrics.chochCount++;
        // Check if this CHOCH follows a recent Swing POI
        const lastPOI = this.lastSignalTimestamp.get(SignalType.ORDER_BLOCK) || 
                       this.lastSignalTimestamp.get(SignalType.IMBALANCE);
        if (lastPOI && (new Date().getTime() - lastPOI.getTime() <= 4 * 60 * 60 * 1000)) {
          this.metrics.successfulSetups++;
        }
        break;
      case SignalType.LIQUIDITY_GRAB:
        this.metrics.liquidityGrabCount++;
        break;
    }
  }

  private async reportHealthStatus() {
    const now = new Date();
    const status: Record<string, string> = {};

    this.healthChecks.forEach((lastSeen, service) => {
      const timeSinceLastSeen = now.getTime() - lastSeen.getTime();
      status[service] = timeSinceLastSeen < 300000 ? 'healthy' : 'unhealthy';
    });

    // Publish health status to monitoring channel
    await this.publisher.publish('monitoring', JSON.stringify({
      type: 'info',
      service: 'monitoring',
      event: 'health_status',
      status,
      timestamp: now
    }));

    logger.info('System Health Status:', status);
  }

  private async reportMetrics() {
    const successRate = this.metrics.swingPOICount > 0 
      ? (this.metrics.successfulSetups / this.metrics.swingPOICount * 100).toFixed(2)
      : '0';

    await this.publisher.publish('monitoring', JSON.stringify({
      type: 'info',
      service: 'monitoring',
      event: 'metrics',
      metrics: {
        ...this.metrics,
        successRate: `${successRate}%`,
        timestamp: new Date()
      }
    }));

    logger.info('Signal Metrics:', {
      ...this.metrics,
      successRate: `${successRate}%`
    });
  }

  async stop() {
    await this.subscriber.quit();
    await this.publisher.quit();
    logger.info('Monitoring service stopped');
  }
}
