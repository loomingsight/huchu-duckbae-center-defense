import Phaser from 'phaser';
import {
  FIXED_STEP_MS,
  TIME_EPSILON_MS,
} from '../constants';
import { FixedStepClock } from '../core/FixedStepClock';
import type { ScenarioEnemySeed } from '../debug/ScenarioSessionPort';
import {
  ProjectileActorPool,
  type ProjectileImpactSnapshot,
} from '../combat/ProjectileActorPool';
import { EnemyActorPool } from '../enemies/EnemyActorPool';
import type { GameEvent } from '../events/GameEvents';
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
import { DebugPathOverlay } from '../world/DebugPathOverlay';
import { MapView } from '../world/MapView';
import { SceneRuntimeLifecycle } from './SceneRuntimeLifecycle';

const INITIAL_PLAYER_POSITION = { x: 270, y: 650 } as const;
const DEFAULT_RUN_SEED = 424242;
const MAX_CATCH_UP_STEPS = 5;

export class GameScene extends Phaser.Scene {
  private readonly fixedClock = new FixedStepClock(FIXED_STEP_MS, MAX_CATCH_UP_STEPS);
  private readonly runtimeLifecycle = new SceneRuntimeLifecycle();
  private session!: GameSession;
  private playerController!: PlayerController;
  private playerView!: PlayerView;
  private keyboardInput!: KeyboardInput;
  private virtualJoystick!: VirtualJoystick;
  private waveCountdownText!: Phaser.GameObjects.Text;
  private enemyActors: EnemyActorPool | undefined;
  private projectileActors: ProjectileActorPool | undefined;
  private shelterView: ShelterView | undefined;
  private enemyAttackEffect: Phaser.GameObjects.Graphics | undefined;
  private manualClock = false;
  private worldAnimationMs = 0;
  private moving = false;
  private barkAnimationElapsedMs: number | undefined;

  constructor() {
    super('Game');
  }

  create(): void {
    const generation = this.runtimeLifecycle.begin();
    const root = document.querySelector('#game-root');
    root?.setAttribute('data-scene', 'Game');
    root?.setAttribute('data-renderer', this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'other');

    this.fixedClock.reset();
    this.session = GameSession.create({ seed: DEFAULT_RUN_SEED });
    this.manualClock = isE2eManualClock();
    this.worldAnimationMs = 0;
    this.moving = false;
    this.barkAnimationElapsedMs = undefined;
    this.enemyActors = new EnemyActorPool(this);

    new MapView(this);
    this.shelterView = new ShelterView(this);
    this.projectileActors = new ProjectileActorPool(this);
    this.enemyAttackEffect = this.add.graphics().setDepth(1000);
    if (import.meta.env.DEV) new DebugPathOverlay(this);
    this.waveCountdownText = this.add.text(270, 420, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '80px',
      color: '#ffffff',
      stroke: '#34291f',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(1900).setVisible(false);
    this.playerController = new PlayerController({ ...INITIAL_PLAYER_POSITION });
    this.playerView = new PlayerView(this, this.playerController.snapshot());
    this.keyboardInput = new KeyboardInput(this);
    this.virtualJoystick = new VirtualJoystick(this);
    this.renderPlayer();
    this.renderEnemies();
    this.renderProjectiles();

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
      return this.session.step(stepMs, this.playerController.snapshot());
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
    this.enemyActors?.releaseAll();
    this.projectileActors?.releaseAll();
    this.shelterView?.reset();
    this.resetEnemyAttackEffect();
    this.playerView.resetCombatVisuals();
    this.session.reset(seed);
    this.fixedClock.reset();
    this.barkAnimationElapsedMs = undefined;
    this.updateWaveCountdown(0);
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

  combatEffectsSnapshot(): PoolSnapshot {
    return this.playerView.effectPoolSnapshot();
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
      if (event.type === 'waveCountdownChanged') this.updateWaveCountdown(event.remainingMs);
    });
  }

  private updateWaveCountdown(remainingMs: number): void {
    if (remainingMs <= 0) {
      this.waveCountdownText.setText('').setVisible(false);
      return;
    }
    this.waveCountdownText
      .setText(String(Math.ceil(remainingMs / 1000)))
      .setVisible(true);
  }

  private shutdownRuntime(generation: number): void {
    this.runtimeLifecycle.end(generation);
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
    this.tweens.killTweensOf(effect);
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
    this.tweens.add({
      targets: effect,
      alpha: 0,
      duration: 120,
      onComplete: () => effect.clear().setAlpha(1),
    });
  }

  private resetEnemyAttackEffect(): void {
    if (this.enemyAttackEffect === undefined) return;
    this.tweens.killTweensOf(this.enemyAttackEffect);
    this.enemyAttackEffect.clear().setAlpha(1);
  }

  private advanceCombatVisuals(stepMs: number): void {
    this.playerView.stepSimulation(stepMs);
    this.projectileActors?.stepEffects(stepMs);
    if (this.barkAnimationElapsedMs === undefined) return;
    const nextElapsedMs = this.barkAnimationElapsedMs + stepMs;
    this.barkAnimationElapsedMs = nextElapsedMs + TIME_EPSILON_MS >= this.session.barkCadenceMs()
      ? undefined
      : nextElapsedMs;
  }
}

function isE2eManualClock(): boolean {
  if (import.meta.env.MODE !== 'e2e') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('e2e') === '1' && params.get('clock') === 'manual';
}
