import { expect, test, describe } from "bun:test";
import { MarketContext } from "./market-context";
import { MockRedisClient } from "./services/__mocks__/redis-client";
import { Signal, SignalType, SignalLevel, SignalState } from './signals';

describe('MarketContext', () => {
  describe('Timestamp Handling', () => {
    test('should handle signals with undefined timestamp', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);
      const signal = {
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'NEW'
      };

      const result = context.updateContext(signal, {});
      expect(result.shouldPin).toBe(true);
      expect(result.shouldLog).toBe(true);
    });

    test('should reject signals with future timestamp', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);
      const signal = {
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'NEW',
        timestamp: new Date(Date.now() + 1000 * 60 * 60) // 1 hour in future
      };

      expect(() => context.updateContext(signal, {})).toThrow('Invalid signal timestamp: future date');
    });
  });

  describe('Order Block State Transitions', () => {
    test('should handle full Order Block lifecycle: NEW -> WITHIN -> MITIGATED', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);

      // NEW state
      const result1 = context.updateContext({
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'NEW'
      }, {});
      expect(result1.shouldPin).toBe(true);

      // WITHIN state
      const result2 = context.updateContext({
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'WITHIN'
      }, {});
      expect(result2.shouldPin).toBe(false);

      // MITIGATED state
      const result3 = context.updateContext({
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'MITIGATED'
      }, {});
      expect(result3.shouldPin).toBe(false);
    });

    test('should handle Order Block to Breaker transition', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);

      const result = context.updateContext({
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'BREAKER'
      }, {});

      expect(result.shouldPin).toBe(false);
    });
  });

  describe('Imbalance State Transitions', () => {
    test('should handle full Imbalance lifecycle: NEW -> WITHIN -> MITIGATED', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);

      // NEW state
      const result1 = context.updateContext({
        type: 'IMBALANCE',
        direction: 'bullish',
        state: 'NEW'
      }, {});
      expect(result1.shouldPin).toBe(true);

      // WITHIN state
      const result2 = context.updateContext({
        type: 'IMBALANCE',
        direction: 'bullish',
        state: 'WITHIN'
      }, {});
      expect(result2.shouldPin).toBe(false);

      // MITIGATED state
      const result3 = context.updateContext({
        type: 'IMBALANCE',
        direction: 'bullish',
        state: 'MITIGATED'
      }, {});
      expect(result3.shouldPin).toBe(false);
    });
  });

  describe('Liquidity Grab Handling', () => {
    test('should handle Bullish Grab signal', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);

      const result = context.updateContext({
        type: 'LIQUIDITY_GRAB',
        direction: 'bullish',
        state: 'GRAB'
      }, {});

      expect(result.shouldPin).toBe(true);
    });

    test('should handle Internal Bullish Grab signal', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);

      const result = context.updateContext({
        type: 'LIQUIDITY_GRAB',
        direction: 'bullish',
        state: 'GRAB',
        level: 'INTERNAL'
      }, {});

      expect(result.shouldPin).toBe(true);
    });
  });

  describe('POI Invalidation Scenarios', () => {
    describe('Order Block Invalidation', () => {
      test('should invalidate Order Block when opposing BOS forms below invalidation level', () => {
        const mockRedis = new MockRedisClient();
        const context = new MarketContext(mockRedis);
        const timestamp = new Date('2024-01-01T13:15:00Z');

        // Create bullish Order Block
        let result = context.updateContext({
          type: SignalType.ORDER_BLOCK,
          direction: 'bullish',
          state: SignalState.NEW,
          level: SignalLevel.INTERNAL,
          timestamp,
          raw: 'bullish ob formed'
        }, {
          symbol: 'BTCUSDT',
          level: 'Internal',
          timeframe: '1H',
          invalidationLevel: '39,400'
        });

        expect(result.shouldLog).toBe(true);

        // Add bearish BOS below invalidation level
        result = context.updateContext({
          type: SignalType.BOS,
          direction: 'bearish',
          state: SignalState.NEW,
          level: SignalLevel.INTERNAL,
          timestamp,
          raw: 'bearish bos formed'
        }, {
          symbol: 'BTCUSDT',
          level: 'Internal',
          timeframe: '1H',
          price: '39,350',
          bosPrice: '39,350',
          invalidationLevel: '39,400'
        });

        expect(result.shouldLog).toBe(true);
        expect(result.importance).toBe(2);
        expect(result.message).toContain('❌ BTCUSDT SETUP INVALIDATED');
        expect(result.message).toContain('⚠️ Internal Reversal (1H)');
        expect(result.message).toContain('⏰ 13:15 UTC');
        expect(result.message).toContain('REASON:');
        expect(result.message).toContain('bearish bos formed @39,350');
        expect(result.message).toContain('(below OB low 39,400)');
        expect(result.message).toContain('#btcusdt #invalidation');
        expect(result.message).toContain('#btcusdt #invalidation');
      });

      test('should invalidate Order Block when price exits in formation direction', () => {
        const mockRedis = new MockRedisClient();
        const context = new MarketContext(mockRedis);
        const timestamp = new Date('2024-01-01T13:15:00Z');

        // Create bullish Order Block
        let result = context.updateContext({
          type: SignalType.ORDER_BLOCK,
          direction: 'bullish',
          state: SignalState.NEW,
          level: SignalLevel.INTERNAL,
          timestamp,
          raw: 'bullish ob formed'
        }, {
          symbol: 'BTCUSDT',
          level: 'Internal',
          timeframe: '1H',
          invalidationLevel: '39,400'
        });

        expect(result.shouldLog).toBe(true);

        // Price exits in bullish direction
        result = context.updateContext({
          type: SignalType.ORDER_BLOCK,
          direction: 'bullish',
          state: SignalState.EXIT,
          level: SignalLevel.INTERNAL,
          timestamp,
          raw: 'bullish ob exit'
        }, {
          symbol: 'BTCUSDT',
          level: 'Internal',
          price: '39,600'
        });

        expect(result.shouldLog).toBe(true);
        expect(result.importance).toBe(2);
        expect(result.message).toContain('❌ BTCUSDT SETUP INVALIDATED');
        expect(result.message).toContain('bullish exit @39,600');
      });
    });

    describe('Imbalance Invalidation', () => {
      test('should invalidate Imbalance when price exits the zone', () => {
        const mockRedis = new MockRedisClient();
        const context = new MarketContext(mockRedis);
        const timestamp = new Date('2024-01-01T13:15:00Z');

        // Create bullish Imbalance
        let result = context.updateContext({
          type: SignalType.IMBALANCE,
          direction: 'bullish',
          state: SignalState.NEW,
          level: SignalLevel.INTERNAL,
          timestamp,
          raw: 'bullish imbalance formed'
        }, {
          symbol: 'BTCUSDT',
          level: 'Internal'
        });

        expect(result.shouldLog).toBe(true);

        // Price exits the imbalance zone
        result = context.updateContext({
          type: SignalType.IMBALANCE,
          direction: 'bullish',
          state: SignalState.EXIT,
          level: SignalLevel.INTERNAL,
          timestamp,
          raw: 'bullish imbalance exit'
        }, {
          symbol: 'BTCUSDT',
          level: 'Internal',
          price: '39,600'
        });

        expect(result.shouldLog).toBe(true);
        expect(result.importance).toBe(2);
        expect(result.message).toContain('❌ BTCUSDT SETUP INVALIDATED');
        expect(result.message).toContain('bullish exit @39,600');
      });
    });

    describe('Breaker Invalidation', () => {
      test('should invalidate Breaker when opposing BOS forms', () => {
        const mockRedis = new MockRedisClient();
        const context = new MarketContext(mockRedis);
        const timestamp = new Date('2024-01-01T13:15:00Z');

        // Create bullish Breaker
        let result = context.updateContext({
          type: SignalType.ORDER_BLOCK,
          direction: 'bullish',
          state: SignalState.BREAKER,
          level: SignalLevel.INTERNAL,
          timestamp,
          raw: 'bullish breaker formed'
        }, {
          symbol: 'BTCUSDT',
          level: 'Internal'
        });

        expect(result.shouldLog).toBe(true);

        // Opposing BOS forms
        result = context.updateContext({
          type: SignalType.BOS,
          direction: 'bearish',
          state: SignalState.NEW,
          level: SignalLevel.INTERNAL,
          timestamp,
          raw: 'bearish bos formed'
        }, {
          symbol: 'BTCUSDT',
          level: 'Internal',
          price: '39,350'
        });

        expect(result.shouldLog).toBe(true);
        expect(result.importance).toBe(2);
        expect(result.message).toContain('❌ BTCUSDT SETUP INVALIDATED');
        expect(result.message).toContain('bearish bos formed @39,350');
      });
    });

    test('should invalidate Order Block with opposing BOS', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);

      // Create bullish Order Block
      context.updateContext({
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'NEW'
      }, {});

      // Add bearish BOS
      const result = context.updateContext({
        type: 'BOS',
        direction: 'bearish'
      }, {});

      expect(result.shouldPin).toBe(true);
    });

    test('should detect and format invalidation message when BOS forms below OB', () => {
      const context = new MarketContext(new MockRedisClient());
      const timestamp = new Date('2024-01-01T13:15:00Z');
      
      // First, create an order block
      const obSignal: Signal = {
        type: SignalType.ORDER_BLOCK,
        direction: 'bullish',
        state: SignalState.NEW,
        level: SignalLevel.INTERNAL,
        normalized: 'bullish ob formed',
        timestamp,
        raw: 'bullish ob formed',
      };

      const obContext = {
        symbol: 'BTCUSDT',
        level: 'Internal',
        timeframe: '1H',
        price: '39,500',
        invalidationLevel: '39,400',
      };

      let result = context.updateContext(obSignal, obContext);
      expect(result.shouldLog).toBe(true);

      // Then, create an invalidating BOS
      const bosSignal: Signal = {
        type: SignalType.BOS,
        direction: 'bearish',
        state: SignalState.NEW,
        level: SignalLevel.SWING,
        normalized: 'bearish bos formed',
        timestamp,
        raw: 'bearish bos formed',
      };

      const bosContext = {
        symbol: 'BTCUSDT',
        level: 'Internal',
        timeframe: '1H',
        price: '39,350',
        invalidationLevel: '39,400',
        bosPrice: '39,350',
      };

      result = context.updateContext(bosSignal, bosContext);
      expect(result.shouldLog).toBe(true);
      expect(result.importance).toBe(2);
      expect(result.message).toContain('❌ BTCUSDT SETUP INVALIDATED');
      expect(result.message).toContain('⚠️ Internal Reversal (1H)');
      expect(result.message).toContain('⏰ 13:15 UTC');
      expect(result.message).toContain('REASON:');
      expect(result.message).toContain('bearish bos formed @39,350');
      expect(result.message).toContain('(below OB low 39,400)');
      expect(result.message).toContain('#btcusdt #invalidation');
    });
  });

  describe('Multiple POI Interactions', () => {
    test('should handle multiple POIs of different types', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);

      // Add Order Block
      context.updateContext({
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'NEW'
      }, {});

      // Add Imbalance
      context.updateContext({
        type: 'IMBALANCE',
        direction: 'bearish',
        state: 'NEW'
      }, {});

      // Add Liquidity Grab
      const result = context.updateContext({
        type: 'LIQUIDITY_GRAB',
        direction: 'bullish'
      }, {});

      expect(result.shouldPin).toBe(true);
    });
  });

  describe('Pinned Message Format', () => {
    test('should format pinned message according to specification', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);

      // Add Order Block
      context.updateContext({
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'NEW',
        level: 'SWING',
        timestamp: new Date()
      }, {
        symbol: 'BTCUSDT',
        timeframe: '1H',
        range: '39,400-39,500'
      });

      // Add BOS
      context.updateContext({
        type: 'BOS',
        direction: 'bearish',
        state: 'NEW',
        level: 'SWING',
        timestamp: new Date()
      }, {
        symbol: 'BTCUSDT',
        timeframe: '1H',
        bosPrice: '39,800'
      });

      // Add Imbalance
      context.updateContext({
        type: 'IMBALANCE',
        direction: 'bearish',
        state: 'NEW',
        level: 'INTERNAL',
        timestamp: new Date()
      }, {
        symbol: 'BTCUSDT',
        timeframe: '15M',
        range: '39,800-39,850'
      });

      const pinnedMessage = context.getPinnedMessage();

      // Check header format
      expect(pinnedMessage).toContain('BTCUSDT Market Structure');
      expect(pinnedMessage).toMatch(/\d{2}:\d{2} UTC/);

      // Check 1H timeframe section
      expect(pinnedMessage).toContain('1H TIMEFRAME');
      expect(pinnedMessage).toContain('ORDER BLOCKS:');
      expect(pinnedMessage).toContain('bullish OB @39,400-39,500');
      expect(pinnedMessage).toContain('Status: new bullish ob');

      // Check 15M timeframe section
      expect(pinnedMessage).toContain('15M TIMEFRAME');
      expect(pinnedMessage).toContain('IMBALANCES:');
      expect(pinnedMessage).toContain('bearish @39,800-39,850');
      expect(pinnedMessage).toContain('Status: new bearish imbalance');

      // Check hashtags
      expect(pinnedMessage).toContain('#btcusdt #status');
    });
  });

  describe('Setup Notification Format', () => {
    test('should format setup notification according to specification', () => {
      const mockRedis = new MockRedisClient();
      const context = new MarketContext(mockRedis);
      const now = new Date();
      const baseTime = new Date(now.getTime() - 300000); // 5 minutes ago

      // Add Order Block
      context.updateContext({
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'NEW',
        level: 'INTERNAL',
        timestamp: baseTime
      }, {
        symbol: 'BTCUSDT',
        level: 'Internal',
        timeframe: '1H',
        range: '39,400-39,500',
        invalidationLevel: '39,400'
      });

      // Enter Order Block
      context.updateContext({
        type: 'ORDER_BLOCK',
        direction: 'bullish',
        state: 'ENTERED',
        level: 'INTERNAL',
        timestamp: new Date(baseTime.getTime() + 60000) // 1 minute after
      }, {
        price: '39,450'
      });

      // BOS Formation
      context.updateContext({
        type: 'BOS',
        direction: 'bearish',
        state: 'NEW',
        level: 'INTERNAL',
        timestamp: new Date(baseTime.getTime() + 120000) // 2 minutes after
      }, {
        bosPrice: '39,600'
      });

      // CHoCH Formation
      context.updateContext({
        type: 'CHOCH',
        direction: 'bullish',
        state: 'NEW',
        level: 'INTERNAL',
        timestamp: new Date(baseTime.getTime() + 180000) // 3 minutes after
      }, {
        chochPrice: '39,450'
      });

      const setupMessage = context.getSetupMessage();

      // Check header
      expect(setupMessage).toContain('🎯 BTCUSDT SETUP ALERT');
      expect(setupMessage).toContain('📈 Internal Reversal in Bullish OB');
      expect(setupMessage).toMatch(/⏰ \d{2}:\d{2} UTC \| 1H/);

      // Check sequence
      expect(setupMessage).toContain('SEQUENCE:');
      expect(setupMessage).toContain('1. ✅ new bullish order block');
      expect(setupMessage).toContain('Range: 39,400-39,500');
      expect(setupMessage).toContain('2. ✅ bullish ob entered @39,450');
      expect(setupMessage).toContain('3. ✅ internal bearish bos formed @39,600');
      expect(setupMessage).toContain('4. ✅ internal bullish choch formed @39,450');

      // Check invalidation
      expect(setupMessage).toContain('INVALIDATION:');
      expect(setupMessage).toContain('Break below OB (39,400)');

      // Check hashtags
      expect(setupMessage).toContain('#btcusdt #setup #internal_reversal');
    });
  });

});
