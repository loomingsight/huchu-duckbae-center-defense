import { FIXED_STEP_MS } from '../constants';
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { ScenarioEnemySeed } from './ScenarioSessionPort';
import { ManualStepScheduler } from './ManualStepScheduler';
import { loadScenario, type SessionScenarioRuntime } from './ScenarioFactory';
import type {
  GameDebugEvent,
  GameDebugSnapshot,
  HuchuTestBridge,
  TestScenarioId,
} from './TestContract';

type DebugEventPayload<T extends GameDebugEvent = GameDebugEvent> = T extends GameDebugEvent
  ? Omit<T, 'sequence' | 'atMs'>
  : never;

interface SessionScenePort {
  readonly scene: { restart(): void };
  advanceSimulationStep(stepMs: number): readonly GameEvent[];
  resetSession(seed: number): void;
  resetPlayer(x: number, y: number): void;
  playerSnapshot(): PlayerSnapshot;
  sessionSnapshot(): RunSnapshot;
  enemyActorPoolSnapshot(): PoolSnapshot;
  seedEnemyForScenario(seed: ScenarioEnemySeed): number;
  setVisibilityForTest(hidden: boolean): void;
  waitForRenderFlush(): Promise<void>;
}

class SessionTestBridge implements HuchuTestBridge, SessionScenarioRuntime {
  readonly ready: Promise<void>;
  private readonly scheduler = new ManualStepScheduler();
  private readonly eventLog: GameDebugEvent[] = [];
  private nextSequence = 1;

  constructor(
    private readonly scene: SessionScenePort,
    readonly seed: number,
  ) {
    this.ready = scene.waitForRenderFlush();
  }

  async loadScenario(id: TestScenarioId): Promise<void> {
    loadScenario(this, id);
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
      ...this.scene.sessionSnapshot(),
      player: this.scene.playerSnapshot(),
      enemyPool: this.scene.enemyActorPoolSnapshot(),
    };
  }

  eventsSince(sequence: number): readonly GameDebugEvent[] {
    return this.eventLog.filter((event) => event.sequence > sequence);
  }

  async simulateVisibility(hidden: boolean): Promise<void> {
    const previousMode = this.scene.sessionSnapshot().mode;
    this.scene.setVisibilityForTest(hidden);
    const currentMode = this.scene.sessionSnapshot().mode;
    if (currentMode !== previousMode) {
      this.appendEvent({ type: 'modeChanged', mode: currentMode });
    }
    await this.scene.waitForRenderFlush();
  }

  restartScene(): void {
    this.scene.scene.restart();
  }

  resetManualScheduler(): void {
    this.scheduler.reset();
  }

  resetEventLog(): void {
    this.eventLog.length = 0;
    this.nextSequence = 1;
  }

  resetSession(): void {
    this.scene.resetSession(this.seed);
  }

  resetPlayer(x: number, y: number): void {
    this.scene.resetPlayer(x, y);
  }

  seedEnemy(seed: ScenarioEnemySeed): number {
    return this.scene.seedEnemyForScenario(seed);
  }

  private advanceTicks(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError('advance duration must be finite and non-negative');
    }
    if (this.scene.sessionSnapshot().mode !== 'playing') return;
    for (let ticks = this.scheduler.take(ms); ticks > 0; ticks -= 1) {
      const before = this.scene.playerSnapshot();
      const sessionEvents = this.scene.advanceSimulationStep(FIXED_STEP_MS);
      const after = this.scene.playerSnapshot();
      if (after.x !== before.x || after.y !== before.y) {
        this.appendEvent({ type: 'playerMoved' });
      }
      sessionEvents.forEach((event) => this.appendSessionEvent(event));
    }
  }

  private appendSessionEvent(event: GameEvent): void {
    switch (event.type) {
      case 'enemySpawnRequested':
        this.appendEvent({ type: event.type, request: event.request });
        return;
      case 'enemySpawned':
      case 'enemyDied':
      case 'snackEarned':
        return;
      case 'waveCountdownChanged':
        this.appendEvent({ type: event.type, remainingMs: event.remainingMs });
        return;
      case 'modeChanged':
        this.appendEvent({ type: event.type, mode: event.mode });
        return;
      case 'runEnded':
        return;
    }
  }

  private appendEvent(event: DebugEventPayload): void {
    const loggedEvent = {
      sequence: this.nextSequence,
      atMs: this.scene.sessionSnapshot().simulationMs,
      ...event,
    };
    this.eventLog.push(loggedEvent);
    this.nextSequence += 1;
  }
}

export function installTestBridge(scene: SessionScenePort): () => void {
  if (import.meta.env.MODE !== 'e2e') return NOOP;
  const params = new URLSearchParams(window.location.search);
  if (params.get('e2e') !== '1' || params.get('clock') !== 'manual') return NOOP;
  const seed = parseSeed(params.get('seed'));
  return installOwnedTestBridge(window, new SessionTestBridge(scene, seed));
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
