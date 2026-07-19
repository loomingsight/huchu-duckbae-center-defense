import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import {
  attackFrameAt,
  idleBreathScale,
  loopFrame,
} from '../world/AnimationFrameResolver';
import type { PlayerSnapshot } from './PlayerTypes';

const SOURCE_FRAME_HEIGHT = 256;
const DISPLAY_HEIGHT = 72;
const BASE_SCALE = DISPLAY_HEIGHT / SOURCE_FRAME_HEIGHT;

export interface PlayerRenderSnapshot extends PlayerSnapshot {
  readonly worldAnimationMs: number;
  readonly moving: boolean;
  readonly barkElapsedMs?: number;
}

export class PlayerView {
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, initial: PlayerSnapshot) {
    this.sprite = scene.add
      .sprite(initial.x, initial.y, AssetKeys.huchu, 0)
      .setOrigin(0.5, 1)
      .setScale(BASE_SCALE)
      .setDepth(initial.y);
  }

  render(snapshot: PlayerRenderSnapshot): void {
    const attacking = snapshot.barkElapsedMs !== undefined;
    const frame = attacking
      ? attackFrameAt(snapshot.barkElapsedMs!)
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
}
