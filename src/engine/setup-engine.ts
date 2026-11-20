import type { Signal, SignalContext } from "../signals";
import { SignalLevel, SignalState, SignalType } from "../signals";
import { logger } from "../services/logger";
import {
  DEFAULT_SETUP_CONFIG,
  formatRange,
  isInsideRange,
  normalizeTimeframe,
  parseNumber,
  parsePriceRange,
  rangeContains,
  timeframeToMinutes,
  type SetupEngineConfig,
} from "./config";
import { emptySymbolState, type PoiState, type PoiType, type SetupEvaluation, type SetupEvent, type SetupState, type SetupStateStore, type SymbolState } from "./types";

const TERMINAL_SETUP_PHASES = new Set(['CONFIRMED', 'INVALIDATED', 'EXPIRED']);
const TERMINAL_POI_STATES = new Set(['CONFIRMED', 'INVALIDATED', 'EXPIRED']);

function isPoiClosed(poi: PoiState): boolean {
  return poi.state === 'INVALIDATED' || poi.state === 'EXPIRED';
}

function isSetupClosed(setup: SetupState): boolean {
  return setup.phase === 'INVALIDATED' || setup.phase === 'EXPIRED';
}

function opposite(direction: 'bullish' | 'bearish'): 'bullish' | 'bearish' {
  return direction === 'bullish' ? 'bearish' : 'bullish';
}

function poiTypeOf(signal: Signal): PoiType | undefined {
  if (signal.type === SignalType.ORDER_BLOCK) return 'order_block';
  if (signal.type === SignalType.IMBALANCE) return 'imbalance';
  return undefined;
}

function isPoiCreation(signal: Signal): boolean {
  return Boolean(poiTypeOf(signal)) &&
    (signal.state === SignalState.NEW || signal.state === SignalState.CREATED);
}

function isPoiEntry(signal: Signal): boolean {
  return Boolean(poiTypeOf(signal)) &&
    (signal.state === SignalState.ENTERED ||
      signal.state === SignalState.WITHIN ||
      signal.state === SignalState.MITIGATED);
}

function isPoiInvalidation(signal: Signal): boolean {
  return Boolean(poiTypeOf(signal)) &&
    (signal.state === SignalState.EXIT || signal.state === SignalState.BROKE);
}

function rangesEqual(a?: PoiState['range'], b?: PoiState['range']): boolean {
  if (!a || !b) return a === b;
  if (a.display && b.display && a.display !== b.display) return false;
  return a.low === b.low && a.high === b.high;
}

function setupId(poiId: string, ltf: string): string {
  return `${poiId}:${ltf}`;
}

function emptyEvaluation(): SetupEvaluation {
  return {
    events: [],
    context: {
      isChochInPOI: false,
      isSwingPOI: false,
      hasImbalanceTarget: false,
    },
  };
}

export class SetupEngine {
  private readonly cache = new Map<string, SymbolState>();

  constructor(
    private readonly store: SetupStateStore,
    private readonly config: SetupEngineConfig = DEFAULT_SETUP_CONFIG,
  ) {}

  async evaluate(
    signal: Signal,
    incomingContext: Partial<SignalContext> = {},
  ): Promise<SetupEvaluation> {
    const context: SignalContext = {
      isChochInPOI: false,
      isSwingPOI: false,
      hasImbalanceTarget: false,
      ...incomingContext,
    };
    const symbol = (context.symbol ?? signal.context?.symbol)?.trim().toUpperCase();
    const timeframe = normalizeTimeframe(context.timeframe ?? signal.context?.timeframe);

    if (!symbol || !timeframe) {
      logger.warn("SetupEngine: symbol or timeframe missing, setup tracking skipped", {
        raw: signal.raw,
        symbol,
        timeframe,
      });
      return emptyEvaluation();
    }

    const timestamp = signal.timestamp?.getTime() ?? Date.now();
    const state = await this.loadState(symbol);
    const events: SetupEvent[] = [];

    this.prune(state, timestamp);

    try {
      this.dispatch(state, signal, context, timeframe, timestamp, events);
    } catch (error) {
      logger.error("SetupEngine: evaluation failed", error);
    }

    this.cap(state);
    await this.saveState(state);

    return this.buildEvaluation(events);
  }

