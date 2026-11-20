import { expect, test, describe } from "bun:test";
import type { Signal } from './signals';
import { 
  SignalType,
  SignalState,
  SignalLevel,
  normalizeSignal,
  detectSignalType,
  detectSignalState,
  detectSignalLevel,
  detectDirection,
  analyzeSignalContext,
  createSignal,
  isDuplicateSignal
} from './signals';

describe('Signal Normalization', () => {
  test('should remove square brackets and their content', () => {
    expect(normalizeSignal('Exit Bearish Block [68,228.968,000]')).toBe('exit bearish block');
    expect(normalizeSignal('Bullish Block Entered [123.45]')).toBe('bullish block entered');
    expect(normalizeSignal('Some Signal [with numbers] here')).toBe('some signal here');
  });

  test('should handle multiple spaces', () => {
    expect(normalizeSignal('bullish    ob    entered')).toBe('bullish ob entered');
    expect(normalizeSignal('bearish   order   block')).toBe('bearish order block');
  });
});

describe('Order Block Signal Detection', () => {
  test('should detect both "order block" and "ob" variations', () => {
    expect(detectSignalType('bearish order block entered')).toBe(SignalType.ORDER_BLOCK);
    expect(detectSignalType('bullish ob entered')).toBe(SignalType.ORDER_BLOCK);
    expect(detectSignalType('new bearish order block')).toBe(SignalType.ORDER_BLOCK);
    expect(detectSignalType('new bullish ob')).toBe(SignalType.ORDER_BLOCK);
    expect(detectSignalType('within bearish ob')).toBe(SignalType.ORDER_BLOCK);
    expect(detectSignalType('within bullish order block')).toBe(SignalType.ORDER_BLOCK);
  });

  test('should detect signal states including mitigation and breaker', () => {
    expect(detectSignalState('bearish ob entered')).toBe(SignalState.ENTERED);
    expect(detectSignalState('bullish order block mitigated')).toBe(SignalState.MITIGATED);
    expect(detectSignalState('bearish breaker formed')).toBe(SignalState.BREAKER);
    expect(detectSignalState('exit bullish ob')).toBe(SignalState.EXIT);
    expect(detectSignalState('within bearish order block')).toBe(SignalState.WITHIN);
    expect(detectSignalState('new bullish ob')).toBe(SignalState.NEW);
  });

  test('should detect direction for block signals', () => {
    expect(detectDirection('bearish ob entered')).toBe('bearish');
    expect(detectDirection('bullish order block entered')).toBe('bullish');
    expect(detectDirection('exit bearish ob')).toBe('bearish');
    expect(detectDirection('exit bullish order block')).toBe('bullish');
  });

  test('should create proper signals for blocks', () => {
    const signal1 = createSignal('Bearish OB Entered [68,228.968,000]');
    expect(signal1.type).toBe(SignalType.ORDER_BLOCK);
    expect(signal1.state).toBe(SignalState.ENTERED);
    expect(signal1.direction).toBe('bearish');
    expect(signal1.normalized).toBe('bearish ob entered');

    const signal2 = createSignal('Bullish Order Block Mitigated [68,228.968,000]');
    expect(signal2.type).toBe(SignalType.ORDER_BLOCK);
    expect(signal2.state).toBe(SignalState.MITIGATED);
    expect(signal2.direction).toBe('bullish');
    expect(signal2.normalized).toBe('bullish order block mitigated');

    const signal3 = createSignal('Bearish Breaker Formed');
    expect(signal3.type).toBe(SignalType.ORDER_BLOCK);
    expect(signal3.state).toBe(SignalState.BREAKER);
    expect(signal3.direction).toBe('bearish');
    expect(signal3.normalized).toBe('bearish breaker formed');
  });
});

describe('CHoCH Signal Detection', () => {
  test('should detect both CHoCH and CHoCH+ variations', () => {
    expect(detectSignalType('internal bullish choch formed')).toBe(SignalType.CHOCH);
    expect(detectSignalType('internal bearish choch+ formed')).toBe(SignalType.CHOCH_PLUS);
    expect(detectSignalType('bullish choch plus formed')).toBe(SignalType.CHOCH_PLUS);
    expect(detectSignalType('bearish choch formed')).toBe(SignalType.CHOCH);
  });
});

describe('Imbalance Signal Detection', () => {
  test('should detect imbalance signals with various states', () => {
    expect(detectSignalType('bullish imbalance')).toBe(SignalType.IMBALANCE);
    expect(detectSignalType('bearish imbalance entered')).toBe(SignalType.IMBALANCE);
    expect(detectSignalType('within bullish imbalance')).toBe(SignalType.IMBALANCE);
    
    const signal = createSignal('Bullish Imbalance Mitigated');
    expect(signal.type).toBe(SignalType.IMBALANCE);
    expect(signal.state).toBe(SignalState.MITIGATED);
  });

  test('should properly handle Bullish Imbalance Mitigated signal', () => {
    expect(() => {
      createSignal('Bullish Imbalance Mitigated');
    }).not.toThrow();

    const signal = createSignal('Bullish Imbalance Mitigated');
    expect(signal.type).toBe(SignalType.IMBALANCE);
    expect(signal.state).toBe(SignalState.MITIGATED);
    expect(signal.direction).toBe('bullish');
    expect(signal.normalized).toBe('bullish imbalance mitigated');
  });
});

