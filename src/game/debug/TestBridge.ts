import type { AudioSnapshot } from '../audio/AudioTypes';
import { FIXED_STEP_MS } from '../constants';
import type { DogTraderRigTelemetrySnapshot } from '../enemies/DogTraderRigTelemetry';
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import type { PlayerActionQueueResult } from '../player/PlayerActionGate';
import type { PresentationTelemetrySnapshot } from '../presentation/PresentationTelemetry';
import type { SkillPurchaseResult } from '../progression/ProgressionTypes';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { PlayerActionId, PurchasableSkillId } from '../types/GameTypes';
import type { HudSnapshot } from '../ui/HudSystem';
import { runCleanupSteps } from '../scenes/SceneRuntimeLifecycle';
import type { E2eAudioStressSnapshot } from './E2eAudioStressLoadController';
import type { E2ePresentationStressSnapshot } from './E2ePresentationStressController';
import { ManualStepScheduler } from './ManualStepScheduler';
import { loadScenario, type SessionScenarioRuntime } from './ScenarioFactory';
import type { ScenarioEnemySeed, ScenarioScenePort, ScenarioWaveSchedule } from './ScenarioSessionPort';
import type { GameDebugEvent, GameDebugSnapshot, HuchuTestBridge, TestScenarioId } from './TestContract';

interface SessionScenePort {
  readonly scene: { restart(): void };
  advanceSimulationStep(
    stepMs: number,
    renderHudAfterStep?: boolean,
  ): readonly GameEvent[];
  advanceLogicalBatchForTest(
    stepCount: number,
    input: Readonly<{ x: number; y: number }>,
  ): readonly LogicalBatchEvent[];
  resetSession(seed: number): void;
  resetPlayer(x: number, y: number): void;
  playerSnapshot(): PlayerSnapshot;
  sessionSnapshot(): RunSnapshot;
  currentModeSnapshot(): RunSnapshot['mode'];
  simulationMsSnapshot(): number;
  hudSnapshot(): HudSnapshot;
  presentationTelemetryForTest(): PresentationTelemetrySnapshot;
  renderedVisibleEnemyLabelCount(): number;
  dogTraderRigTelemetry(): DogTraderRigTelemetrySnapshot;
  audioSnapshot(): AudioSnapshot;
  audioStressSnapshot(): E2eAudioStressSnapshot | null;
  presentationStressSnapshot(): E2ePresentationStressSnapshot | null;
  armPresentationStress(): void;
  startAudioStress(): Promise<void>;
  resetAudioStress(): void;
  startPresentationStress(): void;
  setAcceleratedAudio(enabled: boolean): void;
  advanceAudioFromGameMs(gameMs: number): void;
  queueSkillPurchaseForTest(skillId: PurchasableSkillId): SkillPurchaseResult;
  queuePlayerActionForTest(actionId: PlayerActionId): PlayerActionQueueResult;
  scenarioAdapter(): ScenarioScenePort;
  onSessionReset(listener: () => void): () => void;
  setVisibilityForTest(hidden: boolean): void;
  waitForRenderFlush(): Promise<void>;
}

export interface LogicalBatchEvent {
  readonly event: GameEvent;
  readonly atSimulationMs: number;
}

export class SessionTestBridge implements HuchuTestBridge, SessionScenarioRuntime {
  readonly ready: Promise<void>;
  private readonly scheduler = new ManualStepScheduler();
  private readonly eventLog: GameDebugEvent[] = [];
  private nextSequence = 1;
  private waveAutoClear = false;
  private stressMaintenance = false;
  private activeScenario: TestScenarioId = 'empty-run';
  private loadingScenario = false;
  private readonly removeSessionResetListener: () => void;
  private readonly scenario: ScenarioScenePort;

  constructor(private readonly scenePort: SessionScenePort, readonly seed: number) {
    this.scenario = scenePort.scenarioAdapter();
    this.removeSessionResetListener = scenePort.onSessionReset(() => {
      if (this.loadingScenario) return;
      runCleanupSteps([
        () => this.stopScenarioMaintainers(),
        () => this.scenario.resetScenarioPresentation(),
      ]);
    });
    this.ready = scenePort.waitForRenderFlush();
  }