  private dispatch(
    state: SymbolState,
    signal: Signal,
    context: SignalContext,
    timeframe: string,
    timestamp: number,
    events: SetupEvent[],
  ): void {
    const direction = signal.direction;
    if (!direction) return;

    if (isPoiCreation(signal)) {
      this.onPoiCreated(state, signal, context, timeframe, timestamp, events);
      return;
    }

    if (isPoiEntry(signal)) {
      this.onPoiEntered(state, signal, context, timeframe, timestamp, events);
      return;
    }

    if (isPoiInvalidation(signal)) {
      this.onPoiInvalidated(state, signal, timeframe, timestamp, events);
      return;
    }

    if (signal.type === SignalType.BOS && signal.state === SignalState.FORMED) {
      this.onBos(state, signal, context, timeframe, timestamp, events);
      return;
    }

    if ((signal.type === SignalType.CHOCH || signal.type === SignalType.CHOCH_PLUS) &&
        signal.state === SignalState.FORMED) {
      this.onChoch(state, signal, context, timeframe, timestamp, events);
    }
  }

  private onPoiCreated(
    state: SymbolState,
    signal: Signal,
    context: SignalContext,
    timeframe: string,
    timestamp: number,
    events: SetupEvent[],
  ): void {
    const type = poiTypeOf(signal);
    const direction = signal.direction;
    if (!type || !direction) return;

    const range = parsePriceRange(context.range) ??
      (context.price ? parsePriceRange(context.price) : undefined);
    const price = parseNumber(context.price);
    const poi = this.findSamePoi(state, timeframe, type, direction, range, timestamp) ??
      this.createPoi(state, timeframe, type, direction, range, signal.raw, timestamp);

    this.ensureSetups(state, poi, timestamp);

    if (price !== undefined && range && rangeContains(range, price)) {
      this.enterPoi(state, poi, timestamp, price, events);
      return;
    }

    events.push({ type: 'POI_CREATED', poi });
  }

  private onPoiEntered(
    state: SymbolState,
    signal: Signal,
    context: SignalContext,
    timeframe: string,
    timestamp: number,
    events: SetupEvent[],
  ): void {
    const type = poiTypeOf(signal);
    const direction = signal.direction;
    if (!type || !direction) return;

    const price = parseNumber(context.price) ?? parseNumber(context.entryPrice);
    const candidates = state.pois.filter(poi =>
      poi.symbol === state.symbol &&
      poi.type === type &&
      poi.direction === direction &&
      !TERMINAL_POI_STATES.has(poi.state)
    );

    if (candidates.length === 0) {
      logger.info("SetupEngine: entry without known POI, ignored", { signal: signal.raw });
      return;
    }

    // An ENTERED alert can come from any chart: it marks the HTF zone the price
    // actually entered. Prefer the highest timeframe that contains the price.
    const containing = price !== undefined
      ? candidates.filter(candidate => isInsideRange(candidate.range, price))
      : [];
    const pool = containing.length > 0 ? containing : candidates;
    pool.sort((a, b) => timeframeToMinutes(b.timeframe) - timeframeToMinutes(a.timeframe));

    const poi = pool[0];

    if (price !== undefined && poi.range && !isInsideRange(poi.range, price)) {
      logger.info("SetupEngine: entry price is outside POI, ignored", { price, range: poi.range });
      return;
    }

    this.enterPoi(state, poi, timestamp, price, events);
  }

  private onPoiInvalidated(
    state: SymbolState,
    signal: Signal,
    timeframe: string,
    timestamp: number,
    events: SetupEvent[],
  ): void {
    const type = poiTypeOf(signal);
    const direction = signal.direction;
    if (!type || !direction) return;

    const reason = signal.state === SignalState.EXIT
      ? 'price exited the zone'
      : 'price broke the zone';

    for (const poi of state.pois) {
      if (poi.timeframe !== timeframe || poi.type !== type || poi.direction !== direction) continue;
      if (isPoiClosed(poi)) continue;
      this.invalidatePoi(state, poi, timestamp, reason, events);
    }
  }

