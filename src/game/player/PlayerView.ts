import type Phaser from 'phaser';
import { animationEntry, animationFrameAt } from '../assets/AnimationManifest';
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
import { idleBreathScale } from '../world/AnimationFrameResolver';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';
import type { PlayerSnapshot } from './PlayerTypes';
import type { ImpactFeedbackTarget } from '../enemies/ImpactFeedbackTarget';
import { PlayerHpView } from './PlayerHpView';

const WALK_ENTRY = animationEntry(AssetKeys.huchuWalk);
const ATTACK_ENTRY = animationEntry(AssetKeys.huchuAttack);
const TAIL_BODY_ENTRY = animationEntry(AssetKeys.huchuTailSwipe);
const TAIL_OVERLAY_ENTRY = animationEntry(AssetKeys.huchuTailOverlay);
const BASE_SCALE = HUCHU_PRESENTATION.dogOpaqueHeightLogical / WALK_ENTRY.opaqueHeightPx;
const HUCHU_MOUTH_OFFSET_X = 32;
const HUCHU_MOUTH_OFFSET_Y = -45;
const HUCHU_RUMP_OFFSET_X = -14;
const HUCHU_RUMP_OFFSET_Y = -45;
const TAIL_ROOT_X = 202;
const TAIL_ROOT_Y = 150;
const TAIL_ROOT_ORIGIN_X = TAIL_ROOT_X / 256;
const TAIL_ROOT_ORIGIN_Y = TAIL_ROOT_Y / 256;
export const TAIL_SWIPE_VISUAL_SCALE = 2;
export const TAIL_SWIPE_LAST_FRAME_HOLD_MS = 800;
export const TAIL_SWIPE_SWEEP_MS = 250;
export const TAIL_SWIPE_BODY_DURATION_MS =
  (TAIL_OVERLAY_ENTRY.frameCount - 1) * 1000 / TAIL_OVERLAY_ENTRY.fps
  + TAIL_SWIPE_LAST_FRAME_HOLD_MS;
export const BARK_WAVE_POOL_CAPACITY = BALANCE.caps.particles;
export { BARK_WAVE_CONE_DEGREES, BARK_WAVE_DURATION_MS, barkWaveVisualAt };
export type { BarkWaveVisual };

export function tailOverlayRoot(position: Point, facingLeft: boolean): Point {
  return {
    x: position.x + (facingLeft ? -HUCHU_RUMP_OFFSET_X : HUCHU_RUMP_OFFSET_X),
    y: position.y + HUCHU_RUMP_OFFSET_Y,
  };
}

export interface TailSweepTransform {
  readonly rootOffset: Point;
  readonly rotationDeg: number;
}

export function tailSweepTransformAt(
  elapsedMs: number,
  facingLeft: boolean,
): TailSweepTransform {
  assertFiniteNonNegative(elapsedMs, 'Tail sweep elapsedMs');
  const progress = Math.min(1, elapsedMs / TAIL_SWIPE_SWEEP_MS);
  const rotationDeg = 180 * (1 - progress);
  return {
    rootOffset: { x: 0, y: 0 },
    rotationDeg: facingLeft ? -rotationDeg : rotationDeg,
  };
}

function tailOverlayOriginX(facingLeft: boolean): number {
  return facingLeft ? 1 - TAIL_ROOT_ORIGIN_X : TAIL_ROOT_ORIGIN_X;
}

export interface PlayerRenderSnapshot extends PlayerSnapshot {
  readonly worldAnimationMs: number;
  readonly moving: boolean;
  readonly barkElapsedMs?: number;
  readonly bodyAction?: {
    readonly kind: 'tailSwipe' | 'aquaBeam';
    readonly elapsedMs: number;
  };
}

export class PlayerView implements ImpactFeedbackTarget {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly tailSprite: Phaser.GameObjects.Sprite;
  private readonly hp: PlayerHpView;
  private position: Point;
  private facingLeft = false;
  private tailActive = false;
  private tailSweepTransform: TailSweepTransform = {
    rootOffset: { x: 0, y: 0 },
    rotationDeg: 0,
  };
  private flashRemainingMs = 0;
  private defeatedHold = false;
  private recoilState: {
    readonly direction: Point;
    readonly distancePx: number;
    readonly popScale: number;
    readonly durationMs: number;
    remainingMs: number;
  } | undefined;

