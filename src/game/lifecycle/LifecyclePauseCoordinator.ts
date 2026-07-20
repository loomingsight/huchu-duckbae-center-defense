import type { GameMode } from '../core/GameMode';
import type { VisibilitySessionPort } from './VisibilityController';

export type LifecyclePauseReason = 'visibility' | 'webgl';

export interface LifecyclePauseRuntimePort {
  setWorldPaused(paused: boolean): void;
}

export class LifecyclePauseCoordinator {
  private readonly reasons = new Set<LifecyclePauseReason>();
  private returnMode: GameMode | null = null;

  constructor(
    private readonly session: VisibilitySessionPort,
    private readonly runtime: LifecyclePauseRuntimePort,
  ) {}

  get originalMode(): GameMode | null {
    return this.returnMode;
  }

  has(reason: LifecyclePauseReason): boolean {
    return this.reasons.has(reason);
  }

  acquire(reason: LifecyclePauseReason): boolean {
    if (this.reasons.has(reason)) return true;
    if (this.reasons.size === 0) {
      const mode = this.session.currentMode();
      if (mode === 'visibilityPause' || mode === 'won' || mode === 'lost') return false;
      this.returnMode = mode;
      this.runtime.setWorldPaused(true);
      this.session.requestVisibilityPause();
    }
    this.reasons.add(reason);
    return true;
  }

  release(reason: LifecyclePauseReason, onRelease?: () => void): boolean {
    if (!this.reasons.delete(reason)) return false;
    onRelease?.();
    if (this.reasons.size > 0) return false;
    const expectedMode = this.returnMode;
    this.returnMode = null;
    if (expectedMode === null) return false;
    this.session.requestVisibilityResume();
    const resumedMode = this.session.currentMode();
    if (resumedMode !== expectedMode) {
      throw new Error(`Expected to resume ${expectedMode}, got ${resumedMode}`);
    }
    this.runtime.setWorldPaused(expectedMode !== 'playing');
    return true;
  }

  abandon(reason: LifecyclePauseReason): void {
    this.reasons.delete(reason);
    if (this.reasons.size === 0) this.returnMode = null;
  }

  reset(): void {
    this.reasons.clear();
    this.returnMode = null;
  }
}