  private onBos(
    state: SymbolState,
    signal: Signal,
    context: SignalContext,
    timeframe: string,
    timestamp: number,
    events: SetupEvent[],
  ): void {
    const direction = signal.direction;
    if (!direction) return;
    const price = parseNumber(context.price);

    if (signal.level === SignalLevel.SWING) {
      // Opposing swing structure cancels pending setups and negates HTF POIs.
      for (const poi of state.pois) {
        if (poi.timeframe !== timeframe || poi.direction === direction) continue;
        if (isPoiClosed(poi)) continue;
        this.invalidatePoi(state, poi, timestamp, 'opposing swing structure', events);
      }
      return;
    }

    for (const setup of state.setups) {
      if (setup.phase !== 'WAIT_BOS' || setup.ltf !== timeframe) continue;
      if (setup.direction === direction) continue;
      if (setup.enteredAt && timestamp - setup.enteredAt > this.config.windows.entryToConfirmMs) {
        this.expireSetup(setup, timestamp, 'confirmation window expired');
        continue;
      }
      setup.phase = 'WAIT_CHOCH';
      setup.bosAt = timestamp;
      setup.bosPrice = price;
    }
  }

  private onChoch(
    state: SymbolState,
    signal: Signal,
    context: SignalContext,
    timeframe: string,
    timestamp: number,
    events: SetupEvent[],
  ): void {
    const direction = signal.direction;
    if (!direction) return;
    const price = parseNumber(context.price);

    if (signal.level === SignalLevel.SWING) {
      for (const poi of state.pois) {
        if (poi.timeframe !== timeframe || poi.direction === direction) continue;
        if (isPoiClosed(poi)) continue;
        this.invalidatePoi(state, poi, timestamp, 'opposing swing structure', events);
      }
      return;
    }

    for (const setup of state.setups) {
      if (setup.phase !== 'WAIT_CHOCH' || setup.ltf !== timeframe) continue;
      if (setup.direction !== direction) continue;
      if (!setup.bosAt || timestamp - setup.bosAt < this.config.windows.bosToChochMs) continue;
      if (setup.enteredAt && timestamp - setup.enteredAt > this.config.windows.entryToConfirmMs) {
        this.expireSetup(setup, timestamp, 'confirmation window expired');
        continue;
      }

      this.confirmSetup(state, setup, signal, timestamp, price, events);
    }
  }

  private confirmSetup(
    state: SymbolState,
    setup: SetupState,
    signal: Signal,
    timestamp: number,
    price: number | undefined,
    events: SetupEvent[],
  ): void {
    const poi = state.pois.find(candidate => candidate.id === setup.poiId);
    if (!poi) return;

    setup.phase = 'CONFIRMED';
    setup.chochAt = timestamp;
    setup.chochPrice = price;
    setup.confirmedAt = timestamp;
    setup.target = this.findTargetImbalance(state, setup, price);

    const highQuality = Boolean(setup.target) || signal.type === SignalType.CHOCH_PLUS;
    setup.quality = highQuality ? 'HIGH' : 'MEDIUM';

    poi.state = 'CONFIRMED';
    poi.confirmedAt = timestamp;

    // One confirmation per POI: lower/higher LTF alternatives are superseded.
    for (const other of state.setups) {
      if (other.poiId !== poi.id || other.id === setup.id) continue;
      if (TERMINAL_SETUP_PHASES.has(other.phase)) continue;
      other.phase = 'EXPIRED';
      other.invalidReason = `superseded by ${setup.ltf}`;
    }

    events.push({ type: 'SETUP_CONFIRMED', setup, poi });
  }

  private findTargetImbalance(
    state: SymbolState,
    setup: SetupState,
    price: number | undefined,
  ): SetupState['target'] {
    const reference = price ?? setup.chochPrice ?? setup.entryPrice;
    if (reference === undefined) return undefined;

    const candidates = state.pois
      .filter(poi =>
        poi.type === 'imbalance' &&
        poi.id !== setup.poiId &&
        !TERMINAL_POI_STATES.has(poi.state) &&
        poi.range &&
        poi.range.low !== undefined &&
        poi.range.high !== undefined
      )
      .filter(poi => setup.direction === 'bullish'
        ? poi.range!.low! >= reference
        : poi.range!.high! <= reference);

    if (candidates.length === 0) return undefined;

    candidates.sort((a, b) => {
      const aDistance = setup.direction === 'bullish'
        ? a.range!.low! - reference
        : reference - a.range!.high!;
      const bDistance = setup.direction === 'bullish'
        ? b.range!.low! - reference
        : reference - b.range!.high!;
      return aDistance - bDistance;
    });

    const target = candidates[0];
    return {
      ...target.range!,
      timeframe: target.timeframe,
    };
  }

