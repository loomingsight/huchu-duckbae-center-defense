import Phaser from 'phaser';
import { GAME_AUDIO_REGISTRY_KEY } from '../audio/AudioRegistry';
import type { AudioSystem } from '../audio/AudioSystem';
import {
  FIXED_STEP_MS,
  TIME_EPSILON_MS,
} from '../constants';
import { FixedStepClock } from '../core/FixedStepClock';
import type { GameMode } from '../core/GameMode';
import {
  ProjectileActorPool,
  type ProjectileImpactSnapshot,
} from '../combat/ProjectileActorPool';
import {
  CombatEffectPool,
  selectHuchuBodyAction,
} from '../combat/CombatEffectPool';
import { DamageFeedbackPool } from '../combat/DamageFeedbackPool';
import { ImpactFeedbackSystem } from '../combat/ImpactFeedbackSystem';
import { CompanionView } from '../companions/CompanionView';
import {
  dogTraderAttackOrigin,
} from '../enemies/DogTraderAttackGeometry';
import { DogTraderRig } from '../enemies/DogTraderRig';
import {
  DogTraderRigTelemetry,
  type DogTraderRigTelemetrySnapshot,
} from '../enemies/DogTraderRigTelemetry';
import { EnemyActorPool } from '../enemies/EnemyActorPool';
import { PhaserDogTraderParts } from '../enemies/PhaserDogTraderParts';
import type { GameEvent } from '../events/GameEvents';
import { WorldPauseController } from '../lifecycle/WorldPauseController';
import { LifecyclePauseCoordinator } from '../lifecycle/LifecyclePauseCoordinator';
import { VisibilityController } from '../lifecycle/VisibilityController';
import { WebGlRecoveryController } from '../lifecycle/WebGlRecoveryController';
import type { MovementIntent } from '../player/InputVector';
import { KeyboardInput } from '../player/KeyboardInput';
import {
  KeyboardJoystickMovementIntentPort,
  type MovementIntentPort,
} from '../player/MovementIntentPort';
import { PlayerController } from '../player/PlayerController';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import { PlayerView } from '../player/PlayerView';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import {
  PresentationTelemetry,
  type PresentationTelemetrySnapshot,
} from '../presentation/PresentationTelemetry';
import { VirtualJoystick } from '../player/VirtualJoystick';
import {
  GameSession,
  type GameSessionDependencies,
} from '../session/GameSession';
import type { RunSnapshot } from '../session/RunSnapshot';
import { ShelterView } from '../shelter/ShelterView';
import { shelterVisualState } from '../shelter/ShelterSystem';
import {
  CountdownOverlay,
  type CountdownKind,
} from '../ui/CountdownOverlay';
import { HudSystem, type HudSnapshot } from '../ui/HudSystem';
import type { MutePort } from '../ui/MutePort';
import { RuntimeErrorOverlay } from '../ui/RuntimeErrorOverlay';
import type { Point } from '../world/Geometry';
import { MapView } from '../world/MapView';
import { runCleanupSteps, SceneRuntimeLifecycle } from './SceneRuntimeLifecycle';

const INITIAL_PLAYER_POSITION = { x: 270, y: 650 } as const;
const DEFAULT_RUN_SEED = 424242;
const MAX_CATCH_UP_STEPS = 5;
const BARK_CADENCE_MS = 800;
const DEFAULT_PLAYER_FACING = { x: 0, y: -1 } as const;
const TAIL_BODY_DURATION_MS = 500;
const AQUA_BODY_DURATION_MS = 600;
const SNACK_DOCK_TARGET = { x: 34, y: 900 } as const;

