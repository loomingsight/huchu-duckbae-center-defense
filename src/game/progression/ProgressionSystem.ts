import { reachedDuration } from '../constants';
import type {
  ProgressionContext,
  ProgressionSnapshot,
  SkillSelectionRequest,
} from './ProgressionTypes';

export class ProgressionSystem {
  private readonly thresholds: readonly number[];
  private snacks = 0;
  private thresholdCursor = 0;
  private combatSinceSelectionMs: number;
  private selectionOpen = false;

  constructor(
    thresholds: readonly number[],
    private readonly delayMs: number,
  ) {
    if (
      thresholds.length === 0
      || thresholds.some((value, index) => (
        !Number.isSafeInteger(value)
        || value <= 0
        || (index > 0 && value <= thresholds[index - 1]!)
      ))
    ) {
      throw new RangeError('Skill thresholds must be positive and strictly ascending');
    }
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError('Skill delay must be finite and non-negative');
    }
    this.thresholds = [...thresholds];
    this.combatSinceSelectionMs = delayMs;
  }

  addSnacks(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError('Snacks must be a non-negative integer');
    }
    if (!Number.isSafeInteger(this.snacks + amount)) {
      throw new RangeError('Snack total must be a safe integer');
    }
    this.snacks += amount;
  }

  step(stepMs: number, context: ProgressionContext): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Progression step must be finite and non-negative');
    }
    if (!Number.isSafeInteger(context.activeEnemies) || context.activeEnemies < 0) {
      throw new RangeError('Progression activeEnemies must be a non-negative safe integer');
    }
    if (context.mode === 'playing' && context.activeEnemies > 0) {
      this.combatSinceSelectionMs = Math.min(
        this.delayMs,
        this.combatSinceSelectionMs + stepMs,
      );
    }
  }

  reset(): void {
    this.snacks = 0;
    this.thresholdCursor = 0;
    this.combatSinceSelectionMs = this.delayMs;
    this.selectionOpen = false;
  }

  canOpen(): boolean {
    const threshold = this.thresholds.at(this.thresholdCursor);
    return !this.selectionOpen
      && threshold !== undefined
      && this.snacks >= threshold
      && reachedDuration(this.combatSinceSelectionMs, this.delayMs);
  }

  takeNextRequest(): SkillSelectionRequest | undefined {
    if (!this.canOpen()) return undefined;
    const threshold = this.thresholds.at(this.thresholdCursor)!;
    this.selectionOpen = true;
    return { threshold, index: this.thresholdCursor };
  }

  resolveSelection(): void {
    if (!this.selectionOpen) throw new Error('No skill selection is open');
    this.selectionOpen = false;
    this.thresholdCursor += 1;
    this.combatSinceSelectionMs = 0;
  }

  snapshot(): ProgressionSnapshot {
    const dueFromCursor = this.thresholds
      .slice(this.thresholdCursor)
      .filter((value) => value <= this.snacks)
      .length;
    return {
      snacks: this.snacks,
      nextThreshold: this.thresholds.at(this.thresholdCursor) ?? null,
      pendingCount: Math.max(0, dueFromCursor - Number(this.selectionOpen)),
      selectionOpen: this.selectionOpen,
      combatDelayRemainingMs: Math.max(0, this.delayMs - this.combatSinceSelectionMs),
    };
  }
}
