# Signal-Based Trading Setup Detection and Messaging Rules

## 1. Signal Processing Framework

### Signal Sequence Tracking
1. Active Window Management
   - Track signals within a rolling 24-hour window
   - Maintain separate tracking for each timeframe (1H, 15M)
   - Clear signals older than 24 hours automatically

2. Signal State Management
   - Maintain active POI registry per timeframe
   - Track incomplete setup sequences
   - Record active structure states (BOS/CHoCH)

3. Signal Validation
   - Require minimum 15-minute spacing between similar signals
   - Validate signal sequence ordering
   - Check for conflicting signals

## 2. Setup Detection Algorithms

### Internal Reversal Setup

1. Sequence Requirements
```
Bullish Sequence:
- T0: new bullish order block OR bullish imbalance
- T1: bullish ob entered OR bullish imbalance entered (T1 > T0)
- T2: internal bearish bos formed (T2 > T1)
- T3: internal bullish choch formed (T3 > T2)

Bearish Sequence:
- T0: new bearish order block OR bearish imbalance
- T1: bearish ob entered OR bearish imbalance entered (T1 > T0)
- T2: internal bullish bos formed (T2 > T1)
- T3: internal bearish choch formed (T3 > T2)
```

2. Timing Rules
   - Maximum 24 hours between T0 and T1
   - Maximum 4 hours between T1 and T3
   - Minimum 15 minutes between T2 and T3

3. Validation Requirements
   - No opposing swing structure between T0 and T3
   - No exit signals from POI between T1 and T3
   - No conflicting setups in higher timeframe

### Setup Invalidation Detection

1. Primary Invalidation Triggers
   - Exit from POI zone signal
   - Opposing swing structure formation
   - Break of internal CHoCH structure

2. Sequence Termination
   - Clear incomplete sequence on invalidation
   - Remove from active setup tracking
   - Generate invalidation message

## 3. Message Management System

### Message Priority Hierarchy
1. Critical Messages (Immediate)
   - Setup completion
   - Setup invalidation
   - Swing structure breaks

2. Status Updates (5-minute minimum interval)
   - POI status changes
   - Internal structure updates
   - Active zone changes

3. Regular Updates (15-minute minimum interval)
   - Pinned message updates
   - Minor structure changes

### Rate Limiting Rules
1. Maximum Message Frequency
   - 1 setup alert per 15 minutes per symbol
   - 1 pinned message update per 5 minutes
   - 1 digest message per 4 hours

2. Conflict Resolution
   - Higher timeframe messages take priority
   - Newer setups override older ones
   - Invalidations bypass rate limiting

## 4. Message Formatting

### Setup Alert Template
```
🎯 {SYMBOL} SETUP ALERT
📈 Internal Reversal in {POI_TYPE}
⏰ {TIME} UTC | {TIMEFRAME}

SEQUENCE DETECTED:
1. ✅ {POI_SIGNAL}
   Time: {T0}
2. ✅ {ENTRY_SIGNAL}
   Time: {T1}
3. ✅ {INTERNAL_BOS_SIGNAL}
   Time: {T2}
4. ✅ {INTERNAL_CHOCH_SIGNAL}
   Time: {T3}

STRUCTURE STATUS:
• Active {POI_TYPE}
• Last Internal BOS: {DIRECTION} @{T2}
• Last Internal CHoCH: {DIRECTION} @{T3}

#symbol #setup #internal_reversal
```

### Pinned Message Template
```
📊 {SYMBOL} Market Structure
🕒 {CURRENT_TIME} UTC

{TIMEFRAME}
━━━━━━━━━━━━━━━━━━
ACTIVE SIGNALS:
• {POI_LIST}
• {STRUCTURE_LIST}

INTERNAL STRUCTURE:
• {INTERNAL_SIGNALS_LIST}

#symbol #status
```

### Invalidation Message Template
```
❌ {SYMBOL} SETUP INVALIDATED
⚠️ {SETUP_TYPE} ({TIMEFRAME})
⏰ {TIME} UTC

INVALIDATION:
• Signal: {INVALIDATION_SIGNAL}
• Time: {SIGNAL_TIME}

ACTIVE STRUCTURE:
• {CURRENT_SIGNALS_LIST}

#symbol #invalidation
```

## 5. Error Handling and Recovery

### Signal Processing Errors
1. Missing Signal Recovery
   - Continue tracking incomplete sequences
   - Clear sequences after timeout periods
   - Log signal gaps for analysis

2. Conflicting Signal Resolution
   - Apply timeframe hierarchy
   - Use most recent signal in conflicts
   - Clear conflicting active states

### Message Error Recovery
1. Failed Message Handling
   - Retry critical messages up to 3 times
   - Queue status updates for retry
   - Log message delivery failures

2. State Recovery
   - Maintain last known good state
   - Rebuild state from signal history
   - Resume from last successful message

## 6. Performance Optimization

### Signal Processing
1. Batch Processing
   - Process signals in 1-minute batches
   - Combine multiple updates into single messages
   - Limit real-time processing to critical signals

2. State Management
   - Limit active setup tracking to 10 per symbol
   - Clean up completed setups after 4 hours
   - Archive signals older than 24 hours

### Message Generation
1. Template Optimization
   - Pre-compile message templates
   - Cache common message components
   - Limit dynamic content generation

2. Queue Management
   - Prioritize message queue processing
   - Drop non-critical messages under load
   - Maintain separate queues per priority level