export class GameScene extends Phaser.Scene {
  private readonly fixedClock = new FixedStepClock(FIXED_STEP_MS, MAX_CATCH_UP_STEPS);
  private readonly runtimeLifecycle = new SceneRuntimeLifecycle();
  private readonly dogTraderTelemetry = new DogTraderRigTelemetry();
  private audio!: AudioSystem;
  protected session!: GameSession;
  private playerController!: PlayerController;
  private playerView!: PlayerView;
  private companionView!: CompanionView;
  private keyboardInput!: KeyboardInput;
  private virtualJoystick!: VirtualJoystick;
  private movementIntent!: MovementIntentPort;
  private countdownOverlay!: CountdownOverlay;
  protected hud!: HudSystem;
  protected combatEffects!: CombatEffectPool;
  protected damageFeedbackPool!: DamageFeedbackPool;
  private impactFeedback!: ImpactFeedbackSystem;
  private presentationTelemetry!: PresentationTelemetry;
  private worldPauseController!: WorldPauseController;
  private lifecyclePauseCoordinator!: LifecyclePauseCoordinator;
  private visibilityController!: VisibilityController;
  private webGlRecoveryController!: WebGlRecoveryController;
  private resumeOverlay!: RuntimeErrorOverlay;
  private restoreOverlay!: RuntimeErrorOverlay;
  protected enemyActors: EnemyActorPool | undefined;
  protected projectileActors: ProjectileActorPool | undefined;
  protected shelterView: ShelterView | undefined;
  private manualClock = false;
  private worldAnimationMs = 0;
  private moving = false;
  private lastMovementFacing: Point = { ...DEFAULT_PLAYER_FACING };
  private barkAnimationElapsedMs: number | undefined;
  private playerBodyAction: {
    readonly kind: 'tailSwipe' | 'aquaBeam';
    readonly castId: string;
    elapsedMs: number;
    readonly durationMs: number;
  } | undefined;
  private worldPaused = false;
  private audioLifecyclePaused = false;
  private reducedMotion = false;
  private runtimeGeneration = 0;
  private readonly sessionResetListeners = new Set<() => void>();

  constructor() {
    super('Game');
  }

