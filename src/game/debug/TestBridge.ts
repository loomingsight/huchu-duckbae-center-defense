import { FIXED_STEP_MS } from '../constants';
import type { GameMode } from '../core/GameMode';
import {
  ENEMY_HP_BAR_HEIGHT,
  ENEMY_HP_BAR_WIDTH,
  enemyHpColor,
  enemyHpRatio,
} from '../enemies/EnemyHpBar';
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { ProjectileImpactSnapshot } from '../combat/ProjectileActorPool';
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
  projectileActorPoolSnapshot(): PoolSnapshot;
  projectileImpactSnapshots(): readonly ProjectileImpactSnapshot[];
  shelterShakeOffsetSnapshot(): number;
  combatEffectsSnapshot(): PoolSnapshot;
  seedEnemyForScenario(seed: ScenarioEnemySeed): number;
  suppressWaveSpawnsForScenario(): void;
  setVisibilityForTest(hidden: boolean): void;
  forceModeForTest(mode: GameMode): void;
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
    const run = this.scene.sessionSnapshot();
    return {
      ...run,
      enemies: run.enemies.map((enemy) => ({
        ...enemy,
        hpBar: {
          visible: true,
          width: ENEMY_HP_BAR_WIDTH,
          height: ENEMY_HP_BAR_HEIGHT,
          color: enemyHpColor(enemyHpRatio(enemy.currentHp, enemy.maxHp)),
        },
      })),
      player: this.scene.playerSnapshot(),
      enemyPool: this.scene.enemyActorPoolSnapshot(),
      projectilePool: this.scene.projectileActorPoolSnapshot(),
      projectileImpacts: this.scene.projectileImpactSnapshots(),
      shelterShakeOffset: this.scene.shelterShakeOffsetSnapshot(),
      barkWavePool: this.scene.combatEffectsSnapshot(),
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

  stepSceneOnceForTest(): void {
    this.scene.advanceSimulationStep(FIXED_STEP_MS);
  }

  forceModeForTest(mode: GameMode): void {
    this.scene.forceModeForTest(mode);
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

  suppressWaveSpawns(): void {
    this.scene.suppressWaveSpawnsForScenario();
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
        return;
      case 'barkStarted':
      case 'barkReleased':
        this.appendEvent({
          type: event.type,
          attackId: event.attackId,
          targetId: event.targetId,
        });
        return;
      case 'attackStarted':
      case 'attackCancelled':
      case 'attackHolding':
        this.appendEvent({ type: event.type, enemyId: event.enemyId });
        return;
      case 'projectileSpawned':
        this.appendEvent({
          type: event.type,
          projectileId: event.projectileId,
          kind: event.kind,
        });
        return;
      case 'projectileHit':
        this.appendEvent({
          type: event.type,
          projectileId: event.projectileId,
          kind: event.kind,
          position: event.position,
        });
        return;
      case 'projectileDropped':
        this.appendEvent({
          type: event.type,
          projectileId: event.projectileId,
          kind: event.kind,
          reason: event.reason,
        });
        return;
      case 'shelterDamaged':
        this.appendEvent({
          type: event.type,
          hp: event.hp,
          visual: event.visual,
        });
        return;
      case 'projectileRequested':
      case 'shelterDamageRequested':
        return;
      case 'enemyDied':
        this.appendEvent({ type: event.type, enemyId: event.enemyId });
        return;
      case 'snackEarned':
        this.appendEvent({
          type: event.type,
          enemyId: event.enemyId,
          amount: event.amount,
        });
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
