import { describe, expect, test } from "bun:test";
import { SetupEngine } from "./setup-engine";
import { MemorySetupStateStore } from "./state-store";
import { formatConfirmedSetup, formatSetupInvalidated, formatZoneEntry } from "./format";
import { Signal, SignalLevel, SignalState, SignalType } from "../signals";

const NOW = Date.now();
const BASE = NOW - 2 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

type SignalOptions = {
  type: SignalType;
  state: SignalState;
  level?: SignalLevel;
  direction?: 'bullish' | 'bearish';
  symbol?: string;
  timeframe?: string;
  time?: number;
  price?: string;
  range?: string;
};

function makeSignal(options: SignalOptions): Signal {
  const direction = options.direction ?? 'bullish';
  const symbol = options.symbol ?? 'BTCUSDT';
  const timeframe = options.timeframe ?? '15m';
  const label = `${options.type} ${options.state}`;

  return {
    raw: `${label} | ${symbol} | ${timeframe}${options.price ? ` | ${options.price}` : ''}`,
    normalized: label.toLowerCase(),
    type: options.type,
    state: options.state,
    level: options.level ?? SignalLevel.INTERNAL,
    direction,
    timestamp: new Date(options.time ?? BASE),
    context: {
      isChochInPOI: false,
      isSwingPOI: false,
      hasImbalanceTarget: false,
      symbol,
      timeframe,
      price: options.price,
      range: options.range,
    },
  };
}

function engine() {
  return new SetupEngine(new MemorySetupStateStore());
}

async function evaluate(instance: SetupEngine, signal: Signal) {
  return instance.evaluate(signal, signal.context!);
}

function bullishSequence(instance: SetupEngine, symbol = 'BTCUSDT') {
  return [
    makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      symbol,
      timeframe: '4h',
      time: BASE,
      range: '68,000-68,200',
    }),
    makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.ENTERED,
      symbol,
      timeframe: '15m',
      time: BASE + 30 * MIN,
      price: '68,100',
    }),
    makeSignal({
      type: SignalType.BOS,
      state: SignalState.FORMED,
      symbol,
      timeframe: '15m',
      time: BASE + 45 * MIN,
      direction: 'bearish',
      price: '68,050',
    }),
    makeSignal({
      type: SignalType.CHOCH,
      state: SignalState.FORMED,
      symbol,
      timeframe: '15m',
      time: BASE + 61 * MIN,
      direction: 'bullish',
      price: '68,120',
    }),
  ];
}

describe('SetupEngine: intended HTF -> LTF sequence', () => {
  test('A. confirms a 4H POI after 15m entry, BOS and CHoCH', async () => {
    const setupEngine = engine();
    const signals = bullishSequence(setupEngine);

    const created = await evaluate(setupEngine, signals[0]);
    expect(created.poiCreated).toBeDefined();

    const entered = await evaluate(setupEngine, signals[1]);
    expect(entered.zoneEntered).toBeDefined();
    expect(entered.zoneEntered!.ltfs).toContain('15m');

    const bos = await evaluate(setupEngine, signals[2]);
    expect(bos.confirmed).toBeUndefined();

    const confirmed = await evaluate(setupEngine, signals[3]);
    expect(confirmed.confirmed).toBeDefined();
    expect(confirmed.confirmed!.setup.htf).toBe('4h');
    expect(confirmed.confirmed!.setup.ltf).toBe('15m');
    expect(confirmed.confirmed!.setup.bosAt).toBe(BASE + 45 * MIN);
    expect(confirmed.confirmed!.setup.chochAt).toBe(BASE + 61 * MIN);
    expect(confirmed.confirmed!.setup.quality).toBe('MEDIUM');

    const text = formatConfirmedSetup(confirmed.confirmed!);
    expect(text).toContain('BTCUSDT SETUP CONFIRMED');
    expect(text).toContain('4H Order Block');
    expect(text).toContain('T0:');
    expect(text).toContain('T3:');
    expect(text).toContain('QUALITY: MEDIUM');
  });

  test('A2. quality is HIGH when a target imbalance exists', async () => {
    const setupEngine = engine();
    const signals = bullishSequence(setupEngine);

    await evaluate(setupEngine, signals[0]);
    await evaluate(setupEngine, makeSignal({
      type: SignalType.IMBALANCE,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      timeframe: '4h',
      time: BASE + 10 * MIN,
      direction: 'bearish',
      range: '68,400-68,500',
    }));
    await evaluate(setupEngine, signals[1]);
    await evaluate(setupEngine, signals[2]);

    const confirmed = await evaluate(setupEngine, signals[3]);
    expect(confirmed.confirmed).toBeDefined();
    expect(confirmed.confirmed!.setup.target).toBeDefined();
    expect(confirmed.confirmed!.setup.quality).toBe('HIGH');
    expect(formatConfirmedSetup(confirmed.confirmed!)).toContain('bearish imbalance');
  });
});