  private enterPoi(
    state: SymbolState,
    poi: PoiState,
    timestamp: number,
    price: number | undefined,
    events: SetupEvent[],
  ): void {
    if (poi.state === 'ACTIVE' && timestamp - poi.createdAt > this.config.windows.poiToEntryMs) {
      this.invalidatePoi(state, poi, timestamp, 'entry window expired', events);
      return;
    }

    if (poi.state === 'ACTIVE') {
      poi.state = 'ENTERED';
      poi.enteredAt = timestamp;
    }

    const enteredLtfs: string[] = [];
    for (const setup of state.setups) {
      if (setup.poiId !== poi.id || setup.phase !== 'WAIT_ENTRY') continue;
      setup.phase = 'WAIT_BOS';
      setup.enteredAt = timestamp;
      setup.entryPrice = price;
      enteredLtfs.push(setup.ltf);
    }

    if (enteredLtfs.length > 0) {
      events.push({ type: 'POI_ENTERED', poi, ltfs: enteredLtfs });
    }
  }

  private invalidatePoi(
    state: SymbolState,
    poi: PoiState,
    timestamp: number,
    reason: string,
    events: SetupEvent[],
  ): void {
    if (isPoiClosed(poi)) return;

    poi.state = 'INVALIDATED';
    poi.invalidatedAt = timestamp;

    const affected = state.setups.filter(setup =>
      setup.poiId === poi.id && !isSetupClosed(setup)
    );
    const notify = affected.some(setup => Boolean(setup.enteredAt || setup.confirmedAt));

    for (const setup of affected) {
      setup.phase = 'INVALIDATED';
      setup.invalidatedAt = timestamp;
      setup.invalidReason = reason;
    }

    if (notify) {
      events.push({ type: 'SETUP_INVALIDATED', poi, setups: affected, reason });
    }
  }

  private ensureSetups(state: SymbolState, poi: PoiState, timestamp: number): string[] {
    const ltfs = this.config.htfToLtf[poi.timeframe] ?? [];
    const created: string[] = [];

    for (const ltf of ltfs) {
      const id = setupId(poi.id, ltf);
      if (state.setups.some(setup => setup.id === id)) continue;

      state.setups.push({
        id,
        poiId: poi.id,
        symbol: poi.symbol,
        htf: poi.timeframe,
        ltf,
        direction: poi.direction,
        phase: 'WAIT_ENTRY',
        createdAt: timestamp,
      });
      created.push(ltf);
    }

    return created;
  }

  private createPoi(
    state: SymbolState,
    timeframe: string,
    type: PoiType,
    direction: 'bullish' | 'bearish',
    range: PoiState['range'],
    source: string,
    timestamp: number,
  ): PoiState {
    const poi: PoiState = {
      id: `${state.symbol}:${timeframe}:${type}:${direction}:${timestamp}`,
      symbol: state.symbol,
      timeframe,
      type,
      direction,
      range,
      state: 'ACTIVE',
      createdAt: timestamp,
      source,
    };
    state.pois.push(poi);
    return poi;
  }

  private findSamePoi(
    state: SymbolState,
    timeframe: string,
    type: PoiType,
    direction: 'bullish' | 'bearish',
    range: PoiState['range'],
    timestamp: number,
  ): PoiState | undefined {
    return state.pois.find(poi =>
      poi.timeframe === timeframe &&
      poi.type === type &&
      poi.direction === direction &&
      !TERMINAL_POI_STATES.has(poi.state) &&
      timestamp - poi.createdAt < 5 * 60 * 1000 &&
      rangesEqual(poi.range, range)
    );
  }

  private expireSetup(setup: SetupState, timestamp: number, reason: string): void {
    if (TERMINAL_SETUP_PHASES.has(setup.phase)) return;
    setup.phase = 'EXPIRED';
    setup.invalidatedAt = timestamp;
    setup.invalidReason = reason;
  }

