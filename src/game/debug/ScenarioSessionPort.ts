import type { GameEvent } from '../events/GameEvents';
import type { PoolSnapshot } from '../pooling/ObjectPool';
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

export type ScenarioWaveSchedule = 'real' | 'held' | 'exhausted';

export interface ScenarioSessionPort {
  spawnEnemy(seed: ScenarioEnemySeed): number;
  damageEnemy(enemyId: number, amount: number): readonly GameEvent[];
  stunEnemy(enemyId: number, durationMs: number): void;
  knockBackEnemy(enemyId: number, distance: number): void;
  removeEnemyWithoutReward(enemyId: number): void;
  suppressWaveSpawns(): void;
  useWaveSchedule(wave: number, schedule: ScenarioWaveSchedule): void;
  damageShelter(damage: number): readonly GameEvent[];
  projectilePoolTelemetry(): PoolSnapshot;
}

export interface ScenarioScenePort {
  seedEnemy(seed: ScenarioEnemySeed): number;
  suppressWaveSpawns(): void;
  useWaveSchedule(wave: number, schedule: ScenarioWaveSchedule): void;
  damageShelter(damage: number): readonly GameEvent[];
  removeEnemyWithoutReward(enemyId: number): void;
  sessionIdentity(): object;
}
