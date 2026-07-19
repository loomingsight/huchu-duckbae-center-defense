import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { reachedDuration } from '../constants';
import type { ShelterVisualState } from './ShelterTypes';

const SHELTER_X = 270;
const SHELTER_Y = 480;
const SHELTER_FRAME_SIZE = 256;
const SHELTER_ORIGIN_Y = 224 / SHELTER_FRAME_SIZE;
const SHAKE_HALF_DISTANCE = 4;
const SHAKE_LEG_MS = 30;
const SHAKE_DURATION_MS = SHAKE_LEG_MS * 4;

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

export function shelterShakeOffsetAt(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Shelter shake elapsed time must be finite and non-negative');
  }
  if (elapsedMs >= SHAKE_DURATION_MS) return 0;
  const leg = Math.floor(elapsedMs / SHAKE_LEG_MS);
  const progress = (elapsedMs - leg * SHAKE_LEG_MS) / SHAKE_LEG_MS;
  return leg % 2 === 0
    ? -SHAKE_HALF_DISTANCE + SHAKE_HALF_DISTANCE * 2 * progress
    : SHAKE_HALF_DISTANCE - SHAKE_HALF_DISTANCE * 2 * progress;
}

export class ShelterView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private shakeElapsedMs: number | undefined;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
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
    if (this.destroyed) return;
    this.shakeElapsedMs = 0;
    this.sprite.setX(SHELTER_X + shelterShakeOffsetAt(0));
  }

  stepSimulation(stepMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Shelter shake step must be finite and non-negative');
    }
    if (this.destroyed || this.shakeElapsedMs === undefined) return;
    const nextElapsedMs = this.shakeElapsedMs + stepMs;
    if (reachedDuration(nextElapsedMs, SHAKE_DURATION_MS)) {
      this.shakeElapsedMs = undefined;
      this.sprite.setX(SHELTER_X);
      return;
    }
    this.shakeElapsedMs = nextElapsedMs;
    this.sprite.setX(SHELTER_X + shelterShakeOffsetAt(nextElapsedMs));
  }

  shakeOffsetSnapshot(): number {
    return this.shakeElapsedMs === undefined ? 0 : shelterShakeOffsetAt(this.shakeElapsedMs);
  }

  reset(): void {
    if (this.destroyed) return;
    this.shakeElapsedMs = undefined;
    this.sprite.setX(SHELTER_X);
    this.render('healthy');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.shakeElapsedMs = undefined;
    this.sprite.setX(SHELTER_X);
    this.sprite.destroy();
    this.destroyed = true;
  }
}
