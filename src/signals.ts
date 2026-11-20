import { logger } from "logger";

export enum SignalType {
  ORDER_BLOCK = 'ORDER_BLOCK',
  IMBALANCE = 'IMBALANCE',
  CHOCH = 'CHOCH',
  CHOCH_PLUS = 'CHOCH_PLUS',
  BOS = 'BOS',
  LIQUIDITY_GRAB = 'LIQUIDITY_GRAB',
  EQUAL_HIGHS = 'EQUAL_HIGHS',
  EQUAL_LOWS = 'EQUAL_LOWS',
  OTHER = 'OTHER'
}

export enum SignalState {
  ENTERED = 'ENTERED',
  EXIT = 'EXIT',
  WITHIN = 'WITHIN',
  MITIGATED = 'MITIGATED',
  BREAKER = 'BREAKER',
  NEW = 'NEW',
  GRAB = 'GRAB',
  FORMED = 'FORMED',
  CREATED = 'CREATED',
  BROKE = 'BROKE',
  DETECTED = 'DETECTED',
  UNKNOWN = 'UNKNOWN'
}

export enum SignalLevel {
  SWING = 'SWING',
  INTERNAL = 'INTERNAL'
}

export interface SignalContext {
  isChochInPOI: boolean;
  isSwingPOI: boolean;
  hasImbalanceTarget: boolean;
  targetDirection?: 'bullish' | 'bearish';
  poiType?: 'imbalance' | 'order_block';
  symbol?: string;
  timeframe?: string;
  price?: string;
  range?: string;
  entryPrice?: string;
  bosPrice?: string;
  chochPrice?: string;
  invalidationLevel?: string;
  /** Display label used by callers/tests (e.g. "Internal"). */
  level?: string;
}

export interface Signal {
  raw: string;
  normalized: string;
  type: SignalType;
  state?: SignalState;
  level: SignalLevel;
  direction?: 'bullish' | 'bearish';
  timestamp?: Date;
  context?: SignalContext;
}

/**
 * Loose input accepted by MarketContext: external callers and older tests
 * sometimes provide only type/direction/state. Missing fields are filled in.
 */
export type SignalInput = Omit<Partial<Signal>, 'type' | 'state' | 'level' | 'direction'> & {
  type: SignalType | `${SignalType}` | string;
  level?: SignalLevel | `${SignalLevel}` | string;
  state?: SignalState | `${SignalState}` | string;
  direction?: 'bullish' | 'bearish' | string;
};

export interface SignalPayload {
  symbol?: string;
  timeframe?: string;
  price?: string;
  range?: string;
}

/**
 * Words that look like tickers but are part of the SMC vocabulary.
 * Kept uppercase because the raw alert is matched case-insensitively.
 */
const RESERVED_TICKERS = new Set([
  'ALERT', 'BOS', 'BEARISH', 'BULLISH', 'BLOCK', 'BREAK', 'BREAKER', 'BREAKOUT',
  'CHOCH', 'CREATED', 'DETECTED', 'ENTRY', 'EQUAL', 'EXIT',
  'FORMED', 'FVG', 'GRAB', 'HIGH', 'HIGHS', 'INTERNAL', 'LOW', 'LOWS', 'MITIGATED',
  'NEW', 'OB', 'ORDER', 'POI', 'PRICE', 'SETUP', 'SMC', 'STOP', 'SWEEP', 'SWEPT',
  'SWING', 'TARGET', 'TIME', 'UTC', 'WITHIN'
]);

const TIMEFRAME_RE = /\b(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|1w)\b/i;
const NUMBER_RE = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;

function toPriceString(value: string): string | undefined {
  const numeric = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return undefined;
  if (numeric <= 0) return undefined;
  return numeric.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function looksLikeTicker(token: string): boolean {
  const cleaned = token.replace(/[|,;:()[\]{}]/g, '').trim().toUpperCase();
  if (!cleaned) return false;
  if (RESERVED_TICKERS.has(cleaned)) return false;

  // BTC/USDT, ETH/BTC
  if (/^[A-Z]{2,10}\/[A-Z]{2,10}$/.test(cleaned)) return true;

  // BTCUSDT, ETHUSDC, XAUUSD, EURUSD, BTCUSDT.P
  if (/^[A-Z]{2,12}(USDT|USDC|USD|EUR|GBP|JPY|PERP)(\.P)?$/.test(cleaned)) return true;

  // CME/CBOT continuous futures: ES1!, NQ1!, CL1!
  if (/^[A-Z]{1,5}\d{1,2}!$/.test(cleaned)) return true;

  return false;
}

function parseTicker(raw: string): string | undefined {
  const labelled = raw.match(/\b(?:ticker|symbol)\s*[:=]\s*([A-Za-z0-9./_-]{2,24})/i);
  if (labelled && looksLikeTicker(labelled[1])) {
    return labelled[1].replace(/\.P$/i, '').toUpperCase();
  }

  // Prefer tokens that carry an explicit separator or quote currency.
  for (const token of raw.split(/[\s|,;]+/)) {
    if (looksLikeTicker(token)) {
      return token.replace(/[|,;:()[\]{}]/g, '').replace(/\.P$/i, '').toUpperCase();
    }
  }

  return undefined;
}

function parseTimeframe(raw: string): string | undefined {
  const match = raw.match(TIMEFRAME_RE);
  return match ? match[1].toLowerCase() : undefined;
}

function parseRange(raw: string): string | undefined {
  // Require at least 3 digits on both sides to avoid matching dates like 2024-01.
  const match = raw.match(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{3,}(?:\.\d+)?)\s*-\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{3,}(?:\.\d+)?)/);
  if (!match) return undefined;
  const from = toPriceString(match[1]);
  const to = toPriceString(match[2]);
  return from && to ? `${from}-${to}` : undefined;
}

