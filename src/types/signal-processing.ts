import { Signal, SignalContext } from "../signals";
import type { SetupEvaluation } from "../engine/types";

export interface MonitoringEvent {
  type: 'info' | 'error' | 'warning';
  service: string;
  event: string;
  data?: unknown;
  timestamp?: Date;
}

export interface ISignalValidator {
  validate(signal: Signal, recentSignals: Signal[]): boolean;
}

export interface ISignalEnricher {
  enrich(signal: Signal, recentSignals: Signal[]): Signal;
}

export interface ISignalRepository {
  saveSignal(signal: Signal): Promise<void>;
  getRecentSignals(limit: number): Promise<Signal[]>;
}

export interface IEventPublisher {
  publishProcessedSignal(signal: Signal, context: SignalContext, setup?: SetupEvaluation): Promise<void>;
  publishMonitoringEvent(event: MonitoringEvent): Promise<void>;
}

export interface IMessageSubscriber {
  subscribe(channel: string): Promise<void>;
  on(event: string, callback: (channel: string, message: string) => void): void;
  quit(): Promise<unknown>;
}
