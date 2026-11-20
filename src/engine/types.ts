import type { Signal, SignalContext } from "../signals";

export type Direction = 'bullish' | 'bearish';
export type PoiType = 'order_block' | 'imbalance';

export interface PriceRange {
  low?: number;
  high?: number;
  display?: string;
}

export type PoiLifecycle = 'ACTIVE' | 'ENTERED' | 'CONFIRMED' | 'INVALIDATED' | 'EXPIRED';

export interface PoiState {
  id: string;
  symbol: string;
  timeframe: string;
  type: PoiType;
  direction: Direction;
  range?: PriceRange;
  state: PoiLifecycle;
  createdAt: number;
  enteredAt?: number;
  confirmedAt?: number;
  invalidatedAt?: number;
  source: string;
}

export type SetupPhase =
  | 'WAIT_ENTRY'
  | 'WAIT_BOS'
  | 'WAIT_CHOCH'
  | 'CONFIRMED'
  | 'INVALIDATED'
  | 'EXPIRED';

export type SetupQuality = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SetupState {
  id: string;
  poiId: string;
  symbol: string;
  htf: string;
  ltf: string;
  direction: Direction;
  phase: SetupPhase;
  createdAt: number;
  enteredAt?: number;
  entryPrice?: number;
  bosAt?: number;
  bosPrice?: number;
  chochAt?: number;
  chochPrice?: number;
  confirmedAt?: number;
  invalidatedAt?: number;
  invalidReason?: string;
  quality?: SetupQuality;
  target?: PriceRange & { timeframe?: string };
}

export interface SymbolState {
  symbol: string;
  pois: PoiState[];
  setups: SetupState[];
  lastUpdated: number;
}

export type SetupEvent =
  | { type: 'POI_CREATED'; poi: PoiState }
  | { type: 'POI_ENTERED'; poi: PoiState; ltfs: string[] }
  | { type: 'SETUP_CONFIRMED'; setup: SetupState; poi: PoiState }
  | { type: 'SETUP_INVALIDATED'; poi: PoiState; setups: SetupState[]; reason: string };

export interface SetupEvaluation {
  events: SetupEvent[];
  context: Partial<SignalContext>;
  confirmed?: Extract<SetupEvent, { type: 'SETUP_CONFIRMED' }>;
  zoneEntered?: Extract<SetupEvent, { type: 'POI_ENTERED' }>;
  invalidated?: Extract<SetupEvent, { type: 'SETUP_INVALIDATED' }>;
  poiCreated?: Extract<SetupEvent, { type: 'POI_CREATED' }>;
}

export interface SetupStateStore {
  load(symbol: string): Promise<SymbolState | null>;
  save(state: SymbolState): Promise<void>;
}

export interface EvaluatedSignal {
  signal: Signal;
  context: SignalContext;
  setup?: SetupEvaluation;
}

export function emptySymbolState(symbol: string): SymbolState {
  return { symbol, pois: [], setups: [], lastUpdated: Date.now() };
}