describe('SetupEngine: false positives are rejected', () => {
  test('B. a POI from another symbol cannot confirm a CHoCH', async () => {
    const setupEngine = engine();
    await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      symbol: 'BTCUSDT',
      timeframe: '4h',
      range: '68,000-68,200',
    }));

    const result = await evaluate(setupEngine, makeSignal({
      type: SignalType.CHOCH,
      state: SignalState.FORMED,
      symbol: 'ETHUSDT',
      timeframe: '15m',
      time: BASE + 30 * MIN,
      price: '3,450',
    }));

    expect(result.confirmed).toBeUndefined();
    expect(result.zoneEntered).toBeUndefined();
  });

  test('C. a stale POI is not used', async () => {
    const setupEngine = engine();
    await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      timeframe: '4h',
      time: NOW - 3 * 24 * HOUR,
      range: '68,000-68,200',
    }));

    const result = await evaluate(setupEngine, makeSignal({
      type: SignalType.CHOCH,
      state: SignalState.FORMED,
      timeframe: '15m',
      time: BASE + 30 * MIN,
      price: '68,120',
    }));

    expect(result.confirmed).toBeUndefined();
  });

  test('D. a CHoCH without entry and BOS is not a setup', async () => {
    const setupEngine = engine();
    await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      timeframe: '4h',
      range: '68,000-68,200',
    }));

    const result = await evaluate(setupEngine, makeSignal({
      type: SignalType.CHOCH,
      state: SignalState.FORMED,
      timeframe: '15m',
      time: BASE + 30 * MIN,
      price: '68,120',
    }));

    expect(result.confirmed).toBeUndefined();
  });

  test('E. a 1m POI cannot be confirmed on 1D', async () => {
    const setupEngine = engine();
    await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      timeframe: '1m',
      range: '68,000-68,200',
    }));

    const result = await evaluate(setupEngine, makeSignal({
      type: SignalType.CHOCH,
      state: SignalState.FORMED,
      timeframe: '1d',
      time: BASE + 30 * MIN,
      price: '68,120',
    }));

    expect(result.confirmed).toBeUndefined();
  });

  test('F. an invalidated POI cannot be confirmed', async () => {
    const setupEngine = engine();
    const signals = bullishSequence(setupEngine);

    await evaluate(setupEngine, signals[0]);
    await evaluate(setupEngine, signals[1]);

    const invalidation = await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.EXIT,
      level: SignalLevel.SWING,
      timeframe: '4h',
      time: BASE + 50 * MIN,
      price: '67,900',
    }));

    expect(invalidation.invalidated).toBeDefined();
    expect(formatSetupInvalidated(invalidation.invalidated!)).toContain('SETUP INVALIDATED');

    const result = await evaluate(setupEngine, signals[3]);
    expect(result.confirmed).toBeUndefined();
  });

  test('G. a standalone swing BOS is not a confirmed setup', async () => {
    const setupEngine = engine();
    const result = await evaluate(setupEngine, makeSignal({
      type: SignalType.BOS,
      state: SignalState.FORMED,
      level: SignalLevel.SWING,
      timeframe: '1h',
      time: BASE,
      price: '68,200',
    }));

    expect(result.confirmed).toBeUndefined();
    expect(result.events).toHaveLength(0);
  });

  test('I. another symbol cannot invalidate a BTC setup', async () => {
    const setupEngine = engine();
    const signals = bullishSequence(setupEngine);

    await evaluate(setupEngine, signals[0]);
    await evaluate(setupEngine, signals[1]);
    await evaluate(setupEngine, signals[2]);

    const ethEvent = await evaluate(setupEngine, makeSignal({
      type: SignalType.BOS,
      state: SignalState.FORMED,
      level: SignalLevel.SWING,
      symbol: 'ETHUSDT',
      timeframe: '15m',
      time: BASE + 50 * MIN,
      direction: 'bearish',
      price: '3,000',
    }));

    expect(ethEvent.invalidated).toBeUndefined();

    const confirmed = await evaluate(setupEngine, signals[3]);
    expect(confirmed.confirmed).toBeDefined();
  });
});