function parsePrice(raw: string): string | undefined {
  const labelled = raw.match(/\b(?:price|close|entry|level)\s*[:=]\s*(-?\d[\d,]*(?:\.\d+)?)/i);
  if (labelled) return toPriceString(labelled[1]);

  // Look inside pipe-separated payloads first: "BOS formed | BTCUSDT | 1H | 68228.9"
  for (const segment of raw.split('|')) {
    const direct = segment.trim().match(/^-?\d[\d,]*(?:\.\d+)?$/);
    if (direct) {
      const price = toPriceString(direct[0]);
      if (price) return price;
    }
  }

  // Bracket payload: "[BTCUSDT 1H 68228.9]"
  const bracket = raw.match(/\[([^\]]+)\]/);
  if (bracket) {
    const withoutTimeframes = bracket[1].replace(/\b\d+[mhdw]\b/gi, ' ');
    const numbers = withoutTimeframes.match(NUMBER_RE) || [];
    if (numbers.length === 1) {
      const price = toPriceString(numbers[0]);
      if (price) return price;
    }
  }

  return undefined;
}

/**
 * Extracts market metadata from the raw TradingView alert before normalization.
 * normalizeSignal() intentionally drops bracketed content, so this must run on raw.
 */
export function parseSignalPayload(raw: string): SignalPayload {
  const text = String(raw ?? '');
  const price = parsePrice(text);
  return {
    symbol: parseTicker(text),
    timeframe: parseTimeframe(text),
    price,
    range: parseRange(text),
  };
}

export function validateSignal(signal: Signal): boolean {
  try {
    if (!signal.raw || !signal.normalized || !signal.level) {
      logger.error('Invalid signal: missing required fields', { signal });
      return false;
    }

    if (!Object.values(SignalType).includes(signal.type)) {
      logger.error('Invalid signal: unknown signal type', { signal });
      return false;
    }

    if (signal.state && !Object.values(SignalState).includes(signal.state)) {
      logger.error('Invalid signal: unknown state', { signal });
      return false;
    }

    if (!Object.values(SignalLevel).includes(signal.level)) {
      logger.error('Invalid signal: unknown level', { signal });
      return false;
    }

    if (signal.direction && !['bullish', 'bearish'].includes(signal.direction)) {
      logger.error('Invalid signal: invalid direction', { signal });
      return false;
    }

    // Allow a small clock skew instead of rejecting anything slightly ahead of us.
    if (signal.timestamp && signal.timestamp.getTime() > Date.now() + 5 * 60 * 1000) {
      logger.error('Invalid signal: future timestamp', { signal });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error validating signal', { error, signal });
    return false;
  }
}

export function normalizeSignal(input: string): string {
  try {
    // Remove any content within square brackets including the brackets
    const withoutBrackets = input.replace(/\s*\[[^\]]*\]/g, '');
    // Replace multiple spaces with single space
    const normalized = withoutBrackets.toLowerCase().replace(/\s+/g, ' ').trim();

    logger.debug('Signal normalized', {
      input,
      normalized,
      timestamp: new Date()
    });

    return normalized;
  } catch (error) {
    logger.error('Error normalizing signal', { error, input });
    return input.toLowerCase().trim();
  }
}

export function detectSignalType(normalized: string): SignalType {
  // Most specific patterns first. "choch+" must win over "choch".
  if (/(choch\+|choch plus)/.test(normalized)) return SignalType.CHOCH_PLUS;
  if (/choch/.test(normalized)) return SignalType.CHOCH;
  if (/(bos|break of structure)/.test(normalized)) return SignalType.BOS;
  if (/(order block|breaker|\bob\b|\bblock\b)/.test(normalized)) return SignalType.ORDER_BLOCK;
  if (/(imbalance|fair value gap|\bfvg\b)/.test(normalized)) return SignalType.IMBALANCE;
  if (/(liquidity grab|\bgrab\b|\bsweep\b|\bswept\b)/.test(normalized)) return SignalType.LIQUIDITY_GRAB;
  if (/equal highs/.test(normalized)) return SignalType.EQUAL_HIGHS;
  if (/equal lows/.test(normalized)) return SignalType.EQUAL_LOWS;

  return SignalType.OTHER;
}