  constructor(
    scene: Phaser.Scene,
    initial: PlayerSnapshot,
    private readonly effects: CombatEffectPool,
  ) {
    this.sprite = scene.add
      .sprite(initial.x, initial.y, AssetKeys.huchuWalk, 0)
      .setOrigin(0.5, 1)
      .setScale(BASE_SCALE)
      .setDepth(initial.y);
    this.tailSprite = scene.add
      .sprite(initial.x, initial.y, AssetKeys.huchuTailOverlay, 0)
      .setOrigin(TAIL_ROOT_ORIGIN_X, TAIL_ROOT_ORIGIN_Y)
      .setScale(BASE_SCALE * TAIL_SWIPE_VISUAL_SCALE)
      .setVisible(false)
      .setDepth(initial.y + 0.1);
    this.position = { x: initial.x, y: initial.y };
    this.hp = new PlayerHpView(scene, initial.x, initial.y);
  }

  render(snapshot: PlayerRenderSnapshot): void {
    this.position = { x: snapshot.x, y: snapshot.y };
    const attacking = snapshot.bodyAction !== undefined || snapshot.barkElapsedMs !== undefined;
    this.tailActive = snapshot.bodyAction?.kind === 'tailSwipe';
    const entry = this.tailActive
      ? TAIL_BODY_ENTRY
      : attacking ? ATTACK_ENTRY : WALK_ENTRY;
    const frame = animationFrameAt(
      entry,
      snapshot.bodyAction?.elapsedMs
        ?? (snapshot.barkElapsedMs !== undefined
          ? snapshot.barkElapsedMs
          : snapshot.moving ? snapshot.worldAnimationMs : 0),
    );
    const breathScale = snapshot.moving || attacking
      ? 1
      : idleBreathScale(snapshot.worldAnimationMs);
    this.sprite
      .setPosition(snapshot.x, snapshot.y)
      .setTexture(entry.key)
      .setFrame(frame)
      .setFlipX(this.facingLeft)
      .setScale(BASE_SCALE * breathScale)
      .setDepth(snapshot.y);
    if (this.tailActive) {
      this.tailSweepTransform = tailSweepTransformAt(
        snapshot.bodyAction?.elapsedMs ?? 0,
        this.facingLeft,
      );
      this.tailSprite
        .setTexture(TAIL_OVERLAY_ENTRY.key)
        .setFrame(animationFrameAt(
          TAIL_OVERLAY_ENTRY,
          snapshot.bodyAction?.elapsedMs ?? 0,
        ))
        .setOrigin(tailOverlayOriginX(this.facingLeft), TAIL_ROOT_ORIGIN_Y)
        .setFlipX(this.facingLeft)
        .setVisible(true)
        .setDepth(snapshot.y + 0.1);
    } else {
      this.tailSweepTransform = { rootOffset: { x: 0, y: 0 }, rotationDeg: 0 };
      this.tailSprite.setVisible(false).setAngle(0);
    }
    this.applyFeedbackTransform(BASE_SCALE * breathScale);
    this.hp.render(
      this.lastHealth.current,
      this.lastHealth.maximum,
      snapshot.x,
      snapshot.y,
    );
  }

  showBarkWave(origin: Point, target: Point): boolean {
    return this.effects.showBarkWave(origin, target);
  }

  attackOrigin(origin: Point, target: Point): Point {
    const flipX = target.x < origin.x;
    this.facingLeft = flipX;
    this.sprite.setFlipX(flipX);
    return {
      x: origin.x + (flipX ? -HUCHU_MOUTH_OFFSET_X : HUCHU_MOUTH_OFFSET_X),
      y: origin.y + HUCHU_MOUTH_OFFSET_Y,
    };
  }

  stepSimulation(stepMs: number): void {
    this.effects.step(stepMs);
    this.stepImpactFeedback(stepMs);
  }

  stepImpactFeedback(stepMs: number): void {
    this.stepFeedback(stepMs);
    this.hp.step(stepMs);
  }

  private lastHealth = { current: 1000, maximum: 1000 };

  renderHealth(current: number, maximum: number): void {
    this.lastHealth = { current, maximum };
    this.hp.render(current, maximum, this.position.x, this.position.y);
  }

  getFeedbackAnchor(): Point {
    return { ...this.position };
  }

  flash(durationMs: number): void {
    assertFiniteNonNegative(durationMs, 'Player flash durationMs');
    this.flashRemainingMs = durationMs;
    this.sprite.setTint(0xfff2ee);
    this.hp.flashRed(durationMs);
  }

