import { describe, test, expect } from 'bun:test';
import { SignalProcessor } from './services/signal-processor';
import { SignalValidator } from './services/signal-validator';
import { SignalEnricher } from './services/signal-enricher';
import type {
  IMessageSubscriber,
  ISignalRepository,
  IEventPublisher,
  MonitoringEvent,
} from './types/signal-processing';
import type { Signal, SignalContext } from './signals';
import { SignalType, SignalState, SignalLevel } from './signals';
import { MarketContext } from './market-context';
import { MockRedisClient } from './services/__mocks__/redis-client';
import { MdStringBuilder } from './utils/md-string-builder';

class FakeSubscriber implements IMessageSubscriber {
  private handler?: (channel: string, message: string) => void;

  async subscribe(_channel: string): Promise<void> {}

  on(_event: string, callback: (channel: string, message: string) => void): void {
    this.handler = callback;
  }

  async quit(): Promise<void> {}

  async emit(message: string): Promise<void> {
    // SignalProcessor registers an async handler; await it to make assertions deterministic.
    await (this.handler as unknown as (c: string, m: string) => Promise<void>)('raw_signals', message);
  }
}

class FakeRepository implements ISignalRepository {
  signals: Signal[] = [];

  async saveSignal(signal: Signal): Promise<void> {
    this.signals.push(signal);
  }

  async getRecentSignals(limit: number): Promise<Signal[]> {
    return this.signals.slice(-limit);
  }
}

class FakePublisher implements IEventPublisher {
  published: Array<{ signal: Signal; context: SignalContext }> = [];
  monitoring: MonitoringEvent[] = [];

  async publishProcessedSignal(signal: Signal, context: SignalContext): Promise<void> {
    this.published.push({ signal, context });
  }

  async publishMonitoringEvent(event: MonitoringEvent): Promise<void> {
    this.monitoring.push(event);
  }
}

function createProcessor() {
  const subscriber = new FakeSubscriber();
  const repository = new FakeRepository();
  const publisher = new FakePublisher();
  const processor = new SignalProcessor(
    new SignalValidator(),
    new SignalEnricher(),
    repository,
    publisher,
    subscriber,
  );
  return { processor, subscriber, repository, publisher };
}

describe('Signal pipeline', () => {
  test('parses an OB creation alert with real symbol, timeframe and price', async () => {
    const { processor, subscriber, publisher } = createProcessor();
    await processor.start();

    await subscriber.emit('Bullish OB Created | BTCUSDT | 1H | 68228.9');

    expect(publisher.published).toHaveLength(1);
    const { signal, context } = publisher.published[0];
    expect(signal.type).toBe(SignalType.ORDER_BLOCK);
    expect(signal.state).toBe(SignalState.CREATED);
    expect(signal.direction).toBe('bullish');
    expect(context.symbol).toBe('BTCUSDT');
    expect(context.timeframe).toBe('1h');
    expect(context.price).toBe('68,228.9');
  });

  test('parses an OB breakout alert', async () => {
    const { processor, subscriber, publisher } = createProcessor();
    await processor.start();

    await subscriber.emit('Price broke bullish internal OB | ETHUSDT | 15m | 3450.5');

    expect(publisher.published).toHaveLength(1);
    const { signal, context } = publisher.published[0];
    expect(signal.type).toBe(SignalType.ORDER_BLOCK);
    expect(signal.state).toBe(SignalState.BROKE);
    expect(signal.level).toBe(SignalLevel.INTERNAL);
    expect(context.symbol).toBe('ETHUSDT');
  });

  test('parses BOS and CHoCH alerts from the pine indicator', async () => {
    const { processor, subscriber, publisher } = createProcessor();
    await processor.start();

    await subscriber.emit('Internal Bullish BOS formed | BTCUSDT | 1H | 68230');
    await subscriber.emit('Bullish CHoCH formed | BTCUSDT | 1H | 68250');

    expect(publisher.published.map(item => item.signal.type)).toEqual([
      SignalType.BOS,
      SignalType.CHOCH,
    ]);
    expect(publisher.published[0].signal.level).toBe(SignalLevel.INTERNAL);
    expect(publisher.published[1].signal.state).toBe(SignalState.FORMED);
  });

  test('does not throw on unknown indicator wording', async () => {
    const { processor, subscriber, publisher } = createProcessor();
    await processor.start();

    await subscriber.emit('Equal highs detected | BTCUSDT | 1H');
    await subscriber.emit('Quantum flux observed');

    expect(publisher.published).toHaveLength(2);
    expect(publisher.published[0].signal.type).toBe(SignalType.EQUAL_HIGHS);
    expect(publisher.published[0].signal.state).toBe(SignalState.DETECTED);
    expect(publisher.published[1].signal.type).toBe(SignalType.OTHER);
    expect(publisher.published[1].signal.state).toBe(SignalState.UNKNOWN);
  });

  test('rejects duplicate consecutive signals', async () => {
    const { processor, subscriber, publisher } = createProcessor();
    await processor.start();

    await subscriber.emit('Bullish Grab | BTCUSDT | 1H');
    await subscriber.emit('Bullish Grab | BTCUSDT | 1H');

    expect(publisher.published).toHaveLength(1);
    expect(publisher.monitoring.some(event => event.event === 'signal_rejected')).toBe(true);
  });
});

