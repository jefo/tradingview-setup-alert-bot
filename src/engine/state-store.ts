import { emptySymbolState, type SetupStateStore, type SymbolState } from "./types";
import type { IRedisClient } from "../services/redis-client";

export class MemorySetupStateStore implements SetupStateStore {
  private readonly states = new Map<string, SymbolState>();

  async load(symbol: string): Promise<SymbolState | null> {
    const state = this.states.get(symbol.toUpperCase());
    return state ? JSON.parse(JSON.stringify(state)) : null;
  }

  async save(state: SymbolState): Promise<void> {
    this.states.set(state.symbol.toUpperCase(), JSON.parse(JSON.stringify(state)));
  }

  clear(): void {
    this.states.clear();
  }
}

export class RedisSetupStateStore implements SetupStateStore {
  constructor(
    private readonly redis: IRedisClient,
    private readonly prefix = "smc:setup",
  ) {}

  private key(symbol: string): string {
    return `${this.prefix}:${symbol.toUpperCase()}`;
  }

  async load(symbol: string): Promise<SymbolState | null> {
    const raw = await this.redis.get(this.key(symbol));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as SymbolState;
      if (!parsed.pois || !parsed.setups) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async save(state: SymbolState): Promise<void> {
    await this.redis.set(this.key(state.symbol), JSON.stringify(state));
  }
}

export function createEmptyState(symbol: string): SymbolState {
  return emptySymbolState(symbol.toUpperCase());
}