  recoil(input: {
    readonly direction: Point;
    readonly distancePx: number;
    readonly popScale: number;
    readonly durationMs: number;
  }): void {
    assertPoint(input.direction, 'Player recoil direction');
    assertFiniteNonNegative(input.distancePx, 'Player recoil distancePx');
    assertFiniteNonNegative(input.durationMs, 'Player recoil durationMs');
    if (!Number.isFinite(input.popScale) || input.popScale <= 0) {
      throw new RangeError('Player recoil popScale must be finite and positive');
    }
    this.recoilState = {
      direction: { ...input.direction },
      distancePx: input.distancePx,
      popScale: input.popScale,
      durationMs: input.durationMs,
      remainingMs: input.durationMs,
    };
    this.applyFeedbackTransform(BASE_SCALE);
  }

  beginDeath(durationMs: 160): void {
    if (durationMs !== 160) throw new RangeError('Player death presentation must last 160ms');
  }

  showDefeatedHold(): void {
    this.defeatedHold = true;
    this.sprite.setAlpha(0.72);
  }

  feedbackSnapshot(): {
    readonly flashRemainingMs: number;
    readonly recoilRemainingMs: number;
    readonly defeatedHold: boolean;
  } {
    return {
      flashRemainingMs: this.flashRemainingMs,
      recoilRemainingMs: this.recoilState?.remainingMs ?? 0,
      defeatedHold: this.defeatedHold,
    };
  }

  resetCombatVisuals(): void {
    this.effects.releaseType('bark');
    this.resetImpactVisuals();
  }

  resetImpactVisuals(): void {
    this.flashRemainingMs = 0;
    this.recoilState = undefined;
    this.defeatedHold = false;
    this.sprite.clearTint().setAlpha(1);
    this.tailActive = false;
    this.tailSprite.setVisible(false).setAlpha(1);
    this.hp.reset(1000, 1000, this.position.x, this.position.y);
  }

  effectPoolSnapshot(): PoolSnapshot {
    return this.effects.snapshot();
  }

  effectAgesSnapshot(): readonly number[] {
    return this.effects.effectAges('bark');
  }

  destroy(): void {
    this.sprite.removeAllListeners();
    this.tailSprite.removeAllListeners();
    this.hp.destroy();
  }

  private stepFeedback(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'Player feedback stepMs');
    const hadFlash = this.flashRemainingMs > 0;
    this.flashRemainingMs = Math.max(0, this.flashRemainingMs - stepMs);
    if (hadFlash && this.flashRemainingMs === 0) this.sprite.clearTint();
    if (this.recoilState !== undefined) {
      this.recoilState.remainingMs = Math.max(0, this.recoilState.remainingMs - stepMs);
      if (this.recoilState.remainingMs === 0) this.recoilState = undefined;
    }
    this.applyFeedbackTransform(BASE_SCALE);
  }

  private applyFeedbackTransform(baseScale: number): void {
    const recoil = this.recoilState;
    const progress = recoil === undefined || recoil.durationMs === 0
      ? 0
      : recoil.remainingMs / recoil.durationMs;
    this.sprite
      .setPosition(
        this.position.x + (recoil?.direction.x ?? 0) * (recoil?.distancePx ?? 0) * progress,
        this.position.y + (recoil?.direction.y ?? 0) * (recoil?.distancePx ?? 0) * progress,
      )
      .setScale(baseScale * (1 + ((recoil?.popScale ?? 1) - 1) * progress))
      .setAlpha(this.defeatedHold ? 0.72 : 1);
    if (this.tailActive) {
      const tailRoot = tailOverlayRoot(this.position, this.facingLeft);
      const recoilX = (recoil?.direction.x ?? 0) * (recoil?.distancePx ?? 0) * progress;
      const recoilY = (recoil?.direction.y ?? 0) * (recoil?.distancePx ?? 0) * progress;
      const popScale = 1 + ((recoil?.popScale ?? 1) - 1) * progress;
      this.tailSprite
        .setPosition(
          tailRoot.x + this.tailSweepTransform.rootOffset.x + recoilX,
          tailRoot.y + this.tailSweepTransform.rootOffset.y + recoilY,
        )
        .setAngle(this.tailSweepTransform.rotationDeg)
        .setScale(BASE_SCALE * TAIL_SWIPE_VISUAL_SCALE * popScale)
        .setFlipX(this.facingLeft)
        .setAlpha(this.defeatedHold ? 0.72 : 1);
    }
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