describe('Market context message flow', () => {
  test('builds a setup message from real alert data, without fallback prices', () => {
    const context = new MarketContext(new MockRedisClient());
    const timestamp = new Date('2026-01-01T13:15:00Z');

    context.updateContext(
      {
        type: SignalType.ORDER_BLOCK,
        direction: 'bullish',
        state: SignalState.NEW,
        level: SignalLevel.INTERNAL,
        timestamp,
        raw: 'Bullish OB Created',
      },
      {
        symbol: 'ETHUSDT',
        timeframe: '15m',
        range: '3,400-3,450',
        invalidationLevel: '3,390',
      },
    );

    const result = context.updateContext(
      {
        type: SignalType.CHOCH,
        direction: 'bullish',
        state: SignalState.FORMED,
        level: SignalLevel.INTERNAL,
        timestamp: new Date(timestamp.getTime() + 60_000),
        raw: 'Internal Bullish CHoCH formed',
      },
      {
        symbol: 'ETHUSDT',
        timeframe: '15m',
        chochPrice: '3,455',
        isChochInPOI: true,
      },
    );

    expect(result.shouldLog).toBe(true);
    expect(result.message).toContain('ETHUSDT SETUP ALERT');
    expect(result.message).toContain('3,455');
    expect(result.message).not.toContain('39,400');
    expect(result.message).not.toContain('BTCUSDT');
  });

  test('does not invent a symbol when the alert has none', () => {
    const context = new MarketContext(new MockRedisClient());
    const result = context.updateContext({
      type: SignalType.ORDER_BLOCK,
      direction: 'bullish',
      state: SignalState.NEW,
      level: SignalLevel.SWING,
      raw: 'Bullish OB Created',
    });

    expect(result.message).toContain('SETUP ALERT');
    expect(result.message).not.toContain('BTCUSDT');
    expect(result.message).not.toContain('39,400');
  });

  test('escapes a formatted message exactly once for Telegram', () => {
    const context = new MarketContext(new MockRedisClient());
    const result = context.updateContext(
      {
        type: SignalType.ORDER_BLOCK,
        direction: 'bullish',
        state: SignalState.NEW,
        level: SignalLevel.INTERNAL,
        raw: 'Bullish OB Created',
      },
      { symbol: 'BTCUSDT', timeframe: '1H' },
    );

    const escaped = new MdStringBuilder().append(result.message).toString();
    expect(escaped).not.toContain('\\\\');
    expect(escaped).toContain('\\| 1H');
    expect(escaped).toContain('\\#btcusdt');
  });
});
