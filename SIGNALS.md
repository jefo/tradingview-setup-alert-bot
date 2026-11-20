# Trading Signals Documentation

This document describes the various trading signals processed by the TradingView Setup Alert Bot, their meanings, and typical scenarios.

## Setup: Internal Reversal within Swing POI

### Description
This setup occurs when an internal structure reversal forms within a higher timeframe (swing) point of interest (POI), such as Order Blocks or Imbalances. It combines the precision of internal structure with the strength of higher timeframe zones.

### Signal Sequence
1. Initial POI Formation:
   - Either `new bullish order block`/`new bearish order block` for Order Blocks
   - Or `bullish imbalance`/`bearish imbalance` for Imbalances

2. Price Entry into POI:
   - `bullish ob entered`/`bearish ob entered` for Order Blocks
   - `bullish imbalance entered`/`bearish imbalance entered` for Imbalances

3. Internal Structure Formation:
   - For Bullish Reversal:
     1. `internal bearish bos formed` (showing initial bearish pressure)
     2. Followed by `internal bullish choch formed` (showing reversal)
   - For Bearish Reversal:
     1. `internal bullish bos formed` (showing initial bullish pressure)
     2. Followed by `internal bearish choch formed` (showing reversal)

### Typical Scenarios

#### Bullish Setup
1. Price enters a bullish Order Block or Imbalance zone
2. Initial bearish pressure forms (internal bearish BOS)
3. Price creates internal bullish CHoCH, indicating potential reversal
4. Momentum continues in bullish direction, potentially leading to `bullish ob mitigated` or `bullish imbalance mitigated`

#### Bearish Setup
1. Price enters a bearish Order Block or Imbalance zone
2. Initial bullish pressure forms (internal bullish BOS)
3. Price creates internal bearish CHoCH, indicating potential reversal
4. Momentum continues in bearish direction, potentially leading to `bearish ob mitigated` or `bearish imbalance mitigated`

### Invalidation Rules
1. Break of the internal CHoCH structure
2. Price leaving the POI zone without proper structure formation
3. Formation of opposing swing structure (e.g., bearish swing BOS in bullish setup)

### Key Points
- The setup is stronger when the internal structure aligns with the higher timeframe POI direction
- Multiple internal structure formations may occur within the same POI
- Entry should be taken after confirmation of internal CHoCH
- Stop loss should be placed beyond the internal structure's extremes

## Break of Structure (BOS) Signals

### Internal BOS
- **Bullish Internal BOS**
  - Signal: `internal bullish bos formed`
  - Description: Break of minor internal resistance level
  - Typical scenario: Price breaks above a local high within the current structure
  - Invalidation: Formation of a new bearish internal BOS or break below the structure low

- **Bearish Internal BOS**
  - Signal: `internal bearish bos formed`
  - Description: Break of minor internal support level
  - Typical scenario: Price breaks below a local low within the current structure
  - Invalidation: Formation of a new bullish internal BOS or break above the structure high

### Swing BOS
- **Bullish Swing BOS**
  - Signal: `bullish bos formed`
  - Description: Break of significant swing high
  - Typical scenario: Price breaks above a major swing high, indicating trend continuation
  - Invalidation: Break below the last significant swing low

- **Bearish Swing BOS**
  - Signal: `bearish bos formed`
  - Description: Break of significant swing low
  - Typical scenario: Price breaks below a major swing low, indicating trend continuation
  - Invalidation: Break above the last significant swing high

## Change of Character (CHoCH) Signals

### Internal CHoCH
- **Bullish Internal CHoCH**
  - Signals: `internal bullish choch formed`, `internal bullish choch+ formed`
  - Description: Potential shift from bearish to bullish within internal structure
  - Typical scenario: After a downward movement, price creates a higher low and breaks above previous internal high
  - Invalidation: Break below the CHoCH formation low

