import type { AudioSnapshot } from '../audio/AudioTypes';
import { FIXED_STEP_MS, WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { MutableMovementIntentPort } from '../player/MovementIntentPort';
import type { PresentationTelemetrySnapshot } from '../presentation/PresentationTelemetry';
import type { SkillPurchaseResult } from '../progression/ProgressionTypes';
import { GameScene } from '../scenes/GameScene';
import type { GameSession } from '../session/GameSession';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { PurchasableSkillId } from '../types/GameTypes';
import { runCleanupSteps } from '../scenes/SceneRuntimeLifecycle';
import { E2eAudioStressLoadController, type E2eAudioStressSnapshot } from './E2eAudioStressLoadController';
import { E2E_AUDIO_TEST_PORT_REGISTRY_KEY, E2eAudioTestPort } from './E2eAudioTestPort';
import { E2eCombatEffectPool } from './E2eCombatEffectPool';
import { E2eGameSession } from './E2eGameSession';
import { E2ePresentationStressController, type E2ePresentationStressSnapshot } from './E2ePresentationStressController';
import type { ScenarioScenePort } from './ScenarioSessionPort';
import { installTestBridge, type LogicalBatchEvent } from './TestBridge';

export class E2eGameScene extends GameScene {
  private readonly mutableMovement = new MutableMovementIntentPort();
  private readonly presentationStressPositions = new Map<number, Readonly<{ x: number; y: number }>>();
  private presentationStress!: E2ePresentationStressController;
  private audioStress!: E2eAudioStressLoadController;
  private disposeTestBridge: () => void = () => {};

  override create(): void {
    super.create();
    if (this.projectileActors === undefined) {
      throw new Error('Projectile actor pool is not initialized');
    }
    this.presentationStress = new E2ePresentationStressController({
      damageNumbers: this.damageFeedbackPoolForAdapters(),
      effects: this.combatEffects as E2eCombatEffectPool,
      projectileLogic: (this.session as E2eGameSession).projectileWorkloadCounters(),
      projectileView: this.projectileActors.workloadCounters(),
    });
    this.audioStress = new E2eAudioStressLoadController(this.audioSystemForAdapters());
    this.disposeTestBridge = installTestBridge(this);
    this.attachRuntimeCleanup(() => runCleanupSteps([
      () => this.presentationStressPositions.clear(),
      () => this.audioStress.destroy(),
      () => {
        const dispose = this.disposeTestBridge;
        this.disposeTestBridge = () => {};
        dispose();
      },
    ]));
  }

  scenarioAdapter(): ScenarioScenePort {
    const session = (this.session as E2eGameSession).scenarioAdapter();
    return {
      seedEnemy: (seed) => {
        const enemyId = session.spawnEnemy(seed);
        if (this.presentationStress.snapshot() !== null && seed.placement.kind === 'worldPoint') {
          this.presentationStressPositions.set(enemyId, {
            x: seed.placement.x,
            y: seed.placement.y,
          });
        }
        const snapshot = this.sessionSnapshot().enemies.find(({ id }) => id === enemyId);
        if (snapshot === undefined) throw new Error(`Seeded enemy ${enemyId} has no snapshot`);
        const actor = this.enemyActors?.acquire(snapshot);
        if (actor === undefined) throw new Error('Enemy actor pool exhausted');
        this.renderEnemies();
        this.renderHud();
        return enemyId;
      },
      suppressWaveSpawns: () => session.suppressWaveSpawns(),
      useWaveSchedule: (wave, schedule) => {
        session.useWaveSchedule(wave, schedule);
        this.renderHud();
        this.renderEnemies();
      },
      grantSnacks: (amount) => {
        session.grantSnacks(amount);
        this.renderHud();
      },
      seedProjectile: (seed) => {
        session.spawnProjectile(seed);
        this.renderProjectiles();
      },
      maintainStressPools: () => {
        try {
          const projectileRefillAccepted = session.maintainStressProjectiles();
          this.presentationStress.step(FIXED_STEP_MS, projectileRefillAccepted);
          this.audioStress.observe();
        } catch (error) {
          try {
            this.resetStressRuntime();
          } catch {
            // The workload producer failure remains authoritative over cleanup.
          }
          throw error;
        }
      },
      prepareTerminalTie: () => {
        session.prepareTerminalTie();
        this.renderEnemies();
        this.renderProjectiles();
        this.renderHud();
      },
      resetScenarioPresentation: () => {
        this.presentationStress.reset();
        this.presentationStressPositions.clear();
      },
      resetSimulationClock: () => session.resetSimulationClock(),
      projectilePoolTelemetry: () => session.projectilePoolTelemetry(),
      removeEnemyWithoutReward: (enemyId) => {
        session.removeEnemyWithoutReward(enemyId);
        this.presentationStressPositions.delete(enemyId);
        this.enemyActors?.release(enemyId);
        this.renderEnemies();
        this.renderHud();
      },
      sessionIdentity: () => this.session,
    };
  }

  advanceLogicalBatchForTest(
    stepCount: number,
    input: Readonly<{ x: number; y: number }>,
  ): readonly LogicalBatchEvent[] {
    if (!Number.isSafeInteger(stepCount) || stepCount < 1 || stepCount > 60) {
      throw new RangeError('Logical batch stepCount must be an integer from 1 to 60');
    }
    const events: LogicalBatchEvent[] = [];
    this.mutableMovement.write(input);
    try {
      for (let index = 0; index < stepCount; index += 1) {
        const stepEvents = this.stepLogicalWorld(FIXED_STEP_MS, this.mutableMovement.read());
        const atSimulationMs = this.simulationMsSnapshot();
        stepEvents.forEach((event) => events.push({ event, atSimulationMs }));
      }
      return events;
    } finally {
      this.mutableMovement.reset();
    }
  }

  audioSnapshot(): AudioSnapshot {
    return this.audioSystemForAdapters().snapshot();
  }

  audioStressSnapshot(): E2eAudioStressSnapshot | null {
    const snapshot = this.audioStress.snapshot();
    return snapshot.generation === 0 ? null : snapshot;
  }

  async startAudioStress(): Promise<void> {
    await this.audioStress.primeAtDownbeat();
  }

  resetAudioStress(): void {
    this.audioStress.reset();
  }

  startPresentationStress(): void {
    this.presentationStressPositions.clear();
    try {
      this.presentationStress.start();
    } catch (error) {
      try {
        this.resetStressRuntime();
      } catch {
        // The presentation start failure remains authoritative over cleanup.
      }
      throw error;
    }
  }

  armPresentationStress(): void {
    this.presentationStress.arm();
  }

  presentationStressSnapshot(): E2ePresentationStressSnapshot | null {
    return this.presentationStress.snapshot();
  }

  setAcceleratedAudio(enabled: boolean): void {
    this.audioTestPort().setAccelerated(enabled);
  }

  advanceAudioFromGameMs(gameMs: number): void {
    this.audioTestPort().advanceFromGameMs(gameMs);
  }

  private resetStressRuntime(): void {
    runCleanupSteps([
      () => this.audioStress.reset(),
      () => this.presentationStress.reset(),
      () => this.presentationStressPositions.clear(),
    ]);
  }

  presentationTelemetryForTest(): PresentationTelemetrySnapshot {
    return this.presentationTelemetrySnapshot();
  }

  renderedVisibleEnemyLabelCount(): number {
    if (this.enemyActors === undefined) throw new Error('Enemy actor pool is not initialized');
    return this.enemyActors.renderedVisibleLabelCount(this.cameras.main, {
      left: 0,
      right: WORLD_WIDTH,
      top: 0,
      bottom: WORLD_HEIGHT,
    });
  }

  queueSkillPurchaseForTest(skillId: PurchasableSkillId): SkillPurchaseResult {
    return this.session.queueSkillPurchase(skillId);
  }

  protected override createSession(seed: number): GameSession {
    return E2eGameSession.create({ seed }, this.sessionDependencies());
  }

  protected override createCombatEffectPool(): E2eCombatEffectPool {
    return new E2eCombatEffectPool(this);
  }

  protected override renderEnemies(
    renderDeltaMs = 0,
    snapshot: RunSnapshot = this.session.snapshot(),
  ): void {
    const snapshots = snapshot.enemies.map((enemySnapshot) => {
      const position = this.presentationStressPositions.get(enemySnapshot.id);
      return position === undefined ? enemySnapshot : { ...enemySnapshot, position: { ...position } };
    });
    this.enemyActors?.render(snapshots, renderDeltaMs);
  }

  protected override renderProjectiles(snapshot: RunSnapshot = this.session.snapshot()): void {
    super.renderProjectiles(snapshot);
    this.presentationStress?.observeProjectileRender();
  }

  private audioTestPort(): E2eAudioTestPort {
    const port = this.registry.get(E2E_AUDIO_TEST_PORT_REGISTRY_KEY) as E2eAudioTestPort | undefined;
    if (port === undefined) throw new Error('E2E audio test port is not installed');
    return port;
  }
}
