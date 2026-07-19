import Phaser from 'phaser';
import {
  FIXED_STEP_MS,
  TIME_EPSILON_MS,
} from '../constants';
import { FixedStepClock } from '../core/FixedStepClock';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import type { GameEvent } from '../events/GameEvents';
import type { MovementIntent } from '../player/InputVector';
import { KeyboardInput } from '../player/KeyboardInput';
import { PlayerController } from '../player/PlayerController';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import { PlayerView } from '../player/PlayerView';
import { VirtualJoystick } from '../player/VirtualJoystick';
import { GameSession } from '../session/GameSession';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
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
  private readonly debugSpawnMarkers: Phaser.GameObjects.Arc[] = [];
  private manualClock = false;
  private worldAnimationMs = 0;
  private moving = false;

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
    this.debugSpawnMarkers.length = 0;

    new MapView(this);
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
    const events = this.session.step(stepMs, this.playerController.snapshot());
    this.applySessionEvents(events);
    return events;
  }

  resetSession(seed: number): void {
    this.session.reset(seed);
    this.fixedClock.reset();
    this.debugSpawnMarkers.splice(0).forEach((marker) => marker.destroy());
    this.updateWaveCountdown(0);
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
    });
  }

  private applySessionEvents(events: readonly GameEvent[]): void {
    events.forEach((event) => {
      if (event.type === 'enemySpawnRequested') this.addDebugSpawnMarker(event.request);
      if (event.type === 'waveCountdownChanged') this.updateWaveCountdown(event.remainingMs);
    });
  }

  private addDebugSpawnMarker(request: EnemySpawnRequest): void {
    if (!import.meta.env.DEV) return;
    const [x, y] = PATH_DEFINITIONS[request.pathId][0]!;
    const marker = this.add.circle(x, y, 7, 0xf97316, 0.72)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setDepth(100)
      .setData('enemySpawnRequest', request);
    this.debugSpawnMarkers.push(marker);
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
    this.keyboardInput.destroy();
    this.virtualJoystick.destroy();
  }
}

function isE2eManualClock(): boolean {
  if (import.meta.env.MODE !== 'e2e') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('e2e') === '1' && params.get('clock') === 'manual';
}
