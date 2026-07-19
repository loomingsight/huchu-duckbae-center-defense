import { subtractDuration } from '../constants';
import type { GameMode } from '../core/GameMode';

export class UiTransitionClock {
  private paused = false;

  constructor(public remainingMs: number) {
    assertDuration(remainingMs);
  }

  restart(durationMs: number): void {
    assertDuration(durationMs);
    this.remainingMs = durationMs;
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  step(stepMs: number, mode: GameMode): 'running' | 'completed' {
    assertDuration(stepMs);
    if (this.remainingMs === 0) return 'completed';
    if (this.paused || (mode !== 'countdown' && mode !== 'lost')) return 'running';
    this.remainingMs = subtractDuration(this.remainingMs, stepMs);
    return this.remainingMs === 0 ? 'completed' : 'running';
  }
}

function assertDuration(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError('UI transition duration must be finite and non-negative');
  }
}
