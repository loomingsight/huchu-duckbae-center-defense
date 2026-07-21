import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { reachedDuration } from '../constants';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';
import { ShelterHpView } from '../ui/ShelterHpView';
import type { ShelterVisualState } from './ShelterTypes';
import type { ImpactFeedbackTarget } from '../enemies/ImpactFeedbackTarget';
import type { Point } from '../world/Geometry';

const SHELTER_X = 270;
const SHELTER_Y = 480;
const SHELTER_FRAME_SIZE = 256;
const SHELTER_ORIGIN_Y = 224 / SHELTER_FRAME_SIZE;
const SHAKE_HALF_DISTANCE = 4;
const SHAKE_LEG_MS = 30;
const SHAKE_DURATION_MS = SHAKE_LEG_MS * 4;
const FAILED_HOLD_MS = 1200;

type ShakeKind = 'damage' | 'failedHold';

const SHELTER_OPAQUE_HEIGHT_PX = 204;
export const SHELTER_DISPLAY_HEIGHT = HUCHU_PRESENTATION.shelterOpaqueHeightLogical
  * SHELTER_FRAME_SIZE / SHELTER_OPAQUE_HEIGHT_PX;
const SHELTER_BASE_SCALE = SHELTER_DISPLAY_HEIGHT / SHELTER_FRAME_SIZE;

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