  dispose(): void {
    runCleanupSteps([
      () => this.stopScenarioMaintainers(),
      () => this.removeSessionResetListener(),
    ]);
  }

  async loadScenario(id: TestScenarioId): Promise<void> {
    this.loadingScenario = true;
    this.activeScenario = 'empty-run';
    try {
      await loadScenario(this, id);
      this.activeScenario = id;
      await this.scenePort.waitForRenderFlush();
    } catch (error) {
      this.failCloseScenario();
      throw error;
    } finally {
      this.loadingScenario = false;
    }
  }

  async advance(ms: number): Promise<void> {
    const gameMs = this.advanceTicks(ms);
    this.scenePort.advanceAudioFromGameMs(gameMs);
    await this.scenePort.waitForRenderFlush();
  }

  advanceWithoutFlush(ms: number): void {
    if (!this.stressMaintenance) {
      throw new Error('advanceWithoutFlush is only available for the stress scenario');
    }
    const gameMs = this.advanceTicks(ms);
    this.scenePort.advanceAudioFromGameMs(gameMs);
  }

  async advanceSimulationBatch(
    stepCount: number,
    input: Readonly<{ x: number; y: number }>,
  ): Promise<void> {
    if (this.activeScenario !== 'full-run') {
      throw new Error('advanceSimulationBatch is only available for the full-run scenario');
    }
    const events = this.scenePort.advanceLogicalBatchForTest(stepCount, input);
    events.forEach(({ event, atSimulationMs }) => this.appendSessionEvent(event, atSimulationMs));
    this.scenePort.advanceAudioFromGameMs(stepCount * FIXED_STEP_MS);
  }

  prepareTerminalTieForTest(): void {
    if (this.activeScenario !== 'full-run') {
      throw new Error('prepareTerminalTieForTest is only available for the full-run scenario');
    }
    this.scenario.prepareTerminalTie();
  }

  async purchaseSkill(id: PurchasableSkillId): Promise<SkillPurchaseResult> {
    return this.scenePort.queueSkillPurchaseForTest(id);
  }

  async castAction(id: PlayerActionId): Promise<PlayerActionQueueResult> {
    return this.scenePort.queuePlayerActionForTest(id);
  }

  snapshot(): GameDebugSnapshot {
    const presentation = this.scenePort.presentationTelemetryForTest();
    return {
      run: this.scenePort.sessionSnapshot(),
      player: this.scenePort.playerSnapshot(),
      hud: this.scenePort.hudSnapshot(),
      audio: this.scenePort.audioSnapshot(),
      audioStress: this.stressMaintenance ? this.scenePort.audioStressSnapshot() : null,
      presentationStress: this.scenePort.presentationStressSnapshot(),
      traderRig: this.scenePort.dogTraderRigTelemetry(),
      pools: {
        enemies: presentation.enemies,
        labels: presentation.labels,
        projectiles: presentation.projectiles,
        effects: presentation.effects,
        damageNumbers: presentation.damageNumbers,
      },
      labelBindings: presentation.labelBindings,
      renderedVisibleEnemyLabels: this.scenePort.renderedVisibleEnemyLabelCount(),
      listenerCount: presentation.listenerCount,
    };
  }

  eventsSince(sequence: number): readonly GameDebugEvent[] {
    return this.eventLog.filter((event) => event.sequence > sequence);
  }

  async simulateVisibility(hidden: boolean): Promise<void> {
    this.scenePort.setVisibilityForTest(hidden);
    await this.scenePort.waitForRenderFlush();
  }

  stepSceneOnceForTest(): void {
    const events = this.scenePort.advanceSimulationStep(FIXED_STEP_MS);
    events.forEach((event) => this.appendSessionEvent(event));
    this.scenePort.advanceAudioFromGameMs(FIXED_STEP_MS);
  }

  restartScene(): void {
    this.activeScenario = 'empty-run';
    this.scheduler.reset();
    runCleanupSteps([
      () => this.stopScenarioMaintainers(),
      () => this.scenario.resetScenarioPresentation(),
      () => this.scenePort.scene.restart(),
    ]);
  }

