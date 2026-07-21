import type { ProjectileSpawn } from '../combat/ProjectileSystem';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { EnemyKind, EnemyState, EnemyVariant, PathId } from '../types/GameTypes';

export interface ScenarioEnemySeed {
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant;
  readonly pathId: PathId;
  readonly placement:
    | { readonly kind: 'attackBoundary' }
    | { readonly kind: 'pathProgress'; readonly value: number }
    | { readonly kind: 'worldPoint'; readonly x: number; readonly y: number };
  readonly currentHp?: number;
  readonly maxHp?: number;
  readonly state?: Extract<EnemyState, 'moving' | 'windup' | 'holding'>;
  readonly heldForDebug?: boolean;
}

export type ScenarioWaveSchedule = 'real' | 'held' | 'exhausted';

export interface ScenarioSessionPort {
  spawnEnemy(seed: ScenarioEnemySeed): number;
  removeEnemyWithoutReward(enemyId: number): void;
  suppressWaveSpawns(): void;
  useWaveSchedule(wave: number, schedule: ScenarioWaveSchedule): void;
  grantSnacks(amount: number): void;
  spawnProjectile(seed: ProjectileSpawn): void;
  maintainStressProjectiles(): number;
  prepareTerminalTie(): void;
  resetSimulationClock(): void;
  projectilePoolTelemetry(): PoolSnapshot;
}

export interface ScenarioScenePort {
  seedEnemy(seed: ScenarioEnemySeed): number;
  suppressWaveSpawns(): void;
  useWaveSchedule(wave: number, schedule: ScenarioWaveSchedule): void;
  grantSnacks(amount: number): void;
  seedProjectile(seed: ProjectileSpawn): void;
  maintainStressPools(): void;
  prepareTerminalTie(): void;
  resetScenarioPresentation(): void;
  resetSimulationClock(): void;
  projectilePoolTelemetry(): PoolSnapshot;
  removeEnemyWithoutReward(enemyId: number): void;
  sessionIdentity(): object;
}
