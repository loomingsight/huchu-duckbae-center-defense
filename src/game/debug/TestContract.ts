import type { GameMode } from '../core/GameMode';
import type { ProjectileImpactSnapshot } from '../combat/ProjectileActorPool';
import type { ProjectileKind } from '../combat/ProjectileSystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
import type { ShelterVisualState } from '../shelter/ShelterTypes';

export type TestScenarioId =
  | 'empty-run'
  | 'wave-schedule'
  | 'health-bar-colors'
  | 'bark-targeting'
  | 'poop-attack'
  | 'boss';

export interface DebugEnemySnapshot extends EnemySnapshot {
  readonly hpBar: {
    readonly visible: true;
    readonly width: number;
    readonly height: number;
    readonly color: number;
  };
}

export interface GameDebugSnapshot extends Omit<RunSnapshot, 'enemies'> {
  readonly enemies: readonly DebugEnemySnapshot[];
  readonly player: { readonly x: number; readonly y: number };
  readonly enemyPool: PoolSnapshot;
  readonly projectilePool: PoolSnapshot;
  readonly projectileImpacts: readonly ProjectileImpactSnapshot[];
  readonly barkWavePool: PoolSnapshot;
}

type GameDebugEventMetadata = {
  readonly sequence: number;
  readonly atMs: number;
};

export type GameDebugEvent = GameDebugEventMetadata & (
  | { readonly type: 'modeChanged'; readonly mode: GameMode }
  | { readonly type: 'playerMoved' }
  | { readonly type: 'enemySpawnRequested'; readonly request: EnemySpawnRequest }
  | { readonly type: 'barkStarted'; readonly attackId: string; readonly targetId: number }
  | { readonly type: 'barkReleased'; readonly attackId: string; readonly targetId: number }
  | {
    readonly type: 'attackStarted' | 'attackCancelled' | 'attackHolding';
    readonly enemyId: number;
  }
  | {
    readonly type: 'projectileSpawned';
    readonly projectileId: number;
    readonly kind: ProjectileKind;
  }
  | {
    readonly type: 'projectileHit';
    readonly projectileId: number;
    readonly kind: ProjectileKind;
    readonly position: { readonly x: number; readonly y: number };
  }
  | {
    readonly type: 'projectileDropped';
    readonly projectileId: number;
    readonly kind: ProjectileKind;
    readonly reason: 'capacity';
  }
  | {
    readonly type: 'shelterDamaged';
    readonly hp: number;
    readonly visual: ShelterVisualState;
  }
  | { readonly type: 'enemyDied'; readonly enemyId: number }
  | { readonly type: 'snackEarned'; readonly enemyId: number; readonly amount: number }
  | { readonly type: 'waveCountdownChanged'; readonly remainingMs: number }
);

export interface HuchuTestBridge {
  readonly ready: Promise<void>;
  loadScenario(id: TestScenarioId): Promise<void>;
  advance(ms: number): Promise<void>;
  advanceWithoutFlush(ms: number): void;
  snapshot(): GameDebugSnapshot;
  eventsSince(sequence: number): readonly GameDebugEvent[];
  simulateVisibility(hidden: boolean): Promise<void>;
  restartScene(): void;
}

declare global {
  interface Window {
    __HUCHU_TEST__?: HuchuTestBridge;
  }
}
