import type { GameMode } from '../core/GameMode';

export type TestScenarioId = 'empty-run';

export interface GameDebugSnapshot {
  mode: GameMode;
  player: { x: number; y: number };
  simulationMs: number;
}

export type GameDebugEvent = {
  sequence: number;
  atMs: number;
  type: 'modeChanged' | 'playerMoved';
};

export interface HuchuTestBridge {
  readonly ready: Promise<void>;
  loadScenario(id: TestScenarioId): Promise<void>;
  advance(ms: number): Promise<void>;
  advanceWithoutFlush(ms: number): void;
  snapshot(): GameDebugSnapshot;
  eventsSince(sequence: number): readonly GameDebugEvent[];
  simulateVisibility(hidden: boolean): Promise<void>;
}

declare global {
  interface Window {
    __HUCHU_TEST__?: HuchuTestBridge;
  }
}