  create(): void {
    const generation = this.runtimeLifecycle.begin();
    this.runtimeGeneration = generation;
    const root = document.querySelector<HTMLElement>('#game-root');
    if (root === null) throw new Error('#game-root is required');
    root.setAttribute('data-scene', 'Game');
    root.setAttribute('data-renderer', this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'other');
    if (this.game.domContainer !== null) this.game.domContainer.style.zIndex = '1';
    this.game.canvas.style.position = 'relative';
    this.game.canvas.style.zIndex = '0';

    this.fixedClock.reset();
    this.audio = this.registry.get(GAME_AUDIO_REGISTRY_KEY) as AudioSystem;
    this.session = this.createSession(DEFAULT_RUN_SEED);
    this.manualClock = isE2eManualClock();
    this.worldAnimationMs = 0;
    this.moving = false;
    this.lastMovementFacing = { ...DEFAULT_PLAYER_FACING };
    this.barkAnimationElapsedMs = undefined;
    this.playerBodyAction = undefined;
    this.worldPaused = false;
    this.audioLifecyclePaused = false;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.dogTraderTelemetry.reset();
    this.enemyActors = new EnemyActorPool(this, {
      compositeRigFactory: (scene) => new DogTraderRig(
        new PhaserDogTraderParts(scene),
        this.dogTraderTelemetry,
      ),
    });
    this.worldPauseController = new WorldPauseController(
      this.session.modeStateForControllers(),
      { setPaused: (paused) => this.setWorldPaused(paused) },
    );

    new MapView(this);
    this.shelterView = new ShelterView(this);
    this.combatEffects = this.createCombatEffectPool();
    this.damageFeedbackPool = new DamageFeedbackPool(this);
    this.projectileActors = new ProjectileActorPool(this, this.combatEffects);
    this.impactFeedback = new ImpactFeedbackSystem({
      enemyTarget: (targetId) => this.enemyActors?.feedbackTarget(targetId),
      enemyDamageAnchor: (targetId) => this.enemyActors?.damageAnchor(targetId),
      shelterTarget: this.shelterView,
      damageNumbers: this.damageFeedbackPool,
      camera: { shake: (durationMs, intensity) => this.cameras.main.shake(durationMs, intensity) },
      reducedMotion: () => this.reducedMotion,
      removeLethalTarget: (targetId) => { this.enemyActors?.beginDeath(targetId, true); },
    });
    this.presentationTelemetry = new PresentationTelemetry({
      enemies: this.enemyActors,
      projectiles: this.projectileActors,
      effects: this.combatEffects,
      damageNumbers: this.damageFeedbackPool,
      listenerCount: () => this.sessionResetListeners.size,
    });
    this.countdownOverlay = new CountdownOverlay(this);
    const mutePort: MutePort = {
      muted: () => this.audio.muted(),
      toggle: () => this.audio.setMuted(!this.audio.muted()),
      subscribe: (listener) => this.audio.subscribeMute(listener),
    };
    this.hud = new HudSystem({
      root,
      queueSkillPurchase: (skillId) => this.session.queueSkillPurchase(skillId),
      mutePort,
    });
    this.playerController = new PlayerController({ ...INITIAL_PLAYER_POSITION });
    this.playerView = new PlayerView(
      this,
      this.playerController.snapshot(),
      this.combatEffects,
    );
    this.companionView = new CompanionView(this, {
      player: this.playerController.snapshot(),
      facing: this.lastMovementFacing,
    });
    this.keyboardInput = new KeyboardInput(this);
    this.virtualJoystick = this.hud.joystick;
    this.movementIntent = this.createMovementIntentPort();
    const setCanvasInputEnabled = (enabled: boolean): void => {
      this.virtualJoystick.setEnabled(enabled);
      this.game.canvas.style.pointerEvents = enabled ? '' : 'none';
    };
    this.lifecyclePauseCoordinator = new LifecyclePauseCoordinator(
      this.session,
      {
        setWorldPaused: (paused) => this.setWorldPaused(paused),
        setCanvasInputEnabled,
        setAudioLifecyclePaused: (paused) => {
          this.audioLifecyclePaused = paused;
          void (paused ? this.audio.pauseForLifecycle() : this.audio.resumeForLifecycle());
        },
      },
    );
    this.resumeOverlay = new RuntimeErrorOverlay(this, 2500);
    this.restoreOverlay = new RuntimeErrorOverlay(this, 2510);
    this.webGlRecoveryController = new WebGlRecoveryController(
      this.game.canvas,
      this.session,
      {
        setWorldPaused: (paused) => this.setWorldPaused(paused),
        setCanvasInputEnabled,
        setContextLostVisible: (visible) => {
          if (visible) {
            this.restoreOverlay.show('화면을 다시 준비하고 있어요');
          } else {
            this.restoreOverlay.hide();
          }
        },
        setRestorePromptVisible: (visible) => {
          if (visible) {
            const recoveryGeneration = this.webGlRecoveryController.confirmationGeneration;
            this.restoreOverlay.show(
              '화면을 다시 준비했어요',
              '버튼을 눌러 현재 상태부터 계속해 주세요',
              {
                label: '다시 그리기',
                onSelect: () => this.webGlRecoveryController.confirmRestore(recoveryGeneration),
              },
            );
          } else {
            this.restoreOverlay.hide();
          }
        },
        resyncView: () => this.resyncViewFromSnapshot(),
      },
      this.lifecyclePauseCoordinator,
      this.webGlContextAvailable(),
    );
    this.visibilityController = new VisibilityController(
      this.session,
      {
        setWorldPaused: (paused) => this.setWorldPaused(paused),
        setResumePromptVisible: (visible) => {
          if (visible) {
            this.resumeOverlay.show(
              '게임이 잠시 멈췄어요',
              '버튼을 눌러 숨기기 전 상태부터 계속해 주세요',
              {
                label: '계속하기',
                onSelect: () => {
                  this.snapCompanionPose();
                  this.enemyActors?.snapCompositePoses();
                  this.visibilityController.confirmResume();
                },
              },
            );
          } else {
            this.resumeOverlay.hide();
          }
        },
      },
      () => this.webGlRecoveryController.contextAvailable,
      this.lifecyclePauseCoordinator,
    );
    this.webGlRecoveryController.attach();
    this.webGlRecoveryController.beginSession();
    this.renderPlayer();
    this.renderCompanion(0);
    this.renderEnemies();
    this.renderProjectiles();
    this.renderHud();

    const onVisibilityChange = (): void => this.setVisibilityForTest(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.runtimeLifecycle.attach(generation, () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    });
    this.runtimeLifecycle.attach(generation, () => {
      this.cleanupRuntimeControllers();
    });
    if (document.hidden) onVisibilityChange();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownRuntime(generation));

  }

  update(_time: number, delta: number): void {
    if (!this.manualClock) {
      this.fixedClock.consume(delta).forEach((stepMs) => this.advanceSimulationStep(stepMs, false));
    }
    const snapshot = this.session.snapshot();
    const renderDeltaMs = this.worldPaused ? 0 : delta;
    this.renderPlayer();
    this.renderCompanion(renderDeltaMs, snapshot);
    this.renderEnemies(renderDeltaMs, snapshot);
    this.renderProjectiles(snapshot);
    this.impactFeedback.render();
    this.renderHud(snapshot);
  }

  advanceSimulationStep(stepMs: number, renderHudAfterStep = true): readonly GameEvent[] {
    if (!Number.isFinite(stepMs) || Math.abs(stepMs - FIXED_STEP_MS) > TIME_EPSILON_MS) {
      throw new RangeError('GameScene requires one fixed step');
    }
    const entryMode = this.session.currentMode();
    const canStepWorld = this.session.modeStateForControllers().canStepWorld();
    const intent = this.movementIntent.read();
    if (!canStepWorld) {
      const events = this.stepLogicalWorld(stepMs, intent);
      this.hud.step(stepMs);
      if (entryMode === 'lost') this.shelterView?.stepFailedHold(stepMs);
      this.applySessionEvents(events);
      if (renderHudAfterStep) this.renderHud();
      return events;
    }
    this.moving = intent.magnitude > 0;
    if (this.moving) {
      const length = Math.hypot(intent.x, intent.y);
      if (length > 0) {
        this.lastMovementFacing = { x: intent.x / length, y: intent.y / length };
      }
    }
    this.worldAnimationMs += stepMs;
    this.advanceCombatVisuals(stepMs);
    const events = this.stepLogicalWorld(stepMs, intent);
    this.applySessionEvents(events);
    if (renderHudAfterStep) this.renderHud();
    return events;
  }

  protected stepLogicalWorld(stepMs: number, intent: MovementIntent): readonly GameEvent[] {
    if (!Number.isFinite(stepMs) || Math.abs(stepMs - FIXED_STEP_MS) > TIME_EPSILON_MS) {
      throw new RangeError('GameScene requires one fixed step');
    }
    if (this.session.modeStateForControllers().canStepWorld()) {
      this.playerController.step(stepMs, intent);
    }
    return this.session.step(stepMs, this.playerController.snapshot());
  }

  resetSession(seed: number): void {
    for (const listener of [...this.sessionResetListeners]) listener();
    this.presentationTelemetry.reset();
    this.dogTraderTelemetry.reset();
    this.impactFeedback.resetDedupe();
    this.shelterView?.reset();
    this.visibilityController.reset();
    this.webGlRecoveryController.reset();
    this.lifecyclePauseCoordinator.reset();
    this.session.reset(seed);
    this.worldPauseController.reset();
    this.webGlRecoveryController.beginSession();
    this.fixedClock.reset();
    this.movementIntent.reset();
    this.worldAnimationMs = 0;
    this.moving = false;
    this.lastMovementFacing = { ...DEFAULT_PLAYER_FACING };
    this.barkAnimationElapsedMs = undefined;
    this.playerBodyAction = undefined;
    this.countdownOverlay.reset();
    this.hud.reset();
    this.resetCompanion();
    this.renderHud();
    this.renderPlayer();
    this.renderCompanion(0);
    this.renderEnemies();
    this.renderProjectiles();
  }

  restartRunFromResult(): void {
    this.audio.beginRun();
    this.hud.setActive(true);
    this.resetSession(DEFAULT_RUN_SEED);
    this.resetPlayer(INITIAL_PLAYER_POSITION.x, INITIAL_PLAYER_POSITION.y);
    if (document.hidden) this.setVisibilityForTest(true);
    document.querySelector('#game-root')?.setAttribute('data-scene', 'Game');
    this.scene.stop('Result');
    this.scene.resume();
  }

  resetPlayer(x: number, y: number): void {
    this.playerController = new PlayerController({ x, y });
    this.worldAnimationMs = 0;
    this.moving = false;
    this.lastMovementFacing = { ...DEFAULT_PLAYER_FACING };
    this.resetCompanion();
    this.renderPlayer();
    this.renderCompanion(0);
  }

  playerSnapshot(): PlayerSnapshot {
    return this.playerController.snapshot();
  }

  sessionSnapshot(): RunSnapshot {
    return this.session.snapshot();
  }

  currentModeSnapshot(): GameMode {
    return this.session.currentMode();
  }

  simulationMsSnapshot(): number {
    return this.session.simulationTimeMs();
  }

  enemyActorPoolSnapshot(): PoolSnapshot {
    if (this.enemyActors === undefined) throw new Error('Enemy actor pool is not initialized');
    return this.enemyActors.snapshot();
  }

  projectileActorPoolSnapshot(): PoolSnapshot {
    if (this.projectileActors === undefined) throw new Error('Projectile actor pool is not initialized');
    return this.projectileActors.snapshot();
  }

  projectileImpactSnapshots(): readonly ProjectileImpactSnapshot[] {
    if (this.projectileActors === undefined) throw new Error('Projectile actor pool is not initialized');
    return this.projectileActors.impactSnapshots();
  }

  shelterShakeOffsetSnapshot(): number {
    if (this.shelterView === undefined) throw new Error('Shelter view is not initialized');
    return this.shelterView.shakeOffsetSnapshot();
  }

  combatEffectsSnapshot(): PoolSnapshot {
    return this.combatEffects.snapshot();
  }

  combatEffectPoolSnapshot(): PoolSnapshot {
    return this.combatEffects.snapshot();
  }

  presentationTelemetrySnapshot(): PresentationTelemetrySnapshot {
    return this.presentationTelemetry.snapshot();
  }

  dogTraderRigTelemetry(): DogTraderRigTelemetrySnapshot {
    return this.dogTraderTelemetry.snapshot();
  }

  hudSnapshot(): HudSnapshot {
    return this.hud.snapshot();
  }

  skillCardsSnapshot(): readonly never[] {
    return [];
  }

  skillCooldownProgressSnapshot(): Readonly<Record<string, number>> {
    const snapshot = this.session.snapshot().skillStates;
    return {
      tailSwipe: snapshot.tailSwipe.progress,
      aquaBeam: snapshot.aquaBeam.progress,
      safetyReport: snapshot.safetyReport.progress,
    };
  }

  countdownSnapshot(): {
    readonly kind: CountdownKind | null;
    readonly remainingMs: number;
  } {
    return this.session.countdownState();
  }

  worldClocksSnapshot(): {
    readonly worldPaused: boolean;
    readonly worldAnimationMs: number;
    readonly barkAnimationElapsedMs: number | null;
    readonly barkEffectAgesMs: readonly number[];
    readonly projectileEffectAgesMs: readonly number[];
    readonly skillEffectAgesMs: readonly number[];
    readonly shelterEffectAgeMs: number | null;
    readonly offLeashEffectAgeMs: number | null;
  } {
    return {
      worldPaused: this.worldPaused,
      worldAnimationMs: this.worldAnimationMs,
      barkAnimationElapsedMs: this.barkAnimationElapsedMs ?? null,
      barkEffectAgesMs: this.playerView.effectAgesSnapshot(),
      projectileEffectAgesMs: this.projectileActors?.impactAgesSnapshot() ?? [],
      skillEffectAgesMs: [
        ...this.combatEffects.effectAges('tailArc'),
        ...this.combatEffects.effectAges('tailDust'),
        ...this.combatEffects.effectAges('aquaBeam'),
        ...this.combatEffects.effectAges('aquaSplash'),
        ...this.combatEffects.effectAges('safetyNotice'),
        ...this.combatEffects.effectAges('safetyStamp'),
      ],
      shelterEffectAgeMs: this.shelterView?.shakeElapsedSnapshot() ?? null,
      offLeashEffectAgeMs: this.combatEffects.effectAges('doorPush')[0] ?? null,
    };
  }

  onSessionReset(listener: () => void): () => void {
    this.sessionResetListeners.add(listener);
    return () => this.sessionResetListeners.delete(listener);
  }

  protected attachRuntimeCleanup(dispose: () => void): void {
    this.runtimeLifecycle.attach(this.runtimeGeneration, dispose);
  }

  private cleanupRuntimeControllers(): void {
    runCleanupSteps([
      () => this.webGlRecoveryController.detach(),
      () => this.visibilityController.reset(),
      () => this.webGlRecoveryController.reset(),
      () => this.lifecyclePauseCoordinator.reset(),
    ]);
  }

  setVisibilityForTest(hidden: boolean): void {
    if (hidden) this.visibilityController.hidden();
    else {
      this.snapCompanionPose();
      this.enemyActors?.snapCompositePoses();
      this.visibilityController.visible();
    }
  }

  waitForRenderFlush(): Promise<void> {
    return new Promise((resolve) => {
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve());
    });
  }

  private renderPlayer(): void {
    this.playerView.render({
      ...this.playerController.snapshot(),
      worldAnimationMs: this.worldAnimationMs,
      moving: this.moving,
      barkElapsedMs: this.barkAnimationElapsedMs,
      bodyAction: this.playerBodyAction === undefined ? undefined : {
        kind: this.playerBodyAction.kind,
        elapsedMs: this.playerBodyAction.elapsedMs,
      },
    });
  }

  private renderCompanion(
    renderDeltaMs: number,
    snapshot: RunSnapshot = this.session.snapshot(),
  ): void {
    this.companionView.render({
      companion: snapshot.companion,
      player: this.playerController.snapshot(),
      facing: this.lastMovementFacing,
      moving: this.moving,
      worldAnimationMs: this.worldAnimationMs,
      renderDeltaMs,
      reducedMotion: this.reducedMotion,
    });
  }

  private snapCompanionPose(): void {
    this.companionView.snapPose({
      player: this.playerController.snapshot(),
      facing: this.lastMovementFacing,
    });
  }

  private resetCompanion(): void {
    this.companionView.reset({
      player: this.playerController.snapshot(),
      facing: this.lastMovementFacing,
    });
  }

  protected renderEnemies(
    renderDeltaMs = 0,
    snapshot: RunSnapshot = this.session.snapshot(),
  ): void {
    this.enemyActors?.render(snapshot.enemies, renderDeltaMs);
  }

  protected renderProjectiles(snapshot: RunSnapshot = this.session.snapshot()): void {
    this.projectileActors?.render(snapshot.projectiles);
  }

  protected applySessionEvents(events: readonly GameEvent[]): void {
    this.applyPlayerBodyAction(selectHuchuBodyAction(events), events);
    events.forEach((event) => {
      this.audio.handle(event);
      if (event.type === 'modeChanged') {
        this.worldPauseController.sync();
        if (event.mode === 'playing') {
          this.countdownOverlay.reset();
        } else if (event.mode === 'countdown') {
          this.renderCountdown();
        } else if (event.mode === 'lost') {
          this.shelterView?.showFailedHold();
        }
      }
      if (event.type === 'skillPurchaseResolved') {
        this.hud.showLearned(event.result.skillId, this.session.snapshot());
      }
      if (event.type === 'enemySpawned') {
        const snapshot = this.session.snapshot().enemies.find(({ id }) => id === event.enemyId);
        if (snapshot === undefined) throw new Error(`Spawned enemy ${event.enemyId} has no snapshot`);
        const actor = this.enemyActors?.acquire(snapshot);
        if (actor === undefined) throw new Error('Enemy actor pool exhausted');
      }
      if (event.type === 'companionAttackStarted') {
        this.companionView.startAttack(event.castId);
      }
      if (event.type === 'companionAttack') {
        this.companionView.syncAttackImpact(event.castId);
      }
      if (event.type === 'barkImpact') {
        const aimTarget = {
          x: event.origin.x + event.direction.x * 100,
          y: event.origin.y + event.direction.y * 100,
        };
        const origin = this.playerView.attackOrigin(event.origin, aimTarget);
        const target = {
          x: origin.x + event.direction.x * 100,
          y: origin.y + event.direction.y * 100,
        };
        this.playerView.showBarkWave(origin, target);
      }
      if (event.type === 'skillCastStarted') {
        if (event.skillId === 'aquaBeam' && event.targets[0] !== undefined) {
          const target = event.targets[0];
          const origin = this.playerView.attackOrigin(event.origin, target.position);
          this.combatEffects.startAquaBeam(event.castId, origin, target);
        } else if (event.skillId === 'safetyReport') {
          this.combatEffects.startSafetyReport(event.castId, event.origin, event.targets);
        }
      }
      if (event.type === 'skillTargetChanged') {
        this.combatEffects.retargetAquaBeam(event.castId, {
          targetId: event.targetId,
          position: event.targetPosition,
        });
      }
      if (event.type === 'skillImpact') {
        if (event.skillId === 'tailSwipe') {
          this.combatEffects.showTailImpact(event.castId, event.origin);
        } else if (event.skillId === 'aquaBeam') {
          this.combatEffects.showAquaImpact(event.castId, event.targets);
        } else {
          this.combatEffects.showSafetyImpact(event.castId, event.targets);
        }
      }
      if (event.type === 'damageApplied') {
        this.impactFeedback.handle(event);
        if (event.lethal && event.effectiveAmount > 0) {
          this.combatEffects.showSnackFly(
            `reward:${event.castId}:${event.targetId}`,
            event.position,
            SNACK_DOCK_TARGET,
          );
        }
      }
      if (event.type === 'attackStarted' && event.kind === 'illegalBreeder') {
        const position = this.session.snapshot().enemies
          .find(({ id }) => id === event.enemyId)?.position;
        if (position !== undefined) this.combatEffects.showBreederWarning(event.castId, position);
      }
      if (event.type === 'shelterDamageRequested') {
        this.showOffLeashAttack(event);
      }
      if (event.type === 'projectileRequested' && event.projectileKind === 'electric') {
        this.combatEffects.showElectricWave(event.castId, event.from);
      }
      if (event.type === 'projectileHit') {
        this.projectileActors?.showHit(event.projectileId, event.projectileKind, event.position);
        if (event.projectileKind === 'electric') {
          this.combatEffects.showElectricWave(event.castId, event.position);
        }
      }
      if (event.type === 'shelterDamaged') {
        this.shelterView?.render(event.visual, event.hp, event.maxHp);
        this.impactFeedback.handle(event);
      }
      if (event.type === 'enemyDied') this.enemyActors?.release(event.enemyId);
      if (event.type === 'waveCountdownChanged') this.renderCountdown();
      if (event.type === 'resultReady') this.showResult(event.outcome);
    });
  }

  private showResult(outcome: 'won' | 'lost'): void {
    if (this.scene.isActive('Result')) return;
    this.hud.setActive(false);
    this.scene.launch('Result', { outcome });
    this.scene.pause();
  }

  private renderCountdown(): void {
    const countdown = this.session.countdownState();
    this.countdownOverlay.render(
      countdown.remainingMs,
      countdown.kind ?? 'resumeCombat',
    );
  }

  private shutdownRuntime(generation: number): void {
    // Phaser's DisplayList owns GameObject destruction and runs its SHUTDOWN listener first.
    // This later scene cleanup must only release non-GameObject state and stale references.
    if (!this.runtimeLifecycle.isActive(generation)) return;
    const releaseAudioLifecycle = this.audioLifecyclePaused && !document.hidden;
    this.audioLifecyclePaused = false;
    runCleanupSteps([
      () => this.runtimeLifecycle.end(generation),
      () => {
        if (releaseAudioLifecycle) void this.audio.resumeForLifecycle();
      },
      () => this.sessionResetListeners.clear(),
      () => this.hud.destroy(),
      () => this.dogTraderTelemetry.reset(),
      () => this.impactFeedback.resetDedupe(),
      () => { this.enemyActors = undefined; },
      () => { this.projectileActors = undefined; },
      () => { this.shelterView = undefined; },
      () => this.keyboardInput.destroy(),
      () => this.movementIntent.reset(),
    ]);
  }

  private showOffLeashAttack(event: Extract<GameEvent, { type: 'shelterDamageRequested' }>): void {
    const enemy = this.session.snapshot().enemies.find(({ id }) => id === event.sourceEnemyId);
    if (enemy?.kind !== 'offLeashGuardian') return;
    this.combatEffects.showDoorPush(event.castId, enemy.position, event.position);
  }

  private advanceCombatVisuals(stepMs: number): void {
    this.companionView.stepSimulation(stepMs);
    this.combatEffects.step(stepMs);
    this.impactFeedback.step(stepMs);
    this.enemyActors?.step(stepMs);
    this.stepPlayerBodyAction(stepMs);
    this.hud.step(stepMs);
    this.shelterView?.stepSimulation(stepMs);
    if (this.barkAnimationElapsedMs === undefined) return;
    const nextElapsedMs = this.barkAnimationElapsedMs + stepMs;
    this.barkAnimationElapsedMs = nextElapsedMs + TIME_EPSILON_MS >= BARK_CADENCE_MS
      ? undefined
      : nextElapsedMs;
  }

  protected damageFeedbackPoolForAdapters(): DamageFeedbackPool {
    return this.damageFeedbackPool;
  }

  protected audioSystemForAdapters(): AudioSystem {
    return this.audio;
  }

  protected renderHud(snapshot: RunSnapshot = this.session.snapshot()): void {
    this.hud.render(snapshot);
  }

  private resyncViewFromSnapshot(): void {
    const snapshot = this.session.snapshot();
    this.snapCompanionPose();
    this.enemyActors?.snapCompositePoses();
    this.renderPlayer();
    this.renderCompanion(0);
    this.renderEnemies();
    this.renderProjectiles();
    this.shelterView?.render(
      shelterVisualState(snapshot.shelterHp, snapshot.shelterMaxHp),
      snapshot.shelterHp,
      snapshot.shelterMaxHp,
    );
    this.renderHud();
    if (snapshot.mode === 'countdown') this.renderCountdown();
  }

  private setWorldPaused(paused: boolean): void {
    this.worldPaused = paused;
    if (paused) this.physics?.world?.pause();
    else this.physics?.world?.resume();
  }

  private webGlContextAvailable(): boolean {
    if (this.game.renderer.type !== Phaser.WEBGL) return true;
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    return !renderer.gl.isContextLost();
  }

  protected sessionDependencies(): GameSessionDependencies {
    return { projectileOriginByKind: { dogTrader: dogTraderAttackOrigin } };
  }

  protected createSession(seed: number): GameSession {
    return GameSession.create({ seed }, this.sessionDependencies());
  }

  protected createMovementIntentPort(): MovementIntentPort {
    return new KeyboardJoystickMovementIntentPort(this.keyboardInput, this.virtualJoystick);
  }

  protected createCombatEffectPool(): CombatEffectPool {
    return new CombatEffectPool(this);
  }

  private applyPlayerBodyAction(
    selected: ReturnType<typeof selectHuchuBodyAction>,
    events: readonly GameEvent[],
  ): void {
    if (selected === 'bark') {
      if (events.some(({ type }) => type === 'barkStarted')) this.barkAnimationElapsedMs = 0;
      return;
    }
    if (selected === undefined) return;
    const started = events.find((event) => (
      event.type === 'skillCastStarted' && event.skillId === selected
    ));
    if (started === undefined || started.type !== 'skillCastStarted') return;
    if (this.playerBodyAction?.castId === started.castId) return;
    this.barkAnimationElapsedMs = undefined;
    this.playerBodyAction = {
      kind: selected,
      castId: started.castId,
      elapsedMs: 0,
      durationMs: selected === 'tailSwipe' ? TAIL_BODY_DURATION_MS : AQUA_BODY_DURATION_MS,
    };
  }

  private stepPlayerBodyAction(stepMs: number): void {
    if (this.playerBodyAction === undefined) return;
    const next = this.playerBodyAction.elapsedMs + stepMs;
    if (next > this.playerBodyAction.durationMs) {
      this.playerBodyAction = undefined;
      return;
    }
    this.playerBodyAction.elapsedMs = next;
  }
}

function isE2eManualClock(): boolean {
  if (import.meta.env.MODE !== 'e2e') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('e2e') === '1' && params.get('clock') === 'manual';
}
