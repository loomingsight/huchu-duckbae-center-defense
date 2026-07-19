import Phaser from 'phaser';
import {
  FIXED_STEP_MS,
  simulationMsFromTicks,
  TIME_EPSILON_MS,
} from '../constants';
import { FixedStepClock } from '../core/FixedStepClock';
import type { GameMode } from '../core/GameMode';
import { GameStateMachine } from '../core/GameStateMachine';
import type { MovementIntent } from '../player/InputVector';
import { KeyboardInput } from '../player/KeyboardInput';
import { PlayerController } from '../player/PlayerController';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import { PlayerView } from '../player/PlayerView';
import { VirtualJoystick } from '../player/VirtualJoystick';
import { DebugPathOverlay } from '../world/DebugPathOverlay';
import { MapView } from '../world/MapView';

const INITIAL_PLAYER_POSITION = { x: 270, y: 650 } as const;
const MAX_CATCH_UP_STEPS = 5;

export class GameScene extends Phaser.Scene {
  private readonly fixedClock = new FixedStepClock(FIXED_STEP_MS, MAX_CATCH_UP_STEPS);
  private readonly stateMachine = new GameStateMachine('playing');
  private playerController!: PlayerController;
  private playerView!: PlayerView;
  private keyboardInput!: KeyboardInput;
  private virtualJoystick!: VirtualJoystick;
  private manualClock = false;
  private manualTicks = 0;
  private worldAnimationMs = 0;
  private moving = false;

  constructor() {
    super('Game');
  }

  create(): void {
    const root = document.querySelector('#game-root');
    root?.setAttribute('data-scene', 'Game');
    root?.setAttribute('data-renderer', this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'other');

    this.fixedClock.reset();
    this.stateMachine.reset('playing');
    this.manualClock = isE2eManualClock();
    this.manualTicks = 0;
    this.worldAnimationMs = 0;
    this.moving = false;

    new MapView(this);
    if (import.meta.env.DEV) new DebugPathOverlay(this);
    this.playerController = new PlayerController({ ...INITIAL_PLAYER_POSITION });
    this.playerView = new PlayerView(this, this.playerController.snapshot());
    this.keyboardInput = new KeyboardInput(this);
    this.virtualJoystick = new VirtualJoystick(this);
    this.renderPlayer();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownInputs, this);

    if (import.meta.env.MODE === 'e2e') {
      void import('../debug/TestBridge').then(({ installTestBridge }) => {
        installTestBridge(this);
      });
    }
  }

  update(_time: number, delta: number): void {
    if (!this.manualClock) {
      this.fixedClock.consume(delta).forEach((stepMs) => this.advancePlayerOnlyStep(stepMs));
    }
    this.renderPlayer();
  }

  advancePlayerOnlyStep(stepMs: number): void {
    if (Math.abs(stepMs - FIXED_STEP_MS) > TIME_EPSILON_MS) {
      throw new RangeError('GameScene requires one fixed step');
    }
    if (!this.stateMachine.canStepWorld()) return;
    const intent = this.readMovementIntent();
    this.playerController.step(stepMs, intent);
    this.moving = intent.magnitude > 0;
    this.worldAnimationMs += stepMs;
    this.manualTicks += 1;
  }

  resetManualSimulation(): void {
    this.manualTicks = 0;
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

  simulationMs(): number {
    return simulationMsFromTicks(this.manualTicks);
  }

  currentMode(): GameMode {
    return this.stateMachine.current();
  }

  setVisibilityForTest(hidden: boolean): void {
    if (hidden) this.stateMachine.hide();
    else this.stateMachine.resume();
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

  private shutdownInputs(): void {
    this.keyboardInput.destroy();
    this.virtualJoystick.destroy();
  }
}

function isE2eManualClock(): boolean {
  if (import.meta.env.MODE !== 'e2e') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('e2e') === '1' && params.get('clock') === 'manual';
}
