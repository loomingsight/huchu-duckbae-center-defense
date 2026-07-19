import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import type { ShelterVisualState } from './ShelterTypes';

const SHELTER_X = 270;
const SHELTER_Y = 480;
const SHELTER_FRAME_SIZE = 256;
const SHELTER_ORIGIN_Y = 224 / SHELTER_FRAME_SIZE;
const SHAKE_HALF_DISTANCE = 4;
const SHAKE_LEG_MS = 30;

export const SHELTER_DISPLAY_HEIGHT = 77;

export function shelterFrameFor(state: ShelterVisualState): number {
  switch (state) {
    case 'healthy':
      return 0;
    case 'damaged':
      return 1;
    case 'critical':
      return 2;
    case 'failed':
      return 3;
    default:
      throw new RangeError(`Unknown shelter visual state ${String(state)}`);
  }
}

export class ShelterView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private shakeTween: Phaser.Tweens.Tween | undefined;

  constructor(private readonly scene: Phaser.Scene) {
    this.sprite = scene.add.sprite(SHELTER_X, SHELTER_Y, AssetKeys.shelter, 0);
    this.sprite
      .setOrigin(0.5, SHELTER_ORIGIN_Y)
      .setDisplaySize(SHELTER_DISPLAY_HEIGHT, SHELTER_DISPLAY_HEIGHT)
      .setDepth(SHELTER_Y);
  }

  render(state: ShelterVisualState): void {
    this.sprite.setFrame(shelterFrameFor(state));
  }

  showDamage(): void {
    this.shakeTween?.stop();
    this.sprite.setX(SHELTER_X);
    this.shakeTween = this.scene.tweens.add({
      targets: this.sprite,
      x: {
        from: SHELTER_X - SHAKE_HALF_DISTANCE,
        to: SHELTER_X + SHAKE_HALF_DISTANCE,
      },
      duration: SHAKE_LEG_MS,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.sprite.setX(SHELTER_X);
        this.shakeTween = undefined;
      },
    });
  }

  reset(): void {
    this.shakeTween?.stop();
    this.shakeTween = undefined;
    this.sprite.setX(SHELTER_X);
    this.render('healthy');
  }

  destroy(): void {
    this.shakeTween?.stop();
    this.shakeTween = undefined;
    this.sprite.destroy();
  }
}
