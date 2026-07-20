import type {
  EnemyKind,
  EnemyState,
  EnemyVariant,
  PathId,
} from '../types/GameTypes';

export interface EnemySnapshot {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant;
  readonly state: EnemyState;
  readonly pathId: PathId;
  readonly pathProgress: number;
  readonly position: { readonly x: number; readonly y: number };
  readonly etaMs: number;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly spawnSequence: number;
  readonly isBoss: boolean;
  readonly moveSpeedMultiplier: number;
  readonly slowRemainingMs: number;
  readonly dashCooldownRemainingMs: number;
  readonly animationElapsedMs: number;
}
