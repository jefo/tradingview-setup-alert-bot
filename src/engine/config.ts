import type { PriceRange } from "./types";

export interface SetupWindows {
  poiToEntryMs: number;
  entryToConfirmMs: number;
  bosToChochMs: number;
}

export interface SetupEngineConfig {
  /** Higher timeframe -> lower timeframes that may confirm its POI. */
  htfToLtf: Record<string, string[]>;
  windows: SetupWindows;
  maxPois: number;
  maxSetups: number;
}

export const DEFAULT_SETUP_CONFIG: SetupEngineConfig = {
  htfToLtf: {
    '1w': ['1d', '4h'],
    '1d': ['4h', '1h'],
    '12h': ['1h'],
    '4h': ['15m', '5m'],
    '1h': ['15m', '5m'],
    '15m': ['5m', '1m'],
  },
  windows: {
    poiToEntryMs: 24 * 60 * 60 * 1000,
    entryToConfirmMs: 4 * 60 * 60 * 1000,
    bosToChochMs: 15 * 60 * 1000,
  },
  maxPois: 50,
  maxSetups: 100,
};

export function normalizeTimeframe(timeframe?: string): string | undefined {
  return timeframe ? timeframe.trim().toLowerCase() : undefined;
}

const TIMEFRAME_MINUTES: Record<string, number> = {
  '1m': 1,
  '3m': 3,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '2h': 120,
  '4h': 240,
  '6h': 360,
  '8h': 480,
  '12h': 720,
  '1d': 1440,
  '1w': 10080,
};

export function timeframeToMinutes(timeframe?: string): number {
  if (!timeframe) return 0;
  return TIMEFRAME_MINUTES[timeframe.toLowerCase()] ?? 0;
}

export function parseNumber(value?: string | number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const numeric = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function parsePriceRange(display?: string): PriceRange | undefined {
  if (!display) return undefined;
  const match = display.match(/(\d[\d,]*(?:\.\d+)?)\s*-\s*(\d[\d,]*(?:\.\d+)?)/);
  if (!match) {
    const single = parseNumber(display);
    return single !== undefined ? { low: single, high: single, display } : undefined;
  }

  const low = parseNumber(match[1]);
  const high = parseNumber(match[2]);
  if (low === undefined || high === undefined) return undefined;
  return {
    low: Math.min(low, high),
    high: Math.max(low, high),
    display,
  };
}

export function isInsideRange(range: PriceRange | undefined, price: number | undefined): boolean {
  if (!range || price === undefined) return true;
  if (range.low === undefined || range.high === undefined) return true;
  const tolerance = Math.max(Math.abs(range.high) * 0.0005, 0.0000001);
  return price >= range.low - tolerance && price <= range.high + tolerance;
}

export function formatRange(range?: PriceRange): string | undefined {
  if (!range) return undefined;
  if (range.display) return range.display;
  if (range.low === undefined || range.high === undefined) return undefined;
  const format = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 8 });
  return range.low === range.high ? format(range.low) : `${format(range.low)}-${format(range.high)}`;
}

export function rangeContains(range: PriceRange | undefined, value: number | undefined): boolean {
  if (!range || value === undefined) return false;
  if (range.low === undefined || range.high === undefined) return false;
  return value >= range.low && value <= range.high;
}
