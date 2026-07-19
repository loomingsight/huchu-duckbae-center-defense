import Phaser from 'phaser';
import {
  FIXED_STEP_MS,
  reachedDuration,
  TIME_EPSILON_MS,
} from '../constants';
import { FixedStepClock } from '../core/FixedStepClock';
import type { GameMode } from '../core/GameMode';
import type { ScenarioEnemySeed } from '../debug/ScenarioSessionPort';
import {
  ProjectileActorPool,
  type ProjectileImpactSnapshot,
} from '../combat/ProjectileActorPool';
import { EnemyActorPool } from '../enemies/EnemyActorPool';
import type { GameEvent } from '../events/GameEvents';
import { WorldPauseController } from '../lifecycle/WorldPauseController';
import type { MovementIntent } from '../player/InputVector';
import { KeyboardInput } from '../player/KeyboardInput';
import { PlayerController } from '../player/PlayerController';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import { PlayerView } from '../player/PlayerView';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import { VirtualJoystick } from '../player/VirtualJoystick';
import { GameSession } from '../session/GameSession';
import type { RunSnapshot } from '../session/RunSnapshot';
import { ShelterView } from '../shelter/ShelterView';
import type { SkillCard } from '../skills/SkillTypes';
import {
  CountdownOverlay,
  type CountdownKind,
} from '../ui/CountdownOverlay';
import { SkillSelectionModal } from '../ui/SkillSelectionModal';
import { DebugPathOverlay } from '../world/DebugPathOverlay';
import { MapView } from '../world/MapView';
import { SceneRuntimeLifecycle } from './SceneRuntimeLifecycle';

const INITIAL_PLAYER_POSITION = { x: 270, y: 650 } as const;
const DEFAULT_RUN_SEED = 424242;
const MAX_CATCH_UP_STEPS = 5;
const OFF_LEASH_EFFECT_DURATION_MS = 120;

export class GameScene extends Phaser.Scene {
  private readonly fixedClock = new FixedStepClock(FIXED_STEP_MS, MAX_CATCH_UP_STEPS);
  private readonly runtimeLifecycle = new SceneRuntimeLifecycle();
  private session!: GameSession;
  private playerController!: PlayerController;
  private playerView!: PlayerView;
  private keyboardInput!: KeyboardInput;
  private virtualJoystick!: VirtualJoystick;
  private countdownOverlay!: CountdownOverlay;
  private skillSelectionModal: SkillSelectionModal | undefined;
  private skillHudText!: Phaser.GameObjects.Text;
  private worldPauseController!: WorldPauseController;
  private enemyActors: EnemyActorPool | undefined;
  private projectileActors: ProjectileActorPool | undefined;
  private shelterView: ShelterView | undefined;
  private enemyAttackEffect: Phaser.GameObjects.Graphics | undefined;
  private manualClock = false;
  private worldAnimationMs = 0;
  private moving = false;
  private barkAnimationElapsedMs: number | undefined;
  private offLeashEffectAgeMs: number | undefined;
  private worldPaused = false;
  private runtimeGeneration = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    const generation = this.runtimeLifecycle.begin();
    this.runtimeGeneration = generation;
    const root = document.querySelector('#game-root');
    root?.setAttribute('data-scene', 'Game');
    root?.setAttribute('data-renderer', this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'other');

    this.fixedClock.reset();
    this.session = GameSession.create({ seed: DEFAULT_RUN_SEED });
    this.manualClock = isE2eManualClock();
    this.worldAnimationMs = 0;
    this.moving = false;
    this.barkAnimationElapsedMs = undefined;
    this.offLeashEffectAgeMs = undefined;
    this.worldPaused = false;
    this.enemyActors = new EnemyActorPool(this);
    this.worldPauseController = new WorldPauseController(
      this.session.modeStateForControllers(),
      { setPaused: (paused) => this.setWorldPaused(paused) },
    );

