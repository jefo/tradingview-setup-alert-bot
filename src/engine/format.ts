import { formatRange } from "./config";
import type { Direction, PoiState, SetupEvent, SetupState } from "./types";

function capitalize(value?: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function utcTime(timestamp?: number): string | undefined {
  if (!timestamp) return undefined;
  return new Date(timestamp)
    .toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })
    .slice(0, 5);
}

function poiLabel(poi: PoiState): string {
  return poi.type === 'imbalance' ? 'Imbalance' : 'Order Block';
}

function priceSuffix(price?: number): string {
  return price === undefined
    ? ''
    : ` @${price.toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
}

function rangeText(poi: PoiState): string {
  const range = formatRange(poi.range);
  return range ? ` @${range}` : '';
}

function targetDirection(setup: SetupState): Direction {
  return setup.direction === 'bullish' ? 'bearish' : 'bullish';
}

function invalidationText(poi: PoiState): string {
  if (!poi.range) return 'zone exit';
  if (poi.direction === 'bullish') {
    return poi.range.low !== undefined ? `below ${poi.range.low.toLocaleString('en-US')}` : 'below the zone';
  }
  return poi.range.high !== undefined ? `above ${poi.range.high.toLocaleString('en-US')}` : 'above the zone';
}

export function formatZoneEntry(event: Extract<SetupEvent, { type: 'POI_ENTERED' }>): string {
  const { poi, ltfs } = event;
  const lines = [
    `👀 ${poi.symbol} — price entered ${poi.timeframe.toUpperCase()} ${capitalize(poi.direction)} ${poiLabel(poi)}`,
  ];

  const range = formatRange(poi.range);
  if (range) lines.push(`Zone: ${range}`);
  lines.push(`Waiting for ${ltfs.map(ltf => ltf.toUpperCase()).join(' / ')} confirmation: internal BOS → CHoCH`);
  lines.push('');
  lines.push(`#${poi.symbol.toLowerCase()} #poi #waiting`);

  return lines.join('\n');
}

export function formatConfirmedSetup(event: Extract<SetupEvent, { type: 'SETUP_CONFIRMED' }>): string {
  const { setup, poi } = event;
  const lines: string[] = [];

  lines.push(`🎯 ${setup.symbol} SETUP CONFIRMED`);
  lines.push(`📈 Internal ${capitalize(setup.direction)} Reversal in ${setup.htf.toUpperCase()} ${poiLabel(poi)}`);
  lines.push('');
  lines.push('SEQUENCE:');

  lines.push(`1. ✅ ${setup.htf.toUpperCase()} ${capitalize(poi.direction)} ${poiLabel(poi)}${rangeText(poi)}`);
  const t0 = utcTime(poi.createdAt);
  if (t0) lines.push(`   T0: ${t0} UTC`);

  lines.push(`2. ✅ ${setup.ltf.toUpperCase()} price entered POI${priceSuffix(setup.entryPrice)}`);
  const t1 = utcTime(setup.enteredAt);
  if (t1) lines.push(`   T1: ${t1} UTC`);

  lines.push(`3. ✅ ${setup.ltf.toUpperCase()} internal ${capitalize(setup.direction === 'bullish' ? 'bearish' : 'bullish')} BOS${priceSuffix(setup.bosPrice)}`);
  const t2 = utcTime(setup.bosAt);
  if (t2) lines.push(`   T2: ${t2} UTC`);

  lines.push(`4. ✅ ${setup.ltf.toUpperCase()} internal ${capitalize(setup.direction)} CHoCH${priceSuffix(setup.chochPrice)}`);
  const t3 = utcTime(setup.chochAt);
  if (t3) lines.push(`   T3: ${t3} UTC`);

  lines.push('');
  lines.push('RISK:');
  lines.push(`• Invalidation: ${invalidationText(poi)}`);

  if (setup.target) {
    const targetRange = formatRange(setup.target);
    lines.push(`• Target: ${setup.target.timeframe?.toUpperCase() ?? ''} ${targetDirection(setup)} imbalance${targetRange ? ` @${targetRange}` : ''}`);
  }

  lines.push('');
  lines.push(`QUALITY: ${setup.quality ?? 'MEDIUM'}`);
  lines.push(`#${setup.symbol.toLowerCase()} #setup #confirmed`);

  return lines.join('\n');
}

export function formatSetupInvalidated(event: Extract<SetupEvent, { type: 'SETUP_INVALIDATED' }>): string {
  const { poi, setups, reason } = event;
  const lines: string[] = [
    `❌ ${poi.symbol} SETUP INVALIDATED`,
    `${poi.timeframe.toUpperCase()} ${capitalize(poi.direction)} ${poiLabel(poi)}${rangeText(poi)}`,
    `Reason: ${reason}`,
  ];

  const affected = setups.map(setup => setup.ltf.toUpperCase()).join(' / ');
  if (affected) lines.push(`LTFs affected: ${affected}`);

  const lastTime = utcTime(poi.invalidatedAt);
  if (lastTime) lines.push(`Time: ${lastTime} UTC`);

  lines.push('');
  lines.push(`#${poi.symbol.toLowerCase()} #invalidation`);

  return lines.join('\n');
}
