/**
 * Local replay of the SMC setup engine.
 *
 * Run: bun run replay
 *
 * Feeds a synthetic HTF -> LTF sequence with real timestamps and prints the
 * same messages the bot would send. No Telegram, Redis or TradingView needed.
 */
import { SetupEngine } from "../src/engine/setup-engine";
import { MemorySetupStateStore } from "../src/engine/state-store";
import { formatConfirmedSetup, formatSetupInvalidated, formatZoneEntry } from "../src/engine/format";
import { Signal, SignalLevel, SignalState, SignalType } from "../src/signals";

const MIN = 60 * 1000;
const NOW = Date.now();
const BASE = NOW - 2 * 60 * 60 * 1000;

function signal(options: {
  type: SignalType;
  state: SignalState;
  level?: SignalLevel;
  direction?: 'bullish' | 'bearish';
  symbol?: string;
  timeframe: string;
  time: number;
  price?: string;
  range?: string;
}): Signal {
  const direction = options.direction ?? 'bullish';
  const symbol = options.symbol ?? 'BTCUSDT';
  const label = `${options.type} ${options.state}`;
  return {
    raw: `${label} | ${symbol} | ${options.timeframe}${options.price ? ` | ${options.price}` : ''}`,
    normalized: label.toLowerCase(),
    type: options.type,
    state: options.state,
    level: options.level ?? SignalLevel.INTERNAL,
    direction,
    timestamp: new Date(options.time),
    context: {
      isChochInPOI: false,
      isSwingPOI: false,
      hasImbalanceTarget: false,
      symbol,
      timeframe: options.timeframe,
      price: options.price,
      range: options.range,
    },
  };
}

function printEvents(label: string, evaluation: Awaited<ReturnType<SetupEngine['evaluate']>>) {
  if (evaluation.confirmed) {
    console.log(`\n=== ${label}: CONFIRMED ===\n`);
    console.log(formatConfirmedSetup(evaluation.confirmed));
    return;
  }
  if (evaluation.invalidated) {
    console.log(`\n=== ${label}: INVALIDATED ===\n`);
    console.log(formatSetupInvalidated(evaluation.invalidated));
    return;
  }
  if (evaluation.zoneEntered) {
    console.log(`\n=== ${label}: ZONE ENTRY ===\n`);
    console.log(formatZoneEntry(evaluation.zoneEntered));
    return;
  }
  console.log(`\n=== ${label}: no chat event (${evaluation.events.map(event => event.type).join(', ') || 'state updated'}) ===`);
}

async function bullishSequence() {
  const engine = new SetupEngine(new MemorySetupStateStore());
  const sequence = [
    signal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      timeframe: '4h',
      time: BASE,
      range: '68,000-68,200',
    }),
    signal({
      type: SignalType.IMBALANCE,
      state: SignalState.CREATED,
      level: SignalLevel.SWING,
      direction: 'bearish',
      timeframe: '4h',
      time: BASE + 10 * MIN,
      range: '68,400-68,500',
    }),
    signal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.ENTERED,
      timeframe: '15m',
      time: BASE + 30 * MIN,
      price: '68,100',
    }),
    signal({
      type: SignalType.BOS,
      state: SignalState.FORMED,
      timeframe: '15m',
      direction: 'bearish',
      time: BASE + 45 * MIN,
      price: '68,050',
    }),
    signal({
      type: SignalType.CHOCH,
      state: SignalState.FORMED,
      timeframe: '15m',
      time: BASE + 61 * MIN,
      price: '68,120',
    }),
    signal({
      type: SignalType.ORDER_BLOCK,
      state: SignalState.EXIT,
      level: SignalLevel.SWING,
      timeframe: '4h',
      time: BASE + 75 * MIN,
      price: '67,900',
    }),
  ];

  for (const item of sequence) {
    const evaluation = await engine.evaluate(item, item.context!);
    printEvents(`BTCUSDT ${item.type} ${item.state}`, evaluation);
  }
}

async function crossSymbolNegative() {
  const engine = new SetupEngine(new MemorySetupStateStore());
  await engine.evaluate(signal({
    type: SignalType.ORDER_BLOCK,
    state: SignalState.CREATED,
    level: SignalLevel.SWING,
    timeframe: '4h',
    time: BASE,
    range: '68,000-68,200',
  }), {});

  const eth = signal({
    type: SignalType.CHOCH,
    state: SignalState.FORMED,
    symbol: 'ETHUSDT',
    timeframe: '15m',
    time: BASE + 30 * MIN,
    price: '3,450',
  });
  const evaluation = await engine.evaluate(eth, eth.context!);
  printEvents('ETHUSDT CHoCH after BTC POI', evaluation);
}

console.log('SMCshark setup engine replay');
console.log('Synthetic timestamps, real engine rules.\n');
await bullishSequence();
await crossSymbolNegative();
