import { Signal } from "../signals";
import { ISignalValidator } from "../types/signal-processing";
import { isDuplicateSignal } from "../signals";
import { logger } from "./logger";

export class SignalValidator implements ISignalValidator {
  validate(signal: Signal, recentSignals: Signal[]): boolean {
    try {
      // Базовая валидация
      if (!this.isValidSignalFormat(signal)) {
        logger.info("Invalid signal format", { signal });
        return false;
      }

      // Проверка на дубликаты
      const lastSignal = recentSignals[0] || null;
      if (isDuplicateSignal(signal, lastSignal)) {
        logger.info("Duplicate signal detected", { signal, lastSignal });
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Error validating signal", error);
      return false;
    }
  }

  private isValidSignalFormat(signal: Signal): boolean {
    return !!(
      signal &&
      signal.type &&
      signal.normalized &&
      signal.level
    );
  }
}