  private prune(state: SymbolState, timestamp: number): void {
    const now = Date.now();

    for (const poi of state.pois) {
      if (poi.state === 'ACTIVE' && now - poi.createdAt > this.config.windows.poiToEntryMs) {
        poi.state = 'EXPIRED';
        for (const setup of state.setups) {
          if (setup.poiId === poi.id) this.expireSetup(setup, timestamp, 'entry window expired');
        }
      }

      if (poi.state === 'ENTERED' && poi.enteredAt &&
          now - poi.enteredAt > this.config.windows.entryToConfirmMs) {
        poi.state = 'EXPIRED';
        for (const setup of state.setups) {
          if (setup.poiId === poi.id) this.expireSetup(setup, timestamp, 'confirmation window expired');
        }
      }
    }

    for (const setup of state.setups) {
      if (setup.phase !== 'WAIT_BOS' && setup.phase !== 'WAIT_CHOCH') continue;
      if (setup.enteredAt && now - setup.enteredAt > this.config.windows.entryToConfirmMs) {
        this.expireSetup(setup, timestamp, 'confirmation window expired');
      }
    }

    state.pois = state.pois.filter(poi =>
      !TERMINAL_POI_STATES.has(poi.state) || now - (poi.invalidatedAt ?? poi.createdAt) < 24 * 60 * 60 * 1000
    );
    state.setups = state.setups.filter(setup =>
      !TERMINAL_SETUP_PHASES.has(setup.phase) || now - (setup.invalidatedAt ?? setup.createdAt) < 24 * 60 * 60 * 1000
    );
  }

  private cap(state: SymbolState): void {
    if (state.pois.length > this.config.maxPois) {
      const sorted = [...state.pois].sort((a, b) => a.createdAt - b.createdAt);
      const removeCount = state.pois.length - this.config.maxPois;
      const toRemove = new Set(sorted.slice(0, removeCount).map(poi => poi.id));
      state.pois = state.pois.filter(poi => !toRemove.has(poi.id));
      state.setups = state.setups.filter(setup => !toRemove.has(setup.poiId));
    }

    if (state.setups.length > this.config.maxSetups) {
      state.setups = [...state.setups]
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-this.config.maxSetups);
    }
  }

  private async loadState(symbol: string): Promise<SymbolState> {
    try {
      const stored = await this.store.load(symbol);
      if (stored) {
        this.cache.set(symbol, stored);
        return stored;
      }
    } catch (error) {
      logger.warn("SetupEngine: failed to load state, using memory cache", error);
    }

    return this.cache.get(symbol) ?? emptySymbolState(symbol);
  }

  private async saveState(state: SymbolState): Promise<void> {
    state.lastUpdated = Date.now();
    this.cache.set(state.symbol, state);
    try {
      await this.store.save(state);
    } catch (error) {
      logger.warn("SetupEngine: failed to persist state, keeping in memory", error);
    }
  }

  private buildEvaluation(events: SetupEvent[]): SetupEvaluation {
    const confirmed = events.find((event): event is Extract<SetupEvent, { type: 'SETUP_CONFIRMED' }> =>
      event.type === 'SETUP_CONFIRMED'
    );
    const zoneEntered = events.find((event): event is Extract<SetupEvent, { type: 'POI_ENTERED' }> =>
      event.type === 'POI_ENTERED'
    );
    const invalidated = events.find((event): event is Extract<SetupEvent, { type: 'SETUP_INVALIDATED' }> =>
      event.type === 'SETUP_INVALIDATED'
    );
    const poiCreated = events.find((event): event is Extract<SetupEvent, { type: 'POI_CREATED' }> =>
      event.type === 'POI_CREATED'
    );

    return {
      events,
      confirmed,
      zoneEntered,
      invalidated,
      poiCreated,
      context: {
        isChochInPOI: Boolean(confirmed),
        isSwingPOI: Boolean(confirmed),
        hasImbalanceTarget: Boolean(confirmed?.setup.target),
        poiType: confirmed?.poi.type ?? zoneEntered?.poi.type ?? poiCreated?.poi.type,
      },
    };
  }
}
