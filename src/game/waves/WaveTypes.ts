import type { EnemyKind, EnemyVariant, PathId } from '../types/GameTypes';

export interface ScheduledSpawn {
  readonly atMs: number;
  readonly pathId: PathId;
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant | 'seeded';
}

export interface WaveDefinition {
  readonly wave: number;
  readonly spawns: readonly ScheduledSpawn[];
}

export interface EnemySpawnRequest extends Omit<ScheduledSpawn, 'variant'> {
  readonly variant: EnemyVariant;
  readonly spawnSequence: number;
}
