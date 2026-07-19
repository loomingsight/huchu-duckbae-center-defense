import type { GameMode } from '../core/GameMode';

export interface ProgressionContext {
  readonly mode: GameMode;
  readonly activeEnemies: number;
}

export interface SkillSelectionRequest {
  readonly threshold: number;
  readonly index: number;
}

export interface ProgressionSnapshot {
  readonly snacks: number;
  readonly nextThreshold: number | null;
  readonly pendingCount: number;
  readonly selectionOpen: boolean;
  readonly combatDelayRemainingMs: number;
}