    new MapView(this);
    this.shelterView = new ShelterView(this);
    this.projectileActors = new ProjectileActorPool(this);
    this.enemyAttackEffect = this.add.graphics().setDepth(1000);
    if (import.meta.env.DEV) new DebugPathOverlay(this);
    this.countdownOverlay = new CountdownOverlay(this);
    this.skillHudText = this.add.text(16, 16, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#34291f',
      strokeThickness: 4,
    }).setDepth(1800);
    this.playerController = new PlayerController({ ...INITIAL_PLAYER_POSITION });
    this.playerView = new PlayerView(this, this.playerController.snapshot());
    this.keyboardInput = new KeyboardInput(this);
    this.virtualJoystick = new VirtualJoystick(this);
    this.renderPlayer();
    this.renderEnemies();
    this.renderProjectiles();
    this.renderSkillHud();

    const onVisibilityChange = (): void => this.setVisibilityForTest(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.runtimeLifecycle.attach(generation, () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownRuntime(generation));

    if (import.meta.env.MODE === 'e2e') {
      void import('../debug/TestBridge').then(({ installTestBridge }) => {
        if (!this.runtimeLifecycle.isActive(generation)) return;
        this.runtimeLifecycle.attach(generation, installTestBridge(this));
      });
    }
  }

  update(_time: number, delta: number): void {
    if (!this.manualClock) {
      this.fixedClock.consume(delta).forEach((stepMs) => this.advanceSimulationStep(stepMs));
    }
    this.renderPlayer();
    this.renderEnemies();
    this.renderProjectiles();
  }

  advanceSimulationStep(stepMs: number): readonly GameEvent[] {
    if (!Number.isFinite(stepMs) || Math.abs(stepMs - FIXED_STEP_MS) > TIME_EPSILON_MS) {
      throw new RangeError('GameScene requires one fixed step');
    }
    if (!this.session.modeStateForControllers().canStepWorld()) {
      const events = this.session.step(stepMs, this.playerController.snapshot());
      this.applySessionEvents(events);
      return events;
    }
    const intent = this.readMovementIntent();
    this.playerController.step(stepMs, intent);
    this.moving = intent.magnitude > 0;
    this.worldAnimationMs += stepMs;
    this.advanceCombatVisuals(stepMs);
    const events = this.session.step(stepMs, this.playerController.snapshot());
    this.applySessionEvents(events);
    if (this.session.barkSnapshot().ready) this.barkAnimationElapsedMs = undefined;
    return events;
  }

  resetSession(seed: number): void {
    this.destroySkillSelection();
    this.enemyActors?.releaseAll();
    this.projectileActors?.releaseAll();
    this.shelterView?.reset();
    this.resetEnemyAttackEffect();
    this.playerView.resetCombatVisuals();
    this.session.reset(seed);
    this.worldPauseController.reset();
    this.fixedClock.reset();
    this.worldAnimationMs = 0;
    this.moving = false;
    this.barkAnimationElapsedMs = undefined;
    this.offLeashEffectAgeMs = undefined;
    this.countdownOverlay.reset();
    this.renderSkillHud();
    this.renderPlayer();
    this.renderEnemies();
    this.renderProjectiles();
  }

  resetPlayer(x: number, y: number): void {
    this.playerController = new PlayerController({ x, y });
    this.worldAnimationMs = 0;
    this.moving = false;
    this.renderPlayer();
  }

  playerSnapshot(): PlayerSnapshot {
    return this.playerController.snapshot();
  }

  sessionSnapshot(): RunSnapshot {
    return this.session.snapshot();
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
    return this.playerView.effectPoolSnapshot();
  }

  skillCardsSnapshot(): readonly SkillCard[] {
    return this.session.currentCards();
  }

  skillCooldownProgressSnapshot(): ReturnType<GameSession['skillCooldownProgress']> {
    return this.session.skillCooldownProgress();
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
    readonly shelterEffectAgeMs: number | null;
    readonly offLeashEffectAgeMs: number | null;
  } {
    return {
      worldPaused: this.worldPaused,
      worldAnimationMs: this.worldAnimationMs,
      barkAnimationElapsedMs: this.barkAnimationElapsedMs ?? null,
      barkEffectAgesMs: this.playerView.effectAgesSnapshot(),
      projectileEffectAgesMs: this.projectileActors?.impactAgesSnapshot() ?? [],
      shelterEffectAgeMs: this.shelterView?.shakeElapsedSnapshot() ?? null,
      offLeashEffectAgeMs: this.offLeashEffectAgeMs ?? null,
    };
  }

  seedEnemyForScenario(seed: ScenarioEnemySeed): number {
    const enemyId = this.session.spawnEnemyForScenario(seed);
    const actor = this.enemyActors?.acquire(enemyId);
    if (actor === undefined) throw new Error('Enemy actor pool exhausted');
    this.renderEnemies();
    return enemyId;
  }

  suppressWaveSpawnsForScenario(): void {
    this.session.suppressWaveSpawnsForScenario();
  }

  setVisibilityForTest(hidden: boolean): void {
    if (hidden) this.session.requestVisibilityPause();
    else this.session.requestVisibilityResume();
    this.worldPauseController.sync();
  }

  forceModeForTest(mode: GameMode): void {
    this.session.forceModeForTest(mode);
    this.worldPauseController.sync();
  }

  waitForRenderFlush(): Promise<void> {
    return new Promise((resolve) => {
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve());
    });
  }

  private readMovementIntent(): MovementIntent {
    const keyboard = this.keyboardInput.read();
    return keyboard.magnitude > 0 ? keyboard : this.virtualJoystick.read();
  }

  private renderPlayer(): void {
    this.playerView.render({
      ...this.playerController.snapshot(),
      worldAnimationMs: this.worldAnimationMs,
      moving: this.moving,
      barkElapsedMs: this.barkAnimationElapsedMs,
    });
  }

  private renderEnemies(): void {
    this.enemyActors?.render(this.session.snapshot().enemies);
  }

  private renderProjectiles(): void {
    this.projectileActors?.render(this.session.snapshot().projectiles);
  }

  private applySessionEvents(events: readonly GameEvent[]): void {
    events.forEach((event) => {
      if (event.type === 'modeChanged') {
        this.worldPauseController.sync();
        if (event.mode === 'playing') {
          this.countdownOverlay.reset();
        } else if (event.mode === 'countdown') {
          this.destroySkillSelection();
          this.renderCountdown();
        }
      }
      if (event.type === 'skillSelectionOpened') {
        this.showSkillSelection(event.cards);
      }
      if (event.type === 'skillLearned') this.renderSkillHud();
      if (event.type === 'enemySpawned') {
        const actor = this.enemyActors?.acquire(event.enemyId);
        if (actor === undefined) throw new Error('Enemy actor pool exhausted');
      }
      if (event.type === 'barkStarted') this.barkAnimationElapsedMs = 0;
      if (event.type === 'barkReleased') this.playerView.showBarkWave(event.origin, event.target);
      if (event.type === 'shelterDamageRequested' && 'enemyId' in event) {
        this.showOffLeashAttack(event.enemyId);
      }
      if (event.type === 'projectileHit') {
        this.projectileActors?.showHit(event.projectileId, event.kind, event.position);
      }
      if (event.type === 'shelterDamaged') {
        this.shelterView?.render(event.visual);
        this.shelterView?.showDamage();
      }
      if (event.type === 'enemyDied') this.enemyActors?.release(event.enemyId);
      if (event.type === 'waveCountdownChanged') this.renderCountdown();
    });
  }

  private renderCountdown(): void {
    const countdown = this.session.countdownState();
    this.countdownOverlay.render(
      countdown.remainingMs,
      countdown.kind ?? 'resumeCombat',
    );
  }

  private shutdownRuntime(generation: number): void {
    this.runtimeLifecycle.end(generation);
    this.skillSelectionModal = undefined;
    this.countdownOverlay.destroy();
    this.skillHudText.removeAllListeners();
    this.skillHudText.destroy();
    this.enemyActors = undefined;
    this.projectileActors?.releaseAll();
    this.projectileActors = undefined;
    this.shelterView?.destroy();
    this.shelterView = undefined;
    this.enemyAttackEffect?.destroy();
    this.enemyAttackEffect = undefined;
    this.playerView.destroy();
    this.keyboardInput.destroy();
    this.virtualJoystick.destroy();
  }

  private showOffLeashAttack(enemyId: number): void {
    const effect = this.enemyAttackEffect;
    if (effect === undefined) return;
    const enemy = this.session.snapshot().enemies.find(({ id }) => id === enemyId);
    if (enemy?.kind !== 'offLeashGuardian') return;
    const target = { x: 270, y: 480 };
    const middle = {
      x: (enemy.position.x + target.x) / 2,
      y: (enemy.position.y + target.y) / 2 - 12,
    };
    effect
      .clear()
      .lineStyle(4, 0xf2ca45, 0.95)
      .beginPath()
      .moveTo(enemy.position.x, enemy.position.y - 18)
      .lineTo(middle.x, middle.y)
      .lineTo(target.x, target.y)
      .strokePath()
      .setAlpha(1);
    this.offLeashEffectAgeMs = 0;
  }

  private resetEnemyAttackEffect(): void {
    if (this.enemyAttackEffect === undefined) return;
    this.offLeashEffectAgeMs = undefined;
    this.enemyAttackEffect.clear().setAlpha(1);
  }

  private advanceCombatVisuals(stepMs: number): void {
    this.playerView.stepSimulation(stepMs);
    this.projectileActors?.stepEffects(stepMs);
    this.shelterView?.stepSimulation(stepMs);
    this.stepOffLeashEffect(stepMs);
    if (this.barkAnimationElapsedMs === undefined) return;
    const nextElapsedMs = this.barkAnimationElapsedMs + stepMs;
    this.barkAnimationElapsedMs = nextElapsedMs + TIME_EPSILON_MS >= this.session.barkCadenceMs()
      ? undefined
      : nextElapsedMs;
  }

  private stepOffLeashEffect(stepMs: number): void {
    if (this.offLeashEffectAgeMs === undefined) return;
    const effect = this.enemyAttackEffect;
    if (effect === undefined) return;
    const nextAgeMs = this.offLeashEffectAgeMs + stepMs;
    if (reachedDuration(nextAgeMs, OFF_LEASH_EFFECT_DURATION_MS)) {
      this.offLeashEffectAgeMs = undefined;
      effect.clear().setAlpha(1);
      return;
    }
    this.offLeashEffectAgeMs = nextAgeMs;
    effect.setAlpha(1 - nextAgeMs / OFF_LEASH_EFFECT_DURATION_MS);
  }

  private showSkillSelection(cards: readonly SkillCard[]): void {
    this.destroySkillSelection();
    const modal = new SkillSelectionModal(this, cards, (cardId) => {
      const events = this.session.selectCard(cardId);
      this.applySessionEvents(events);
      this.renderSkillHud();
    });
    this.skillSelectionModal = modal;
    this.runtimeLifecycle.attach(this.runtimeGeneration, () => modal.destroy());
  }

  private destroySkillSelection(): void {
    this.skillSelectionModal?.destroy();
    this.skillSelectionModal = undefined;
  }

  private renderSkillHud(): void {
    const skills = this.session.snapshot().skills;
    const rows = [`짖기 Lv.${skills.bark}`];
    if (skills.scold > 0) rows.push(`호통치기 Lv.${skills.scold}`);
    if (skills.aquaBeam > 0) rows.push(`아쿠아빔 Lv.${skills.aquaBeam}`);
    if (skills.deokbaeHowl > 0) rows.push(`덕배 하울링 Lv.${skills.deokbaeHowl}`);
    if (skills.safetyReport > 0) rows.push(`안전신문고 Lv.${skills.safetyReport}`);
    this.skillHudText.setText(rows);
  }

  private setWorldPaused(paused: boolean): void {
    this.worldPaused = paused;
    if (paused) this.physics?.world?.pause();
    else this.physics?.world?.resume();
  }
}

function isE2eManualClock(): boolean {
  if (import.meta.env.MODE !== 'e2e') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('e2e') === '1' && params.get('clock') === 'manual';
}
