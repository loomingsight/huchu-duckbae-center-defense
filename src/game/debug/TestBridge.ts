import { FIXED_STEP_MS } from '../constants';
import type { GameMode } from '../core/GameMode';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import { ManualStepScheduler } from './ManualStepScheduler';
import { loadEmptyRun, type PlayerOnlyScenarioRuntime } from './ScenarioFactory';
import type {
  GameDebugEvent,
  GameDebugSnapshot,
  HuchuTestBridge,
  TestScenarioId,
} from './TestContract';

interface PlayerOnlyScenePort {
  advancePlayerOnlyStep(stepMs: number): void;
  resetManualSimulation(): void;
  resetPlayer(x: number, y: number): void;
  playerSnapshot(): PlayerSnapshot;
  simulationMs(): number;
  currentMode(): GameMode;
  setVisibilityForTest(hidden: boolean): void;
  waitForRenderFlush(): Promise<void>;
}

class PlayerOnlyTestBridge implements HuchuTestBridge, PlayerOnlyScenarioRuntime {
  readonly ready: Promise<void>;
  private readonly scheduler = new ManualStepScheduler();
  private readonly eventLog: GameDebugEvent[] = [];
  private nextSequence = 1;

  constructor(
    private readonly scene: PlayerOnlyScenePort,
    readonly seed: number,
  ) {
    this.ready = scene.waitForRenderFlush();
  }

  async loadScenario(id: TestScenarioId): Promise<void> {
    if (id !== 'empty-run') throw new RangeError(`Unknown test scenario: ${String(id)}`);
    loadEmptyRun(this);
    await this.scene.waitForRenderFlush();
  }

  async advance(ms: number): Promise<void> {
    this.advanceTicks(ms);
    await this.scene.waitForRenderFlush();
  }

  advanceWithoutFlush(_ms: number): void {
    throw new Error('advanceWithoutFlush is only available for the stress scenario');
  }

  snapshot(): GameDebugSnapshot {
    return {
      mode: this.scene.currentMode(),
      player: this.scene.playerSnapshot(),
      simulationMs: this.scene.simulationMs(),
    };
  }

  eventsSince(sequence: number): readonly GameDebugEvent[] {
    return this.eventLog.filter((event) => event.sequence > sequence);
  }

  async simulateVisibility(hidden: boolean): Promise<void> {
    const previousMode = this.scene.currentMode();
    this.scene.setVisibilityForTest(hidden);
    if (this.scene.currentMode() !== previousMode) this.appendEvent('modeChanged');
    await this.scene.waitForRenderFlush();
  }

  resetManualScheduler(): void {
    this.scheduler.reset();
    this.scene.resetManualSimulation();
  }

  resetEventLog(): void {
    this.eventLog.length = 0;
    this.nextSequence = 1;
  }

  resetPlayer(x: number, y: number): void {
    this.scene.resetPlayer(x, y);
  }

  private advanceTicks(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError('advance duration must be finite and non-negative');
    }
    if (this.scene.currentMode() !== 'playing') return;
    for (let ticks = this.scheduler.take(ms); ticks > 0; ticks -= 1) {
      const before = this.scene.playerSnapshot();
      this.scene.advancePlayerOnlyStep(FIXED_STEP_MS);
      const after = this.scene.playerSnapshot();
      if (after.x !== before.x || after.y !== before.y) this.appendEvent('playerMoved');
    }
  }

  private appendEvent(type: GameDebugEvent['type']): void {
    this.eventLog.push({
      sequence: this.nextSequence,
      atMs: this.scene.simulationMs(),
      type,
    });
    this.nextSequence += 1;
  }
}

export function installTestBridge(scene: PlayerOnlyScenePort): () => void {
  if (import.meta.env.MODE !== 'e2e') return NOOP;
  const params = new URLSearchParams(window.location.search);
  if (params.get('e2e') !== '1' || params.get('clock') !== 'manual') return NOOP;
  const seed = parseSeed(params.get('seed'));
  return installOwnedTestBridge(window, new PlayerOnlyTestBridge(scene, seed));
}

export function installOwnedTestBridge(
  target: { __HUCHU_TEST__?: HuchuTestBridge },
  bridge: HuchuTestBridge,
): () => void {
  target.__HUCHU_TEST__ = bridge;
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (target.__HUCHU_TEST__ === bridge) delete target.__HUCHU_TEST__;
  };
}

const NOOP = (): void => {};

function parseSeed(value: string | null): number {
  if (value === null) return 424242;
  const seed = Number(value);
  return Number.isSafeInteger(seed) ? seed : 424242;
}