  async setAcceleratedAudio(enabled: boolean): Promise<void> {
    this.scenePort.setAcceleratedAudio(enabled);
  }

  resetManualScheduler(): void { this.scheduler.reset(); }

  stopScenarioMaintainers(): void {
    this.waveAutoClear = false;
    this.stressMaintenance = false;
    this.scenePort.resetAudioStress();
  }

  resetEventLog(): void {
    this.eventLog.length = 0;
    this.nextSequence = 1;
  }

  resetSession(): void { this.scenePort.resetSession(this.seed); }
  resetScenarioPresentation(): void { this.scenario.resetScenarioPresentation(); }
  resetPlayer(x: number, y: number): void { this.scenePort.resetPlayer(x, y); }
  useWaveSchedule(wave: number, schedule: ScenarioWaveSchedule): void { this.scenario.useWaveSchedule(wave, schedule); }
  grantSnacks(amount: number): void { this.scenario.grantSnacks(amount); }
  seedEnemy(seed: ScenarioEnemySeed): number { return this.scenario.seedEnemy(seed); }
  seedProjectile(seed: Parameters<ScenarioScenePort['seedProjectile']>[0]): void {
    this.scenario.seedProjectile(seed);
  }
  enableWaveAutoClear(): void { this.waveAutoClear = true; }
  enablePresentationStress(): void { this.scenePort.startPresentationStress(); }

  async enableStressMaintenance(): Promise<void> {
    this.stressMaintenance = false;
    try {
      this.scenePort.armPresentationStress();
      await this.scenePort.startAudioStress();
    } catch (error) {
      this.failCloseScenario();
      throw error;
    }
    this.stressMaintenance = true;
  }

  resetSimulationClock(): void { this.scenario.resetSimulationClock(); }

  private advanceTicks(ms: number): number {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError('advance duration must be finite and non-negative');
    }
    const entryMode = this.scenePort.currentModeSnapshot();
    if (entryMode === 'visibilityPause' || entryMode === 'won') return 0;
    let advanced = 0;
    for (let ticks = this.scheduler.take(ms); ticks > 0; ticks -= 1) {
      this.stepOneTick();
      advanced += FIXED_STEP_MS;
      const mode = this.scenePort.currentModeSnapshot();
      if (mode === 'visibilityPause' || mode === 'won') {
        this.scheduler.reset();
        break;
      }
    }
    return advanced;
  }

  private stepOneTick(): void {
    const stressStep = this.stressMaintenance;
    try {
      const events = this.scenePort.advanceSimulationStep(
        FIXED_STEP_MS,
        stressStep ? false : undefined,
      );
      events.forEach((event) => this.appendSessionEvent(event));
      if (this.waveAutoClear) {
        for (const event of events) {
          if (event.type === 'enemySpawned') this.scenario.removeEnemyWithoutReward(event.enemyId);
        }
      }
      if (stressStep) {
        this.scenario.maintainStressPools();
      }
    } catch (error) {
      if (stressStep) this.failCloseScenario();
      throw error;
    }
  }

  private failCloseScenario(): void {
    this.activeScenario = 'empty-run';
    this.scheduler.reset();
    try {
      runCleanupSteps([
        () => this.stopScenarioMaintainers(),
        () => this.scenario.resetScenarioPresentation(),
      ]);
    } catch {
      // The scenario producer failure remains authoritative over cleanup failures.
    }
  }

  private appendSessionEvent(event: GameEvent, atSimulationMs = this.scenePort.simulationMsSnapshot()): void {
    this.eventLog.push({
      ...event,
      sequence: this.nextSequence,
      atSimulationMs,
    } as GameDebugEvent);
    this.nextSequence += 1;
  }
}

export function installTestBridge(scene: SessionScenePort): () => void {
  if (import.meta.env.MODE !== 'e2e') return NOOP;
  const params = new URLSearchParams(window.location.search);
  if (params.get('e2e') !== '1' || params.get('clock') !== 'manual') return NOOP;
  const bridge = new SessionTestBridge(scene, parseSeed(params.get('seed')));
  const removeOwnedBridge = installOwnedTestBridge(window, bridge);
  return () => runCleanupSteps([
    () => bridge.dispose(),
    removeOwnedBridge,
  ]);
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