- **Bearish Internal CHoCH**
  - Signals: `internal bearish choch formed`, `internal bearish choch+ formed`
  - Description: Potential shift from bullish to bearish within internal structure
  - Typical scenario: After an upward movement, price creates a lower high and breaks below previous internal low
  - Invalidation: Break above the CHoCH formation high

### Swing CHoCH
- **Bullish Swing CHoCH**
  - Signals: `bullish choch formed`, `bullish choch+ formed`
  - Description: Major potential trend reversal to upside
  - Typical scenario: Formation of higher low after significant downtrend, followed by break of swing high
  - Invalidation: Break below the swing low that formed the CHoCH

- **Bearish Swing CHoCH**
  - Signals: `bearish choch formed`, `bearish choch+ formed`
  - Description: Major potential trend reversal to downside
  - Typical scenario: Formation of lower high after significant uptrend, followed by break of swing low
  - Invalidation: Break above the swing high that formed the CHoCH

## Order Block (OB) Signals

### Order Block Creation
- **Bullish Order Block**
  - Signal: `new bullish order block`
  - Description: Creation of significant buying interest zone
  - Typical scenario: Strong move up after a consolidation period
  - Invalidation: Break below the order block low

- **Bearish Order Block**
  - Signal: `new bearish order block`
  - Description: Creation of significant selling interest zone
  - Typical scenario: Strong move down after a consolidation period
  - Invalidation: Break above the order block high

### Order Block Interaction
- **Order Block Entry**
  - Signals: `bullish ob entered`, `bearish ob entered`
  - Description: Price entering order block zone
  - Typical scenario: Price retracing to test previous order block level

- **Within Order Block**
  - Signals: `within bullish ob`, `within bearish ob`
  - Description: Price consolidating within order block
  - Typical scenario: Price spending time within the order block zone before potential reaction

- **Order Block Mitigation**
  - Signals: `bullish ob mitigated`, `bearish ob mitigated`
  - Description: Confirmation of order block strength
  - Typical scenario: Price returns to order block and resumes original direction

## Imbalance Signals

### Imbalance Detection
- **Imbalance Identified**
  - Signals: `bullish imbalance`, `bearish imbalance`
  - Description: Price inefficiency detected
  - Typical scenario: Gap in price action due to strong directional movement
  - Invalidation: Complete mitigation of the imbalance area

### Imbalance Interaction
- **Imbalance Entry**
  - Signals: `bullish imbalance entered`, `bearish imbalance entered`
  - Description: Price entering imbalance area
  - Typical scenario: Price retracing to fill the inefficiency

- **Within Imbalance**
  - Signals: `within bullish imbalance`, `within bearish imbalance`
  - Description: Price consolidating within imbalance area
  - Typical scenario: Price spending time within the imbalance zone during mitigation

- **Imbalance Mitigation**
  - Signals: `bullish imbalance mitigated`, `bearish imbalance mitigated`
  - Description: Imbalance area has been filled
  - Typical scenario: Price completely retraces the imbalance area

## Breaker Signals
- **Bullish Breaker**
  - Signal: `bullish breaker formed`
  - Description: Previous resistance turned support
  - Typical scenario: Break above resistance, pullback, and bounce
  - Invalidation: Break below the breaker low

- **Bearish Breaker**
  - Signal: `bearish breaker formed`
  - Description: Previous support turned resistance
  - Typical scenario: Break below support, pullback, and rejection
  - Invalidation: Break above the breaker high

## Liquidity Grab Signals
- **Bullish Grab**
  - Signal: `bullish grab`
  - Description: Stop-loss hunt below support before upward reversal
  - Typical scenario: Quick spike below support followed by strong bullish movement
  - Invalidation: Continued movement below the grab level

- **Bearish Grab**
  - Signal: `bearish grab`
  - Description: Stop-loss hunt above resistance before downward reversal
  - Typical scenario: Quick spike above resistance followed by strong bearish movement
  - Invalidation: Continued movement above the grab level