export class ShelterView implements ImpactFeedbackTarget {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly hp: ShelterHpView;
  private shakeElapsedMs: number | undefined;
  private shakeKind: ShakeKind | undefined;
  private destroyed = false;
  private flashRemainingMs = 0;
  private recoilState: {
    readonly direction: Point;
    readonly distancePx: number;
    readonly popScale: number;
    readonly durationMs: number;
    remainingMs: number;
  } | undefined;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.sprite(SHELTER_X, SHELTER_Y, AssetKeys.shelter, 0);
    this.sprite
      .setOrigin(0.5, SHELTER_ORIGIN_Y)
      .setDisplaySize(SHELTER_DISPLAY_HEIGHT, SHELTER_DISPLAY_HEIGHT)
      .setDepth(SHELTER_Y);
    this.hp = new ShelterHpView(scene, SHELTER_X, SHELTER_Y);
    this.hp.render(1000, 1000, SHELTER_X, SHELTER_Y);
  }

  render(state: ShelterVisualState, current = 1000, maximum = 1000): void {
    this.sprite.setFrame(shelterFrameFor(state));
    this.hp.render(current, maximum, SHELTER_X, SHELTER_Y);
  }

  showDamage(): void {
    if (this.destroyed) return;
    this.shakeKind = 'damage';
    this.shakeElapsedMs = 0;
    this.setShelterX(SHELTER_X + shelterShakeOffsetAt(0));
  }

  showFailedHold(): void {
    if (this.destroyed) return;
    this.shakeKind = 'failedHold';
    this.shakeElapsedMs = 0;
    this.setShelterX(SHELTER_X + shelterShakeOffsetAt(0));
  }

  getFeedbackAnchor(): Point {
    return { x: SHELTER_X, y: SHELTER_Y };
  }

  flash(durationMs: number): void {
    assertFiniteNonNegative(durationMs, 'Shelter flash durationMs');
    if (this.destroyed) return;
    this.flashRemainingMs = durationMs;
    this.hp.flashRed(durationMs);
  }

  recoil(input: {
    readonly direction: Point;
    readonly distancePx: number;
    readonly popScale: number;
    readonly durationMs: number;
  }): void {
    assertPoint(input.direction, 'Shelter recoil direction');
    assertFiniteNonNegative(input.distancePx, 'Shelter recoil distancePx');
    assertFiniteNonNegative(input.durationMs, 'Shelter recoil durationMs');
    if (!Number.isFinite(input.popScale) || input.popScale <= 0) {
      throw new RangeError('Shelter recoil popScale must be finite and positive');
    }
    if (this.destroyed) return;
    this.recoilState = {
      direction: { ...input.direction },
      distancePx: input.distancePx,
      popScale: input.popScale,
      durationMs: input.durationMs,
      remainingMs: input.durationMs,
    };
    this.applyFeedbackTransform();
  }

  beginDeath(durationMs: 160): void {
    if (durationMs !== 160) throw new RangeError('Shelter death presentation must last 160ms');
  }

  feedbackSnapshot(): {
    readonly flashRemainingMs: number;
    readonly recoilRemainingMs: number;
    readonly recoilOffset: Point;
    readonly popScale: number;
  } {
    const progress = this.recoilProgress();
    return {
      flashRemainingMs: this.flashRemainingMs,
      recoilRemainingMs: this.recoilState?.remainingMs ?? 0,
      recoilOffset: this.recoilState === undefined ? { x: 0, y: 0 } : {
        x: this.recoilState.direction.x * this.recoilState.distancePx * progress,
        y: this.recoilState.direction.y * this.recoilState.distancePx * progress,
      },
      popScale: this.recoilState === undefined
        ? 1
        : 1 + (this.recoilState.popScale - 1) * progress,
    };
  }

  stepSimulation(stepMs: number): void {
    this.stepShake(stepMs, 'damage', SHAKE_DURATION_MS);
    this.stepFeedback(stepMs);
  }

  stepFailedHold(stepMs: number): void {
    this.stepShake(stepMs, 'failedHold', FAILED_HOLD_MS);
    this.stepFeedback(stepMs);
  }

  private stepShake(stepMs: number, kind: ShakeKind, durationMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Shelter shake step must be finite and non-negative');
    }
    if (this.destroyed || this.shakeElapsedMs === undefined || this.shakeKind !== kind) return;
    const nextElapsedMs = this.shakeElapsedMs + stepMs;
    if (reachedDuration(nextElapsedMs, durationMs)) {
      this.shakeElapsedMs = undefined;
      this.shakeKind = undefined;
      this.setShelterX(SHELTER_X);
      return;
    }
    this.shakeElapsedMs = nextElapsedMs;
    this.setShelterX(SHELTER_X + shelterShakeOffsetAt(nextElapsedMs % SHAKE_DURATION_MS));
  }

  shakeOffsetSnapshot(): number {
    return this.shakeElapsedMs === undefined
      ? 0
      : shelterShakeOffsetAt(this.shakeElapsedMs % SHAKE_DURATION_MS);
  }

  shakeElapsedSnapshot(): number | null {
    return this.shakeElapsedMs ?? null;
  }

  reset(): void {
    if (this.destroyed) return;
    this.shakeElapsedMs = undefined;
    this.shakeKind = undefined;
    this.flashRemainingMs = 0;
    this.recoilState = undefined;
    this.setShelterX(SHELTER_X);
    this.sprite.setScale(SHELTER_BASE_SCALE);
    this.hp.reset(1000, 1000, SHELTER_X, SHELTER_Y);
    this.render('healthy', 1000, 1000);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.shakeElapsedMs = undefined;
    this.shakeKind = undefined;
    this.flashRemainingMs = 0;
    this.recoilState = undefined;
    this.setShelterX(SHELTER_X);
    this.sprite.destroy();
    this.hp.destroy();
    this.destroyed = true;
  }

  private setShelterX(x: number): void {
    this.sprite.setX(x);
    this.hp.moveTo(x, SHELTER_Y);
  }

  private stepFeedback(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'Shelter feedback stepMs');
    if (this.destroyed) return;
    this.flashRemainingMs = Math.max(0, this.flashRemainingMs - stepMs);
    this.hp.step(stepMs);
    if (this.recoilState !== undefined) {
      this.recoilState.remainingMs = Math.max(0, this.recoilState.remainingMs - stepMs);
      if (this.recoilState.remainingMs === 0) this.recoilState = undefined;
    }
    this.applyFeedbackTransform();
  }

  private applyFeedbackTransform(): void {
    const feedback = this.feedbackSnapshot();
    const shake = this.shakeElapsedMs === undefined
      ? 0
      : shelterShakeOffsetAt(this.shakeElapsedMs % SHAKE_DURATION_MS);
    this.setShelterX(SHELTER_X + shake + feedback.recoilOffset.x);
    this.sprite.setScale(SHELTER_BASE_SCALE * feedback.popScale);
  }

  private recoilProgress(): number {
    if (this.recoilState === undefined || this.recoilState.durationMs === 0) return 0;
    return this.recoilState.remainingMs / this.recoilState.durationMs;
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}

function assertPoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}
