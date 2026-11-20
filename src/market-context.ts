import { IRedisClient } from "./services/redis-client";
import { stateClient } from "./redis";
import { Signal, SignalInput, SignalType, SignalLevel, SignalState, SignalContext } from "./signals";
import { logger } from "./logger";

const BACKUP_KEY = "market_context_backup";
const MAX_ACTIVE_POIS = 100;
const MAX_PINNED_LINES = 90;

interface POI {
  type: SignalType;
  direction?: 'bullish' | 'bearish';
  state?: SignalState;
  timestamp: Date;
  level: SignalLevel;
  symbol?: string;
  timeframe?: string;
  price?: string;
  range?: string;
  invalidationLevel?: string;
  key: string;
  messageId?: number;
}

interface MarketState {
  activePOIs: POI[];
  lastUpdate: Date;
  lastMessageIds: { [key: string]: number };
}

function capitalize(value?: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function timeUTC(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' }).slice(0, 5);
}

function typeLabel(type: SignalType): string {
  switch (type) {
    case SignalType.ORDER_BLOCK: return 'Order Block';
    case SignalType.IMBALANCE: return 'Imbalance';
    case SignalType.CHOCH: return 'CHoCH';
    case SignalType.CHOCH_PLUS: return 'CHoCH+';
    case SignalType.BOS: return 'BOS';
    case SignalType.LIQUIDITY_GRAB: return 'Liquidity Grab';
    case SignalType.EQUAL_HIGHS: return 'Equal Highs';
    case SignalType.EQUAL_LOWS: return 'Equal Lows';
    default: return 'Structure';
  }
}

function levelLabel(level: SignalLevel): string {
  return level === SignalLevel.INTERNAL ? 'Internal' : 'Swing';
}

function timeframeLabel(timeframe?: string): string {
  return timeframe ? timeframe.toUpperCase() : '';
}

function priceSuffix(price?: string): string {
  return price ? ` @${price}` : '';
}

function poiLabel(signal: Signal, context: SignalContext): string {
  if (context.poiType === 'imbalance') return 'Imbalance';
  if (context.poiType === 'order_block') return 'Order Block';
  return typeLabel(signal.type);
}

function normalizeInput(input: SignalInput): Signal {
  return {
    raw: input.raw ?? String(input.type),
    normalized: input.normalized ?? String(input.type).toLowerCase(),
    type: input.type as SignalType,
    state: input.state as SignalState | undefined,
    level: (input.level as SignalLevel) ?? SignalLevel.SWING,
    direction: input.direction === 'bullish' || input.direction === 'bearish' ? input.direction : undefined,
    timestamp: input.timestamp,
    context: input.context,
  };
}

export class MarketContext {
  private activePOIs: POI[] = [];
  private lastUpdate: Date = new Date();
  private lastMessageIds: { [key: string]: number } = {};
  private redisClient: IRedisClient;

  constructor(redisClient: IRedisClient = stateClient) {
    this.redisClient = redisClient;
    Object.values(SignalType).forEach((type) => {
      this.lastMessageIds[type] = 0;
    });
    this.restoreState().catch((error) => {
      logger.error("Failed to restore market context:", error);
    });
  }

  private async backupState() {
    try {
      const state = {
        activePOIs: this.activePOIs,
        lastUpdate: this.lastUpdate,
        lastMessageIds: this.lastMessageIds,
      };
      await this.redisClient.set(BACKUP_KEY, JSON.stringify(state));
    } catch (error) {
      logger.error("Failed to backup market context:", error);
    }
  }

  private async restoreState() {
    try {
      const backup = await this.redisClient.get(BACKUP_KEY);
      if (backup) {
        const state = JSON.parse(backup) as MarketState;
        this.activePOIs = (state.activePOIs ?? []).map(poi => ({
          ...poi,
          timestamp: new Date(poi.timestamp),
          key: poi.key ?? `${poi.type}:${poi.direction}:${poi.level}:${poi.state}`,
        }));
        this.lastUpdate = new Date(state.lastUpdate);
        this.lastMessageIds = {
          ...this.lastMessageIds,
          ...state.lastMessageIds,
        };
      }
    } catch (error) {
      logger.error("Failed to restore market context:", error);
    }
  }

  formatSetupMessage(signal: Signal, context: SignalContext): string {
    const ts = signal.timestamp ? new Date(signal.timestamp) : new Date();
    const symbol = context.symbol?.toUpperCase();
    const tf = timeframeLabel(context.timeframe);
    const direction = signal.direction;
    const dirCap = capitalize(direction);
    const level = levelLabel(signal.level);
    const poi = poiLabel(signal, context);
    const lines: string[] = [];

    lines.push(`${symbol ? `${symbol} ` : ''}SETUP ALERT`);
    const isPOICreation =
      (signal.type === SignalType.ORDER_BLOCK || signal.type === SignalType.IMBALANCE) &&
      (signal.state === SignalState.NEW || signal.state === SignalState.CREATED);
    const subtitle = isPOICreation || signal.type === SignalType.ORDER_BLOCK || signal.type === SignalType.IMBALANCE
      ? `${level} ${[dirCap, poi].filter(Boolean).join(' ')}`
      : `${level} ${[dirCap, typeLabel(signal.type)].filter(Boolean).join(' ')}${context.isChochInPOI ? ' in POI' : ''}`;
    lines.push(subtitle);
    lines.push(`${timeUTC(ts)} UTC${tf ? ` | ${tf}` : ''}`);
    lines.push('');
    lines.push('SEQUENCE:');

    if (signal.type === SignalType.ORDER_BLOCK || signal.type === SignalType.IMBALANCE) {
      lines.push(`• new ${[dirCap, poi.toLowerCase()].filter(Boolean).join(' ')}`);
      if (context.range) lines.push(`   Range: ${context.range}`);
      if (isPOICreation && context.price && !context.range) lines.push(`   Price: ${context.price}`);

      const entryPrice = context.entryPrice || context.price;
      if (entryPrice && !isPOICreation) {
        const stateLabel = (signal.state ?? SignalState.WITHIN).toString().toLowerCase();
        lines.push(`• ${poi.toLowerCase()} ${stateLabel}${priceSuffix(entryPrice)}`);
      }
    } else {
      const structureLabel = typeLabel(signal.type).toLowerCase();
      const structurePrice =
        signal.type === SignalType.BOS ? context.bosPrice : context.chochPrice;
      lines.push(
        `• ${signal.level === SignalLevel.INTERNAL ? 'internal ' : ''}` +
        `${[dirCap, structureLabel, 'formed'].filter(Boolean).join(' ')}` +
        `${priceSuffix(structurePrice || context.price)}`
      );
    }

    if (context.invalidationLevel) {
      lines.push('');
      lines.push('INVALIDATION:');
      lines.push(`Break below ${poi} (${context.invalidationLevel})`);
    }

    if (symbol) {
      lines.push('');
      const tag = signal.type === SignalType.ORDER_BLOCK
        ? 'order_block'
        : signal.type === SignalType.IMBALANCE
          ? 'imbalance'
          : signal.type === SignalType.BOS
            ? 'bos'
            : signal.type === SignalType.CHOCH || signal.type === SignalType.CHOCH_PLUS
              ? 'choch'
              : 'setup';
      lines.push(`#${symbol.toLowerCase()} #setup #${tag}`);
    }

    return lines.join('\n');
  }

  formatInvalidationMessage(signal: Signal, context: SignalContext, invalidatedPOI?: POI): string {
    const ts = signal.timestamp ? new Date(signal.timestamp) : new Date();
    const symbol = (context.symbol || invalidatedPOI?.symbol)?.toUpperCase();
    const tf = timeframeLabel(context.timeframe || invalidatedPOI?.timeframe);
    const level = levelLabel(invalidatedPOI?.level ?? signal.level);
    const direction = capitalize(signal.direction);
    const price = context.price || context.bosPrice;

    let reason: string;
    if (signal.type === SignalType.BOS) {
      reason = `${direction ? `${direction.toLowerCase()} ` : ''}bos formed${priceSuffix(price)}`;
      const [rangeLow, rangeHigh] = (invalidatedPOI?.range ?? '')
        .split('-')
        .map(value => value.trim())
        .filter(Boolean);
      const invalidationLevel = context.invalidationLevel
        || invalidatedPOI?.invalidationLevel
        || (invalidatedPOI?.direction === 'bearish' ? rangeHigh : rangeLow);
      if (invalidationLevel) {
        const label = invalidatedPOI?.direction === 'bearish' ? 'above OB high' : 'below OB low';
        reason += `\n(${label} ${invalidationLevel})`;
      }
    } else if (signal.state === SignalState.EXIT) {
      reason = `${direction ? `${direction.toLowerCase()} ` : ''}exit${priceSuffix(price)}`;
    } else {
      reason = `structure invalidated${priceSuffix(price)}`;
    }

    const lines = [
      `❌ ${symbol ? `${symbol} ` : ''}SETUP INVALIDATED`,
      `⚠️ ${level} Reversal${tf ? ` (${tf})` : ''}`,
      `⏰ ${timeUTC(ts)} UTC`,
      '',
      'REASON:',
      reason,
    ];

    if (symbol) {
      lines.push('');
      lines.push(`#${symbol.toLowerCase()} #invalidation`);
    }

    return lines.join('\n');
  }

  private findInvalidatedPOI(signal: Signal, context: SignalContext): POI | undefined {
    return this.activePOIs.find(poi => {
      if (poi.type !== SignalType.ORDER_BLOCK && poi.type !== SignalType.IMBALANCE) {
        return false;
      }

      if (poi.state === SignalState.BREAKER) {
        return signal.type === SignalType.BOS && signal.direction !== poi.direction;
      }

      if (poi.type === SignalType.ORDER_BLOCK) {
        if (signal.type === SignalType.BOS && signal.direction !== poi.direction) {
          const bosPrice = context.bosPrice || context.price;
          const [rangeLow, rangeHigh] = (poi.range ?? '')
            .split('-')
            .map(value => Number(value.replace(/,/g, '')));
          const invalidationLevel = context.invalidationLevel
            ? Number(context.invalidationLevel.replace(/,/g, ''))
            : poi.invalidationLevel
              ? Number(poi.invalidationLevel.replace(/,/g, ''))
              : poi.direction === 'bullish'
                ? rangeLow
                : rangeHigh;
          const price = bosPrice ? Number(bosPrice.replace(/,/g, '')) : undefined;

          // Without a price we still treat an opposing BOS as structural invalidation.
          if (!Number.isFinite(price) || !Number.isFinite(invalidationLevel)) return true;
          return poi.direction === 'bullish' ? price! < invalidationLevel : price! > invalidationLevel;
        }
        if (signal.state === SignalState.EXIT && signal.direction === poi.direction) {
          return true;
        }
      }

      if (poi.type === SignalType.IMBALANCE) {
        return signal.state === SignalState.EXIT;
      }

      return false;
    });
  }

  shouldAnnounceSetup(signal: Signal, context: SignalContext): boolean {
    if (signal.type === SignalType.ORDER_BLOCK || signal.type === SignalType.IMBALANCE) {
      return signal.state === SignalState.NEW
        || signal.state === SignalState.CREATED
        || signal.state === SignalState.BREAKER;
    }

    if (signal.type === SignalType.CHOCH || signal.type === SignalType.CHOCH_PLUS) {
      return context.isChochInPOI;
    }

    if (signal.type === SignalType.BOS) {
      return signal.level === SignalLevel.SWING || context.isSwingPOI || context.isChochInPOI;
    }

    if (signal.type === SignalType.LIQUIDITY_GRAB) {
      return true;
    }

    return false;
  }

  updateContext(input: SignalInput, partialContext: Partial<SignalContext> = {}) {
    const signal = normalizeInput(input);
    const context: SignalContext = {
      isChochInPOI: false,
      isSwingPOI: false,
      hasImbalanceTarget: false,
      ...partialContext,
    };
    try {
      const signalTimestamp = signal.timestamp ? new Date(signal.timestamp) : new Date();

      if (signalTimestamp.getTime() > Date.now() + 5 * 60 * 1000) {
        throw new Error('Invalid signal timestamp: future date');
      }

      const invalidatedPOI = this.findInvalidatedPOI(signal, context);
      const invalidated = invalidatedPOI !== undefined;

      const result = {
        shouldPin: false,
        shouldLog: invalidated ? true : this.shouldAnnounceSetup(signal, context),
        shouldDeletePrevious: false,
        previousMessageId: undefined as number | undefined,
        message: invalidated
          ? this.formatInvalidationMessage(signal, context, invalidatedPOI)
          : this.formatSetupMessage(signal, context),
        importance: invalidated ? 2 : 0,
      };

      this.trackPOI(signal, context, signalTimestamp);

      if (signal.type === SignalType.ORDER_BLOCK || signal.type === SignalType.IMBALANCE) {
        if (signal.state === SignalState.NEW || signal.state === SignalState.CREATED) {
          result.shouldPin = true;
          result.importance = signal.level === SignalLevel.SWING ? 3 : 2;
        } else {
          result.shouldPin = false;
          // Do not downgrade an invalidation (importance 2) to a status update.
          result.importance = Math.max(result.importance, 1);
        }
      } else if ((signal.type === SignalType.CHOCH || signal.type === SignalType.CHOCH_PLUS) && context.isChochInPOI) {
        result.shouldPin = true;
        result.importance = 2;
      } else if (signal.type === SignalType.BOS) {
        result.shouldPin = true;
        result.importance = 2;
      } else if (signal.type === SignalType.LIQUIDITY_GRAB) {
        result.shouldPin = true;
        result.importance = 2;
      }

      this.lastUpdate = signalTimestamp;

      this.backupState().catch((error) => {
        logger.error("Failed to backup market context after update:", error);
      });

      return result;
    } catch (error) {
      logger.error("Error in market context update:", error);
      throw error;
    }
  }

  private trackPOI(signal: Signal, context: SignalContext, timestamp: Date): void {
    if (![SignalType.ORDER_BLOCK, SignalType.IMBALANCE, SignalType.BOS, SignalType.CHOCH, SignalType.CHOCH_PLUS]
      .includes(signal.type)) {
      return;
    }

    const key = [
      signal.type,
      signal.direction ?? '',
      signal.level,
      signal.state ?? '',
      context.symbol ?? '',
      signal.normalized ?? '',
    ].join(':');

    const existing = this.activePOIs.find(poi =>
      poi.key === key && Math.abs(timestamp.getTime() - poi.timestamp.getTime()) < 15 * 60 * 1000
    );

    const payload: POI = {
      type: signal.type,
      direction: signal.direction,
      state: signal.state,
      timestamp,
      level: signal.level,
      symbol: context.symbol?.toUpperCase(),
      timeframe: context.timeframe?.toLowerCase(),
      price: context.price || context.entryPrice || context.bosPrice || context.chochPrice,
      range: context.range,
      invalidationLevel: context.invalidationLevel,
      key,
    };

    if (existing) {
      Object.assign(existing, payload);
    } else {
      this.activePOIs.push(payload);
      if (this.activePOIs.length > MAX_ACTIVE_POIS) {
        this.activePOIs = this.activePOIs.slice(-MAX_ACTIVE_POIS);
      }
    }
  }

  getSetupMessage(): string {
    const setupSequence = this.activePOIs
      .slice()
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (setupSequence.length === 0) {
      return '';
    }

    const initialPOI = setupSequence.find(poi =>
      poi.type === SignalType.ORDER_BLOCK || poi.type === SignalType.IMBALANCE
    );

    if (!initialPOI) {
      return '';
    }

    const symbol = initialPOI.symbol;
    const tf = timeframeLabel(initialPOI.timeframe);
    const poiType = initialPOI.type === SignalType.ORDER_BLOCK ? 'OB' : 'Imbalance';
    const timeStr = timeUTC(initialPOI.timestamp);

    const lines: string[] = [];
    lines.push(`🎯 ${symbol ? `${symbol} ` : ''}SETUP ALERT`);
    lines.push(`📈 Internal Reversal in ${capitalize(initialPOI.direction)} ${poiType}`);
    lines.push(`⏰ ${timeStr} UTC${tf ? ` | ${tf}` : ''}`);
    lines.push('');
    lines.push('SEQUENCE:');

    setupSequence.forEach((poi, index) => {
      const dir = poi.direction ?? '';
      const internal = poi.level === SignalLevel.INTERNAL ? 'internal ' : '';
      let text: string;

      switch (poi.type) {
        case SignalType.ORDER_BLOCK:
          if (poi.state === SignalState.NEW || poi.state === SignalState.CREATED) {
            text = `new ${dir} order block`;
          } else if (poi.state === SignalState.ENTERED) {
            text = `${dir} ob entered${priceSuffix(poi.price)}`;
          } else if (poi.state === SignalState.MITIGATED) {
            text = `${dir} ob mitigated`;
          } else if (poi.state === SignalState.BROKE) {
            text = `${dir} ob breakout${priceSuffix(poi.price)}`;
          } else {
            text = `${dir} order block`;
          }
          break;
        case SignalType.IMBALANCE:
          if (poi.state === SignalState.NEW || poi.state === SignalState.CREATED) {
            text = `new ${dir} imbalance`;
          } else if (poi.state === SignalState.ENTERED) {
            text = `${dir} imbalance entered${priceSuffix(poi.price)}`;
          } else {
            text = `${dir} imbalance`;
          }
          break;
        case SignalType.BOS:
          text = `${internal}${dir} bos formed${priceSuffix(poi.price)}`;
          break;
        case SignalType.CHOCH:
        case SignalType.CHOCH_PLUS:
          text = `${internal}${dir} choch formed${priceSuffix(poi.price)}`;
          break;
        default:
          text = `${dir} ${poi.type.toLowerCase()}`;
      }

      lines.push(`${index + 1}. ✅ ${text}`);
      if (poi.range) {
        lines.push(`   Range: ${poi.range}`);
      }
    });

    const invalidationLevel = initialPOI.invalidationLevel;
    if (invalidationLevel) {
      lines.push('');
      lines.push('INVALIDATION:');
      lines.push(`Break below ${poiType} (${invalidationLevel})`);
    }

    if (symbol) {
      lines.push('');
      lines.push(`#${symbol.toLowerCase()} #setup #internal_reversal`);
    }

    return lines.join('\n');
  }

  getPinnedMessage(): string {
    const now = new Date();
    const timeStr = timeUTC(now);
    const symbol = this.activePOIs.find(poi => poi.symbol)?.symbol;
    const lines: string[] = [];

    lines.push(`📊 ${symbol ? `${symbol} ` : ''}Market Structure`);
    lines.push(`⏰ ${timeStr} UTC`);
    lines.push('');

    const timeframes = Array.from(new Set(
      this.activePOIs.map(poi => poi.timeframe).filter((tf): tf is string => Boolean(tf))
    ));

    if (timeframes.length === 0) {
      timeframes.push('market');
    }

    for (const timeframe of timeframes) {
      if (lines.length > MAX_PINNED_LINES) break;

      const pois = this.activePOIs.filter(poi => (poi.timeframe ?? 'market') === timeframe);

      lines.push(`${timeframe.toUpperCase()} TIMEFRAME`);
      lines.push('----------------');
      lines.push('');

      const orderBlocks = pois.filter(poi => poi.type === SignalType.ORDER_BLOCK);
      if (orderBlocks.length > 0) {
        lines.push('ORDER BLOCKS:');
        for (const ob of orderBlocks.slice(-5)) {
          const range = ob.range || ob.price;
          lines.push(`• ${ob.direction ?? ''} OB${range ? ` @${range}` : ''}`);
          lines.push(`  Status: ${(ob.state ?? 'active').toString().toLowerCase()} ${ob.direction ?? ''} ob`);
        }
        lines.push('');
      }

      const structureSignals = pois.filter(poi =>
        poi.type === SignalType.BOS || poi.type === SignalType.CHOCH || poi.type === SignalType.CHOCH_PLUS
      );
      if (structureSignals.length > 0) {
        lines.push('STRUCTURE:');
        for (const sig of structureSignals.slice(-5)) {
          const type = sig.type === SignalType.BOS ? 'BOS' : 'CHoCH';
          const level = sig.level === SignalLevel.INTERNAL ? 'Internal ' : 'Last Swing ';
          lines.push(`• ${level}${sig.direction ?? ''} ${type}${priceSuffix(sig.price)}`);
        }
        lines.push('');
      }

      const imbalances = pois.filter(poi => poi.type === SignalType.IMBALANCE);
      if (imbalances.length > 0) {
        lines.push('IMBALANCES:');
        for (const imb of imbalances.slice(-5)) {
          const range = imb.range || imb.price;
          lines.push(`• ${imb.direction ?? ''}${range ? ` @${range}` : ''}`);
          lines.push(`  Status: ${(imb.state ?? 'active').toString().toLowerCase()} ${imb.direction ?? ''} imbalance`);
        }
        lines.push('');
      }
    }

    if (symbol) {
      lines.push(`#${symbol.toLowerCase()} #status`);
    }

    return lines.join('\n').trim();
  }

  cleanup() {
    const now = new Date();
    this.activePOIs = this.activePOIs
      .filter((poi) => now.getTime() - poi.timestamp.getTime() < 24 * 60 * 60 * 1000)
      .slice(-MAX_ACTIVE_POIS);
  }
}
