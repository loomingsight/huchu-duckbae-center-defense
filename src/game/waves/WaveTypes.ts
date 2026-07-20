import type { EnemyKind, EnemyVariant, PathId } from '../types/GameTypes';

export type BossKind = Extract<EnemyKind, 'dogTrader' | 'illegalBreeder'>;

export type SpawnGroup = readonly [
  atSeconds: number,
  poopGuardianCount: number,
  offLeashGuardianCount: number,
  bossKind?: BossKind,
];

export interface ScheduledSpawn {
  readonly atMs: number;
  readonly pathId: PathId;
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant;
}

export interface WaveDefinition {
  readonly wave: number;
  readonly pathIds: readonly PathId[];
  readonly groups: readonly SpawnGroup[];
}

export interface EnemySpawnRequest extends Omit<ScheduledSpawn, 'variant'> {
  readonly variant: EnemyVariant;
  readonly spawnSequence: number;
}
