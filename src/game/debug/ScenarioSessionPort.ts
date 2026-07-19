import type {
  EnemyKind,
  EnemyState,
  EnemyVariant,
  PathId,
} from '../types/GameTypes';

export interface ScenarioEnemySeed {
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant;
  readonly pathId: PathId;
  readonly placement:
    | { readonly kind: 'attackBoundary' }
    | { readonly kind: 'worldPoint'; readonly x: number; readonly y: number };
  readonly currentHp?: number;
  readonly maxHp?: number;
  readonly state?: EnemyState;
  readonly stunnedMs?: number;
}
