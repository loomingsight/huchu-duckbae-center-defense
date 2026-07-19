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
import type { HudSnapshot } from '../ui/HudSystem';
import { shelterFrameFor } from '../shelter/ShelterView';
import { shelterVisualState } from '../shelter/ShelterSystem';
import type {
  ScenarioEnemySeed,
  ScenarioScenePort,
  ScenarioWaveSchedule,
} from './ScenarioSessionPort';
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
  combatEffectPoolSnapshot(): PoolSnapshot;
  hudSnapshot(): HudSnapshot;
  skillCardsSnapshot(): GameDebugSnapshot['cards'];
  skillCooldownProgressSnapshot(): GameDebugSnapshot['cooldownProgress'];
  countdownSnapshot(): GameDebugSnapshot['countdown'];
  worldClocksSnapshot(): GameDebugSnapshot['worldClocks'];
  scenarioPortForE2e(): ScenarioScenePort;
  onSessionReset(listener: () => void): () => void;
  setVisibilityForTest(hidden: boolean): void;
  forceModeForTest(mode: GameMode): void;
  waitForRenderFlush(): Promise<void>;
}

class SessionTestBridge implements HuchuTestBridge, SessionScenarioRuntime {
  readonly ready: Promise<void>;
  private readonly scheduler = new ManualStepScheduler();
  private readonly eventLog: GameDebugEvent[] = [];
  private nextSequence = 1;
  private waveAutoClear = false;
  private readonly removeSessionResetListener: () => void;
  private readonly scenario: ScenarioScenePort;

  constructor(
    private readonly scene: SessionScenePort,
    readonly seed: number,
  ) {
    this.scenario = scene.scenarioPortForE2e();
    this.removeSessionResetListener = scene.onSessionReset(() => {
      this.waveAutoClear = false;
    });
    this.ready = scene.waitForRenderFlush();
  }

  dispose(): void {
    this.removeSessionResetListener();
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
    const enemyPool = this.scene.enemyActorPoolSnapshot();
    const projectilePool = this.scene.projectileActorPoolSnapshot();
    const effectPool = this.scene.combatEffectPoolSnapshot();
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
      enemyPool,
      projectilePool,
      projectileImpacts: this.scene.projectileImpactSnapshots(),
      shelterShakeOffset: this.scene.shelterShakeOffsetSnapshot(),
      barkWavePool: this.scene.combatEffectsSnapshot(),
      combatEffectPool: effectPool,
      pools: {
        enemies: enemyPool,
        projectiles: projectilePool,
        effects: effectPool,
      },
      runtime: { sessionInstanceId: objectIdentity(this.scenario.sessionIdentity()) },
      shelterFrame: shelterFrameFor(shelterVisualState(run.shelterHp, 100)),
      hud: this.scene.hudSnapshot(),
      cards: this.scene.skillCardsSnapshot(),
      cooldownProgress: this.scene.skillCooldownProgressSnapshot(),
      countdown: this.scene.countdownSnapshot(),
      worldClocks: this.scene.worldClocksSnapshot(),
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
    this.scenario.suppressWaveSpawns();
  }

  useWaveSchedule(wave: number, schedule: ScenarioWaveSchedule): void {
    this.scenario.useWaveSchedule(wave, schedule);
  }

  damageShelter(damage: number): void {
    this.scenario.damageShelter(damage).forEach((event) => this.appendSessionEvent(event));
  }

  enableWaveAutoClear(): void {
    this.waveAutoClear = true;
  }

  seedEnemy(seed: ScenarioEnemySeed): number {
    return this.scenario.seedEnemy(seed);
  }

  advanceWorldTicks(ticks: number): void {
    if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 10_000) {
      throw new RangeError('Scenario ticks must be an integer from 0 to 10000');
    }
    for (let index = 0; index < ticks; index += 1) {
      if (this.scene.sessionSnapshot().mode !== 'playing') {
        throw new Error('Scenario world ticks require playing mode');
      }
      this.stepOneTick();
    }
  }

  private advanceTicks(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError('advance duration must be finite and non-negative');
    }
    const entryMode = this.scene.sessionSnapshot().mode;
    if (entryMode !== 'playing' && entryMode !== 'countdown' && entryMode !== 'lost') return;
    for (let ticks = this.scheduler.take(ms); ticks > 0; ticks -= 1) {
      this.stepOneTick();
      const mode = this.scene.sessionSnapshot().mode;
      if (mode === 'skillSelection' || mode === 'visibilityPause' || mode === 'won') {
        this.scheduler.reset();
        break;
      }
    }
  }

  private stepOneTick(): void {
    const before = this.scene.playerSnapshot();
    const sessionEvents = this.scene.advanceSimulationStep(FIXED_STEP_MS);
    const after = this.scene.playerSnapshot();
    if (after.x !== before.x || after.y !== before.y) {
      this.appendEvent({ type: 'playerMoved' });
    }
    sessionEvents.forEach((event) => this.appendSessionEvent(event));
    if (this.waveAutoClear) {
      for (const event of sessionEvents) {
        if (event.type === 'enemySpawned') {
          this.scenario.removeEnemyWithoutReward(event.enemyId);
        }
      }
    }
  }

  private appendSessionEvent(event: GameEvent): void {
    switch (event.type) {
      case 'enemySpawnRequested':
        this.appendEvent({ type: event.type, request: event.request });
        return;
      case 'enemySpawned':
        this.appendEvent({ type: event.type, enemyId: event.enemyId });
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
      case 'waveStarted':
        this.appendEvent({ type: event.type, wave: event.wave });
        return;
      case 'waveTransition':
        this.appendEvent({
          type: event.type,
          fromWave: event.fromWave,
          toWave: event.toWave,
          countdownMs: event.countdownMs,
        });
        return;
      case 'skillSelectionOpened':
        this.appendEvent({ type: event.type, cards: event.cards });
        return;
      case 'skillLearned':
        this.appendEvent({
          type: event.type,
          skillId: event.skillId,
          level: event.level,
        });
        return;
      case 'skillCast':
        this.appendEvent({
          type: event.type,
          skillId: event.skillId,
          targetIds: event.targetIds,
        });
        return;
      case 'modeChanged':
        this.appendEvent({ type: event.type, mode: event.mode });
        return;
      case 'runEnded':
      case 'resultReady':
        this.appendEvent({ type: event.type, outcome: event.outcome });
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
  const bridge = new SessionTestBridge(scene, seed);
  const removeOwnedBridge = installOwnedTestBridge(window, bridge);
  return () => {
    bridge.dispose();
    removeOwnedBridge();
  };
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

const OBJECT_IDS = new WeakMap<object, number>();
let nextObjectId = 1;

function objectIdentity(value: object): number {
  const existing = OBJECT_IDS.get(value);
  if (existing !== undefined) return existing;
  const id = nextObjectId;
  nextObjectId += 1;
  OBJECT_IDS.set(value, id);
  return id;
}

function parseSeed(value: string | null): number {
  if (value === null) return 424242;
  const seed = Number(value);
  return Number.isSafeInteger(seed) ? seed : 424242;
}