describe('SetupEngine: timing and structure rules', () => {
  test('H. confirmation does not depend on Mongo/history (state lives in the store)', async () => {
    // The engine above has no repository at all: only its state store.
    const setupEngine = engine();
    const signals = bullishSequence(setupEngine);

    await evaluate(setupEngine, signals[0]);
    const entered = await evaluate(setupEngine, signals[1]);
    expect(entered.zoneEntered).toBeDefined();
    await evaluate(setupEngine, signals[2]);

    const confirmed = await evaluate(setupEngine, signals[3]);
    expect(confirmed.confirmed).toBeDefined();
  });

  test('rejects an entry outside the POI range', async () => {
    const setupEngine = engine();
    await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      timeframe: '4h',
      range: '68,000-68,200',
    }));

    const entry = await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.ENTERED,
      timeframe: '15m',
      time: BASE + 20 * MIN,
      price: '69,000',
    }));

    expect(entry.zoneEntered).toBeUndefined();
  });

  test('rejects a CHoCH that comes before the 15 minute BOS delay', async () => {
    const setupEngine = engine();
    const signals = bullishSequence(setupEngine);

    await evaluate(setupEngine, signals[0]);
    await evaluate(setupEngine, signals[1]);
    await evaluate(setupEngine, signals[2]);

    const tooFast = await evaluate(setupEngine, makeSignal({
      type: SignalType.CHOCH,
      state: SignalState.FORMED,
      timeframe: '15m',
      time: BASE + 45 * MIN + 10 * MIN,
      price: '68,120',
    }));
    expect(tooFast.confirmed).toBeUndefined();

    const valid = await evaluate(setupEngine, makeSignal({
      type: SignalType.CHOCH,
      state: SignalState.FORMED,
      timeframe: '15m',
      time: BASE + 45 * MIN + 16 * MIN,
      price: '68,125',
    }));
    expect(valid.confirmed).toBeDefined();
  });

  test('expires a setup when confirmation takes longer than 4 hours', async () => {
    const setupEngine = engine();

    await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      timeframe: '4h',
      time: NOW - 6 * HOUR,
      range: '68,000-68,200',
    }));
    await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.ENTERED,
      timeframe: '15m',
      time: NOW - 5 * HOUR,
      price: '68,100',
    }));
    await evaluate(setupEngine, makeSignal({
      type: SignalType.BOS,
      state: SignalState.FORMED,
      timeframe: '15m',
      time: NOW - 4 * HOUR - 30 * MIN,
      direction: 'bearish',
      price: '68,050',
    }));

    const result = await evaluate(setupEngine, makeSignal({
      type: SignalType.CHOCH,
      state: SignalState.FORMED,
      timeframe: '15m',
      time: NOW - 30 * MIN,
      price: '68,120',
    }));

    expect(result.confirmed).toBeUndefined();
  });

  test('opposing swing structure invalidates the pending setup', async () => {
    const setupEngine = engine();
    const signals = bullishSequence(setupEngine);

    await evaluate(setupEngine, signals[0]);
    await evaluate(setupEngine, signals[1]);

    const opposing = await evaluate(setupEngine, makeSignal({
      type: SignalType.BOS,
      state: SignalState.FORMED,
      level: SignalLevel.SWING,
      timeframe: '4h',
      time: BASE + 50 * MIN,
      direction: 'bearish',
      price: '67,800',
    }));

    expect(opposing.invalidated).toBeDefined();

    const result = await evaluate(setupEngine, signals[3]);
    expect(result.confirmed).toBeUndefined();
  });

  test('zone entry message contains the HTF zone and waiting LTFs', async () => {
    const setupEngine = engine();
    const signals = bullishSequence(setupEngine);

    await evaluate(setupEngine, signals[0]);
    const entered = await evaluate(setupEngine, signals[1]);

    const text = formatZoneEntry(entered.zoneEntered!);
    expect(text).toContain('4H Bullish Order Block');
    expect(text).toContain('68,000-68,200');
    expect(text).toContain('15M');
  });

  test('post-confirmation invalidation is reported', async () => {
    const setupEngine = engine();
    const signals = bullishSequence(setupEngine);

    await evaluate(setupEngine, signals[0]);
    await evaluate(setupEngine, signals[1]);
    await evaluate(setupEngine, signals[2]);

    const confirmed = await evaluate(setupEngine, signals[3]);
    expect(confirmed.confirmed).toBeDefined();

    const invalidation = await evaluate(setupEngine, makeSignal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.EXIT,
      level: SignalLevel.SWING,
      timeframe: '4h',
      time: BASE + 70 * MIN,
      price: '67,900',
    }));

    expect(invalidation.invalidated).toBeDefined();
    expect(invalidation.invalidated!.setups.some(setup => setup.phase === 'INVALIDATED')).toBe(true);
    expect(formatSetupInvalidated(invalidation.invalidated!)).toContain('price exited the zone');
  });
});
