import type { GameMode } from '../core/GameMode';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { EnemySpawnRequest } from '../waves/WaveTypes';

export type TestScenarioId = 'empty-run' | 'wave-schedule' | 'health-bar-colors';

export interface GameDebugSnapshot extends RunSnapshot {
  readonly player: { readonly x: number; readonly y: number };
  readonly enemyPool: PoolSnapshot;
}

type GameDebugEventMetadata = {
  readonly sequence: number;
  readonly atMs: number;
};

export type GameDebugEvent = GameDebugEventMetadata & (
  | { readonly type: 'modeChanged'; readonly mode: GameMode }
  | { readonly type: 'playerMoved' }
  | { readonly type: 'enemySpawnRequested'; readonly request: EnemySpawnRequest }
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
