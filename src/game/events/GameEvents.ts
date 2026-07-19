import type { GameMode } from '../core/GameMode';
import type { EnemyLifecycleEvent } from '../enemies/EnemySystem';
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
  | { readonly type: 'waveCountdownChanged'; readonly remainingMs: number };
