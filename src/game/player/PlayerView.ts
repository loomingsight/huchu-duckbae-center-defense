import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import {
  BARK_WAVE_CONE_DEGREES,
  BARK_WAVE_DURATION_MS,
  barkWaveVisualAt,
  type BarkWaveVisual,
  CombatEffectPool,
} from '../combat/CombatEffectPool';
import { BALANCE } from '../data/balance';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { Point } from '../world/Geometry';
import {
  attackFrameAt,
  idleBreathScale,
  loopFrame,
} from '../world/AnimationFrameResolver';
import type { PlayerSnapshot } from './PlayerTypes';

const SOURCE_FRAME_HEIGHT = 256;
const DISPLAY_HEIGHT = 72;
const BASE_SCALE = DISPLAY_HEIGHT / SOURCE_FRAME_HEIGHT;
export const BARK_WAVE_POOL_CAPACITY = BALANCE.caps.particles;
export { BARK_WAVE_CONE_DEGREES, BARK_WAVE_DURATION_MS, barkWaveVisualAt };
export type { BarkWaveVisual };

export interface PlayerRenderSnapshot extends PlayerSnapshot {
  readonly worldAnimationMs: number;
  readonly moving: boolean;
  readonly barkElapsedMs?: number;
}

export class PlayerView {
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    initial: PlayerSnapshot,
    private readonly effects: CombatEffectPool,
  ) {
    this.sprite = scene.add
      .sprite(initial.x, initial.y, AssetKeys.huchu, 0)
      .setOrigin(0.5, 1)
      .setScale(BASE_SCALE)
      .setDepth(initial.y);
  }

  render(snapshot: PlayerRenderSnapshot): void {
    const attacking = snapshot.barkElapsedMs !== undefined;
    const frame = attacking
      ? attackFrameAt(snapshot.barkElapsedMs)
      : snapshot.moving
        ? loopFrame(snapshot.worldAnimationMs, 6, 0, 4)
        : 0;
    const breathScale = snapshot.moving || attacking
      ? 1
      : idleBreathScale(snapshot.worldAnimationMs);
    this.sprite
      .setPosition(snapshot.x, snapshot.y)
      .setFrame(frame)
      .setScale(BASE_SCALE * breathScale)
      .setDepth(snapshot.y);
  }

  showBarkWave(origin: Point, target: Point): boolean {
    return this.effects.showBarkWave(origin, target);
  }

  stepSimulation(stepMs: number): void {
    this.effects.step(stepMs);
  }

  resetCombatVisuals(): void {
    this.effects.releaseType('bark');
  }

  effectPoolSnapshot(): PoolSnapshot {
    return this.effects.snapshot();
  }

  effectAgesSnapshot(): readonly number[] {
    return this.effects.effectAges('bark');
  }

  destroy(): void {
    this.resetCombatVisuals();
    this.sprite.removeAllListeners();
  }
}
