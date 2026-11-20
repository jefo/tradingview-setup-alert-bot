# Architecture Design

## Core Business Domain

### Domain Concepts
1. **Signal**
   - Atomic market event
   - Has type, direction, and state
   - Contains temporal and contextual information

2. **Setup**
   - Sequence of related signals
   - Has specific validation rules
   - Contains market structure context
   - Can be invalidated

3. **Market Structure**
   - Hierarchical timeframe organization
   - Points of Interest (POI)
   - Market state and context

4. **Alert**
   - Notification about significant market events
   - Contains actionable information
   - Has priority and context

## Architecture Principles

### 1. Domain-Driven Design
- Clear separation of domain logic from infrastructure
- Rich domain models with encapsulated business rules
- Immutable value objects for signal and market data
- Aggregates for maintaining consistency boundaries

### 2. Event-Driven Architecture
- Signals as domain events
- Event sourcing for market state reconstruction
- Clear event flow through the system
- Async processing with guaranteed delivery

### 3. SOLID Principles
- Single Responsibility: Each component handles one aspect of business logic
- Open/Closed: Extensible for new signal types and setups
- Liskov Substitution: Consistent behavior across signal/setup types
- Interface Segregation: Focused interfaces for different use cases
- Dependency Inversion: High-level modules independent of details

## System Components

### 1. Signal Processing Domain
```typescript
// Core interfaces
interface Signal {
  readonly id: string;
  readonly type: SignalType;
  readonly timestamp: Date;
  readonly context: SignalContext;
  validate(): ValidationResult;
}

interface SignalProcessor {
  process(signal: Signal): Promise<ProcessingResult>;
  validateSequence(signals: Signal[]): ValidationResult;
}

// Implementation pattern
class SignalProcessingService implements SignalProcessor {
  constructor(
    private readonly validator: SignalValidator,
    private readonly enricher: SignalEnricher,
    private readonly publisher: EventPublisher
  ) {}
}
```

### 2. Setup Detection Domain
```typescript
interface Setup {
  readonly id: string;
  readonly type: SetupType;
  readonly signals: Signal[];
  readonly state: SetupState;
  
  isValid(): boolean;
  canAddSignal(signal: Signal): boolean;
  addSignal(signal: Signal): Setup;
}

interface SetupDetector {
  detectSetup(signals: Signal[]): Setup[];
  validateSetup(setup: Setup): ValidationResult;
}
```

### 3. Market Context Domain
```typescript
interface MarketStructure {
  readonly timeframe: Timeframe;
  readonly state: MarketState;
  readonly context: MarketContext;
  
  validateStructure(signal: Signal): boolean;
  updateStructure(signal: Signal): MarketStructure;
}

interface MarketContextManager {
  getContext(timeframe: Timeframe): MarketContext;
  updateContext(signal: Signal): void;
  validateContext(setup: Setup): ValidationResult;
}
```

### 4. Alert Management Domain
```typescript
interface Alert {
  readonly id: string;
  readonly priority: AlertPriority;
  readonly context: AlertContext;
  readonly content: AlertContent;
}

interface AlertManager {
  createAlert(setup: Setup): Alert;
  prioritizeAlert(alert: Alert): AlertPriority;
  deliverAlert(alert: Alert): Promise<DeliveryResult>;
}
```

## Data Flow

1. **Signal Reception**
   ```
   TradingView Webhook -> Signal Validator -> Signal Processor
   ```

2. **Signal Processing**
   ```
   Signal -> Enricher -> Validator -> Market Context -> Setup Detector
   ```

3. **Setup Management**
   ```
   Setup Detector -> Validator -> State Manager -> Alert Generator
   ```

4. **Alert Delivery**
   ```
   Alert Generator -> Prioritizer -> Rate Limiter -> Delivery Service
   ```

## Implementation Patterns

### 1. Factory Pattern
- SignalFactory for creating different signal types
- SetupFactory for creating setup instances
- AlertFactory for creating alerts

### 2. Strategy Pattern
- SignalValidationStrategy for different signal types
- SetupDetectionStrategy for different setup types
- AlertFormattingStrategy for different alert types

### 3. Observer Pattern
- Market state changes notification
- Setup state changes notification
- Alert delivery status updates

### 4. Command Pattern
- Signal processing commands
- Setup management commands
- Alert delivery commands

### 5. Repository Pattern
- SignalRepository for signal history
- SetupRepository for active setups
- MarketContextRepository for market state

## Error Handling

1. **Domain Errors**
   - Invalid signal sequence
   - Setup validation failure
   - Market structure violation

2. **Infrastructure Errors**
   - Message delivery failure
   - Storage operation failure
   - External service failure

3. **Error Recovery**
   - Retry policies for transient failures
   - Compensation actions for failed operations
   - Event sourcing for state recovery

## Testing Strategy

### 1. Domain Testing
- Unit tests for domain logic
- Property-based tests for validation rules
- Scenario tests for setup detection

### 2. Integration Testing
- Signal flow testing
- Setup detection pipeline testing
- Alert delivery testing

### 3. Performance Testing
- Signal processing throughput
- Setup detection latency
- Alert delivery timing

## Scalability Considerations

1. **Horizontal Scaling**
   - Stateless signal processing
   - Distributed setup detection
   - Parallel alert processing

2. **State Management**
   - Event sourcing for market state
   - Distributed caching for active setups
   - Message queues for alert delivery

3. **Performance Optimization**
   - In-memory processing for active signals
   - Cached market context
   - Batched alert delivery
