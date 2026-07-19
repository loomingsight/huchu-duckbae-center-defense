import type { GameMode } from '../core/GameMode';
import type { EnemyLifecycleEvent } from '../enemies/EnemySystem';
import type { Point } from '../world/Geometry';
import type { EnemySpawnRequest } from '../waves/WaveTypes';

export type GameEvent =
  | EnemyLifecycleEvent
  | { readonly type: 'modeChanged'; readonly mode: GameMode }
  | { readonly type: 'runEnded'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'enemySpawnRequested'; readonly request: EnemySpawnRequest }
  | {
    readonly type: 'enemySpawned';
    readonly enemyId: number;
    readonly request: EnemySpawnRequest;
  }
  | {
    readonly type: 'barkStarted';
    readonly attackId: string;
    readonly targetId: number;
  }
  | {
    readonly type: 'barkReleased';
    readonly attackId: string;
    readonly targetId: number;
    readonly origin: Point;
    readonly target: Point;
  }
  | { readonly type: 'waveCountdownChanged'; readonly remainingMs: number };