describe('Break of Structure Detection', () => {
  test('should detect both BOS and "break of structure" variations', () => {
    expect(detectSignalType('internal bullish bos formed')).toBe(SignalType.BOS);
    expect(detectSignalType('bearish break of structure')).toBe(SignalType.BOS);
  });

  test('should detect internal BOS formation', () => {
    const signal = createSignal('internal bullish bos formed');
    expect(signal.type).toBe(SignalType.BOS);
    expect(signal.state).toBe(SignalState.FORMED);
    expect(signal.level).toBe(SignalLevel.INTERNAL);
    expect(signal.direction).toBe('bullish');
  });
});

describe('Liquidity Grab Detection', () => {
  test('should detect liquidity grab signals', () => {
    expect(detectSignalType('bullish grab')).toBe(SignalType.LIQUIDITY_GRAB);
    expect(detectSignalType('bearish grab')).toBe(SignalType.LIQUIDITY_GRAB);
  });

  test('should properly handle Bullish Grab signal', () => {
    expect(() => {
      createSignal('Bullish Grab');
    }).not.toThrow();

    const signal = createSignal('Bullish Grab');
    expect(signal.type).toBe(SignalType.LIQUIDITY_GRAB);
    expect(signal.direction).toBe('bullish');
    expect(signal.normalized).toBe('bullish grab');
    expect(signal.level).toBe(SignalLevel.SWING);
  });

  test('should handle internal liquidity grab signals', () => {
    const signal = createSignal('Internal Bullish Grab');
    expect(signal.type).toBe(SignalType.LIQUIDITY_GRAB);
    expect(signal.direction).toBe('bullish');
    expect(signal.level).toBe(SignalLevel.INTERNAL);
    expect(signal.normalized).toBe('internal bullish grab');
  });

  test('should detect duplicate Bullish Grab signals', () => {
    const firstSignal = createSignal('Bullish Grab');
    const duplicateSignal = createSignal('Bullish Grab');
    expect(isDuplicateSignal(duplicateSignal, firstSignal)).toBe(true);
  });

  test('should not detect as duplicate if signals are different', () => {
    const firstSignal = createSignal('Bullish Grab');
    const differentSignal = createSignal('Bearish Grab');
    expect(isDuplicateSignal(differentSignal, firstSignal)).toBe(false);
  });
});

describe('High-Quality Setup Detection', () => {
  test('should detect bullish setup with bearish imbalance target', () => {
    const signals: Signal[] = [
      {
        raw: 'bearish imbalance',
        normalized: 'bearish imbalance',
        type: SignalType.IMBALANCE,
        level: SignalLevel.SWING,
        direction: 'bearish',
        timestamp: new Date(Date.now() - 1000)
      },
      {
        raw: 'bullish ob formed',
        normalized: 'bullish ob formed',
        type: SignalType.ORDER_BLOCK,
        state: SignalState.NEW,
        level: SignalLevel.SWING,
        direction: 'bullish',
        timestamp: new Date(Date.now() - 2000)
      }
    ];

    const currentSignal: Signal = {
      raw: 'bullish choch formed',
      normalized: 'bullish choch formed',
      type: SignalType.CHOCH,
      state: SignalState.NEW,
      level: SignalLevel.SWING,
      direction: 'bullish'
    };

    const context = analyzeSignalContext(currentSignal, signals);
    expect(context.isChochInPOI).toBe(true);
    expect(context.isSwingPOI).toBe(true);
    expect(context.hasImbalanceTarget).toBe(true);
    expect(context.targetDirection).toBe('bearish');
  });

  test('should detect bearish setup with bullish imbalance target', () => {
    const signals: Signal[] = [
      {
        raw: 'bullish imbalance',
        normalized: 'bullish imbalance',
        type: SignalType.IMBALANCE,
        level: SignalLevel.SWING,
        direction: 'bullish',
        timestamp: new Date(Date.now() - 1000)
      },
      {
        raw: 'bearish ob formed',
        normalized: 'bearish ob formed',
        type: SignalType.ORDER_BLOCK,
        state: SignalState.NEW,
        level: SignalLevel.SWING,
        direction: 'bearish',
        timestamp: new Date(Date.now() - 2000)
      }
    ];

    const currentSignal: Signal = {
      raw: 'bearish choch formed',
      normalized: 'bearish choch formed',
      type: SignalType.CHOCH,
      state: SignalState.NEW,
      level: SignalLevel.SWING,
      direction: 'bearish'
    };

    const context = analyzeSignalContext(currentSignal, signals);
    expect(context.isChochInPOI).toBe(true);
    expect(context.isSwingPOI).toBe(true);
    expect(context.hasImbalanceTarget).toBe(true);
    expect(context.targetDirection).toBe('bullish');
  });

  test('should not detect target when imbalance direction matches CHoCH', () => {
    const signals: Signal[] = [
      {
        raw: 'bullish imbalance',
        normalized: 'bullish imbalance',
        type: SignalType.IMBALANCE,
        level: SignalLevel.SWING,
        direction: 'bullish',
        timestamp: new Date(Date.now() - 1000)
      },
      {
        raw: 'bullish ob formed',
        normalized: 'bullish ob formed',
        type: SignalType.ORDER_BLOCK,
        state: SignalState.NEW,
        level: SignalLevel.SWING,
        direction: 'bullish',
        timestamp: new Date(Date.now() - 2000)
      }
    ];

    const currentSignal: Signal = {
      raw: 'bullish choch formed',
      normalized: 'bullish choch formed',
      type: SignalType.CHOCH,
      state: SignalState.NEW,
      level: SignalLevel.SWING,
      direction: 'bullish'
    };

    const context = analyzeSignalContext(currentSignal, signals);
    expect(context.hasImbalanceTarget).toBe(false);
    expect(context.targetDirection).toBeUndefined();
  });
});
