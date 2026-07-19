import { SIMULATION_HZ, TIME_EPSILON_MS } from '../constants';

export const MAX_MANUAL_TICKS_PER_CALL = 10_000;

export class ManualStepScheduler {
  private requestedMs = 0;
  private emittedTicks = 0;

  take(durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError('advance duration must be finite and non-negative');
    }
    const requestedMs = this.requestedMs + durationMs;
    const targetTicks = Math.floor(
      ((requestedMs + TIME_EPSILON_MS) * SIMULATION_HZ) / 1000,
    );
    if (!Number.isSafeInteger(targetTicks)) {
      throw new RangeError('manual step target must be a safe integer');
    }
    const count = targetTicks - this.emittedTicks;
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_MANUAL_TICKS_PER_CALL) {
      throw new RangeError(`advance cannot emit more than ${MAX_MANUAL_TICKS_PER_CALL} ticks`);
    }
    this.requestedMs = requestedMs;
    this.emittedTicks = targetTicks;
    return count;
  }

  reset(): void {
    this.requestedMs = 0;
    this.emittedTicks = 0;
  }
}
