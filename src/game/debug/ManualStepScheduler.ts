import { SIMULATION_HZ, TIME_EPSILON_MS } from '../constants';

export class ManualStepScheduler {
  private requestedMs = 0;
  private emittedTicks = 0;

  take(durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError('advance duration must be finite and non-negative');
    }
    this.requestedMs += durationMs;
    const targetTicks = Math.floor(
      (this.requestedMs * SIMULATION_HZ) / 1000 + TIME_EPSILON_MS,
    );
    const count = targetTicks - this.emittedTicks;
    this.emittedTicks = targetTicks;
    return count;
  }

  reset(): void {
    this.requestedMs = 0;
    this.emittedTicks = 0;
  }
}