export function detectSignalState(normalized: string): SignalState {
  // "breaker" and "mitigated" are more specific than "formed"/"new".
  if (/mitigated/.test(normalized)) return SignalState.MITIGATED;
  if (/breaker/.test(normalized)) return SignalState.BREAKER;
  if (/entered/.test(normalized)) return SignalState.ENTERED;
  if (/within/.test(normalized)) return SignalState.WITHIN;
  if (/\bexit\b/.test(normalized)) return SignalState.EXIT;
  if (/\bcreated?\b/.test(normalized)) return SignalState.CREATED;
  if (/(breakout|broke|breaks)/.test(normalized)) return SignalState.BROKE;
  if (/(detected|detect)/.test(normalized)) return SignalState.DETECTED;
  if (/formed/.test(normalized)) return SignalState.FORMED;
  if (/(\bgrab\b|\bsweep\b|\bswept\b)/.test(normalized)) return SignalState.GRAB;
  if (/\bnew\b/.test(normalized)) return SignalState.NEW;

  // Unknown wording must not drop the alert: keep it and let the pipeline decide.
  return SignalState.UNKNOWN;
}

export function detectSignalLevel(normalized: string): SignalLevel {
  if (/internal|\bl-/.test(normalized)) {
    return SignalLevel.INTERNAL;
  }
  return SignalLevel.SWING;
}

export function detectDirection(normalized: string): 'bullish' | 'bearish' | undefined {
  if (normalized.includes('bullish')) {
    return 'bullish';
  } else if (normalized.includes('bearish')) {
    return 'bearish';
  }
  return undefined;
}

export function analyzeSignalContext(currentSignal: Signal, previousSignals: Signal[]): SignalContext {
  const context: SignalContext = {
    isChochInPOI: false,
    isSwingPOI: false,
    hasImbalanceTarget: false,
    poiType: currentSignal.type === SignalType.IMBALANCE ? 'imbalance' : 'order_block'
  };

  // Check if current signal is a CHoCH
  if (currentSignal.type === SignalType.CHOCH || currentSignal.type === SignalType.CHOCH_PLUS) {
    // Look for POI (Point of Interest) in previous signals
    const poi = previousSignals.find(s =>
      (s.type === SignalType.ORDER_BLOCK || s.type === SignalType.IMBALANCE) &&
      s.direction === currentSignal.direction
    );

    if (poi) {
      context.isChochInPOI = true;
      context.isSwingPOI = poi.level === SignalLevel.SWING;

      // Look for imbalance in opposite direction
      const imbalance = previousSignals.find(s =>
        s.type === SignalType.IMBALANCE &&
        s.direction !== currentSignal.direction
      );

      if (imbalance) {
        context.hasImbalanceTarget = true;
        context.targetDirection = imbalance.direction;
      }
    }
  }

  return context;
}

export function createSignal(raw: string): Signal {
  try {
    const normalized = normalizeSignal(raw);
    const type = detectSignalType(normalized);
    const state = detectSignalState(normalized);
    const level = detectSignalLevel(normalized);
    const direction = detectDirection(normalized);
    const payload = parseSignalPayload(raw);

    const signal: Signal = {
      raw,
      normalized,
      type,
      state,
      level,
      direction,
      timestamp: new Date(),
      context: {
        isChochInPOI: false,
        isSwingPOI: false,
        hasImbalanceTarget: false,
        poiType: type === SignalType.IMBALANCE ? 'imbalance' : 'order_block',
        ...payload,
      },
    };

    if (!validateSignal(signal)) {
      logger.error('Invalid signal created', { signal });
      throw new Error('Invalid signal');
    }

    logger.info('Signal created', { signal });
    return signal;
  } catch (error) {
    logger.error('Error creating signal', { error, raw });
    throw error;
  }
}

export function isDuplicateSignal(current: Signal, previous: Signal | null): boolean {
  try {
    if (!previous) return false;

    const isDuplicate = current.type === previous.type &&
                       current.normalized === previous.normalized &&
                       current.level === previous.level &&
                       current.state === previous.state;

    if (isDuplicate) {
      logger.info('Duplicate signal detected', {
        current,
        previous
      });
    }

    return isDuplicate;
  } catch (error) {
    logger.error('Error checking duplicate signal', { error, current, previous });
    return false;
  }
}
