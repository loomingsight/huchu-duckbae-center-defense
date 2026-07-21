import type Phaser from 'phaser';
import {
  animationEntry,
  animationFrameAt,
  type AnimationManifestEntry,
} from '../assets/AnimationManifest';
import { AssetKeys } from '../assets/AssetKeys';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';
import { secondaryMotionAt } from '../presentation/ActorMotion';
import type {
  EnemyKind,
  EnemyState,
  EnemyVariant,
} from '../types/GameTypes';
import type { Point } from '../world/Geometry';
import type {
  CompositeEnemyRig,
  CompositeEnemyRigFactory,
} from './CompositeEnemyRig';
import type { EnemySnapshot } from './EnemyTypes';
import type { ImpactFeedbackTarget } from './ImpactFeedbackTarget';

export const ENEMY_FRAME_WIDTH = 256;
export const ENEMY_FRAME_HEIGHT = 256;
const DEFAULT_TEXTURE = AssetKeys.poopMaleWalk;
const DEFAULT_DISPLAY_HEIGHT = HUCHU_PRESENTATION.regularEnemyOpaqueHeightLogical;

export type EnemyAnimationAction = 'walk' | 'attack';

export interface EnemyAnimationSnapshot {
  readonly action: EnemyAnimationAction;
  readonly textureKey: string;
  readonly frame: number;
  readonly fps: number;
  readonly entry?: AnimationManifestEntry;
}

interface EnemyAnimationClockSample {
  readonly enemyId: number;
  readonly state: EnemyState;
  readonly rawElapsedMs: number;
  readonly moveSpeedMultiplier: number;
  readonly slowRemainingMs: number;
}

export class EnemyMovementAnimationClock {
  private movementElapsedMs = 0;
  private previous: EnemyAnimationClockSample | undefined;

  elapsedFor(snapshot: EnemySnapshot): number {
    validateElapsed(snapshot.animationElapsedMs);
    if (!Number.isFinite(snapshot.moveSpeedMultiplier) || snapshot.moveSpeedMultiplier <= 0) {
      throw new RangeError('Enemy moveSpeedMultiplier must be finite and positive');
    }
    assertFiniteNonNegative(snapshot.slowRemainingMs, 'Enemy slowRemainingMs');

    const previous = this.previous;
    if (snapshot.state === 'moving') {
      const shouldSync = previous === undefined ||
        previous.enemyId !== snapshot.id ||
        previous.state !== 'moving' ||
        snapshot.animationElapsedMs < previous.rawElapsedMs;
      if (shouldSync) {
        this.movementElapsedMs = snapshot.animationElapsedMs * snapshot.moveSpeedMultiplier;
      } else {
        const rawDeltaMs = snapshot.animationElapsedMs - previous.rawElapsedMs;
        this.movementElapsedMs += movementAnimationDelta(rawDeltaMs, previous);
      }
    }

    this.previous = {
      enemyId: snapshot.id,
      state: snapshot.state,
      rawElapsedMs: snapshot.animationElapsedMs,
      moveSpeedMultiplier: snapshot.moveSpeedMultiplier,
      slowRemainingMs: snapshot.slowRemainingMs,
    };
    return snapshot.state === 'moving'
      ? this.movementElapsedMs
      : snapshot.animationElapsedMs;
  }

  reset(): void {
    this.movementElapsedMs = 0;
    this.previous = undefined;
  }
}

export function enemyWalkFrameAt(elapsedMs: number, fps = 10): number {
  return frameAtFps(elapsedMs, 6, fps, true);
}

export function enemyAttackFrameAt(elapsedMs: number, frameCount = 8, fps = 10): number {
  return frameAtFps(elapsedMs, frameCount, fps, false);
}

export function enemyFrameAt(state: EnemyState, elapsedMs: number): number {
  switch (state) {
    case 'moving':
      return enemyWalkFrameAt(elapsedMs);
    case 'windup':
    case 'holding':
      return enemyAttackFrameAt(elapsedMs);
    case 'dead':
      validateElapsed(elapsedMs);
      return 7;
    default:
      throw new RangeError(`Unknown enemy state ${String(state)}`);
  }
}

export function enemyDisplayHeight(kind: EnemyKind): number {
  switch (kind) {
    case 'poopGuardian':
    case 'offLeashGuardian':
      return HUCHU_PRESENTATION.regularEnemyOpaqueHeightLogical;
    case 'dogTrader':
    case 'illegalBreeder':
      return HUCHU_PRESENTATION.bossOpaqueHeightLogical;
    default:
      throw new RangeError(`Unknown enemy kind ${String(kind)}`);
  }
}

export function enemyTextureKey(
  kind: EnemyKind,
  variant: EnemyVariant,
  action: EnemyAnimationAction = 'walk',
): string {
  if (variant !== 'male' && variant !== 'female') {
    throw new RangeError(`Unknown enemy variant ${String(variant)}`);
  }
  switch (kind) {
    case 'poopGuardian':
      return variant === 'male'
        ? action === 'walk' ? AssetKeys.poopMaleWalk : AssetKeys.poopMaleAttack
        : action === 'walk' ? AssetKeys.poopFemaleWalk : AssetKeys.poopFemaleAttack;
    case 'offLeashGuardian':
      return variant === 'male'
        ? action === 'walk' ? AssetKeys.offLeashMaleWalk : AssetKeys.offLeashMaleAttack
        : action === 'walk' ? AssetKeys.offLeashFemaleWalk : AssetKeys.offLeashFemaleAttack;
    case 'dogTrader':
      return AssetKeys.trader;
    case 'illegalBreeder':
      return variant === 'male'
        ? action === 'walk' ? AssetKeys.breederMaleWalk : AssetKeys.breederMaleAttack
        : action === 'walk' ? AssetKeys.breederFemaleWalk : AssetKeys.breederFemaleAttack;
    default:
      throw new RangeError(`Unknown enemy kind ${String(kind)}`);
  }
}

export function enemyAnimation(
  snapshot: EnemySnapshot,
  movementElapsedMs = snapshot.animationElapsedMs * snapshot.moveSpeedMultiplier,
): EnemyAnimationSnapshot {
  validateElapsed(snapshot.animationElapsedMs);
  validateElapsed(movementElapsedMs);
  const action: EnemyAnimationAction = snapshot.state === 'moving' ? 'walk' : 'attack';
  const textureKey = enemyTextureKey(snapshot.kind, snapshot.variant, action);
  if (snapshot.kind === 'dogTrader') {
    const fps = action === 'walk' ? 10 * snapshot.moveSpeedMultiplier : 10;
    return {
      action,
      textureKey,
      fps,
      frame: snapshot.state === 'dead'
        ? 7
        : action === 'walk'
          ? enemyWalkFrameAt(movementElapsedMs)
          : enemyAttackFrameAt(snapshot.animationElapsedMs, 8, fps),
    };
  }
  const entry = animationEntry(textureKey);
  const fps = action === 'walk' ? entry.fps * snapshot.moveSpeedMultiplier : entry.fps;
  const frame = snapshot.state === 'dead'
    ? entry.frameCount - 1
    : action === 'walk'
      ? frameAtFps(movementElapsedMs, entry.frameCount, entry.fps, entry.loop)
      : animationFrameAt(entry, snapshot.animationElapsedMs);
  return { action, textureKey, frame, fps, entry };
}

export class EnemyActor implements ImpactFeedbackTarget {
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly scene: Phaser.Scene;
  private readonly compositeRigFactory: CompositeEnemyRigFactory | undefined;
  private compositeRig: CompositeEnemyRig | undefined;
  private compositeRigActive = false;
  private readonly movementAnimationClock = new EnemyMovementAnimationClock();
  private renderedTextureKey: string | undefined;
  private renderedFrame: number | undefined;
  private bottomOriginApplied = false;
  private renderedDepth: number | undefined;
  private renderedSpriteActive: boolean | undefined;
  private renderedSpriteVisible: boolean | undefined;
  private renderedContainerActive: boolean | undefined;
  private renderedContainerVisible: boolean | undefined;
  private renderedContainerPosition: Point | undefined;
  private renderedContainerScale: number | undefined;
  private currentSnapshot: EnemySnapshot | undefined;
  private deathElapsedMs: number | undefined;
  private flashRemainingMs = 0;
  private recoilState: {
    readonly direction: Point;
    readonly distancePx: number;
    readonly popScale: number;
    readonly durationMs: number;
    remainingMs: number;
  } | undefined;

  constructor(scene: Phaser.Scene, compositeRigFactory?: CompositeEnemyRigFactory) {
    this.scene = scene;
    this.compositeRigFactory = compositeRigFactory;
    this.sprite = scene.add.sprite(0, 0, DEFAULT_TEXTURE, 0);
    this.container = scene.add.container(0, 0, [this.sprite]);
    this.reset();
  }

  bind(snapshot: EnemySnapshot): void {
    if (snapshot.kind !== 'dogTrader') this.deactivateCompositeRig();
    this.currentSnapshot = snapshot;
    if (snapshot.kind === 'dogTrader' && this.compositeRigFactory !== undefined) {
      this.compositeRig ??= this.compositeRigFactory(this.scene);
      this.compositeRigActive = true;
    }
  }

  render(snapshot: EnemySnapshot, deltaMs = 0): void {
    this.bind(snapshot);
    const displayHeight = enemyDisplayHeight(snapshot.kind);
    const effectiveAnimationElapsedMs = this.movementAnimationClock.elapsedFor(snapshot);
    const animation = enemyAnimation(snapshot, effectiveAnimationElapsedMs);
    const activeRig = this.activeCompositeRig();
    const usesComposite = activeRig !== undefined;
    if (usesComposite) {
      activeRig.render(snapshot, deltaMs);
    }
    const secondary = animation.action === 'walk'
      ? secondaryMotionAt(effectiveAnimationElapsedMs, false)
      : { bobY: 0, tiltRad: 0, scaleY: 1 };
    const scale = animation.entry === undefined
      ? displayHeight / ENEMY_FRAME_HEIGHT
      : displayHeight / animation.entry.opaqueHeightPx;
    this.syncSpriteIdentity(animation.textureKey, animation.frame);
    this.sprite
      .setPosition(0, secondary.bobY)
      .setRotation(secondary.tiltRad)
      .setScale(scale, scale * secondary.scaleY);
    this.syncSpriteVisibility(!usesComposite);
    this.syncContainerPosition(snapshot.position.x, snapshot.position.y);
    this.syncDepth(snapshot.position.y);
    this.syncContainerVisibility(true);
    if (this.recoilState !== undefined) this.applyFeedbackTransform(snapshot.position);
  }

  labelAnchor(): Point {
    const activeRig = this.activeCompositeRig();
    if (activeRig !== undefined) {
      return activeRig.humanAnchor();
    }
    return this.currentSnapshot === undefined
      ? { x: 0, y: 0 }
      : { ...this.currentSnapshot.position };
  }

  feedbackTarget(): ImpactFeedbackTarget {
    const activeRig = this.activeCompositeRig();
    return activeRig !== undefined
      ? activeRig
      : this;
  }

  snapCompositePose(): void {
    this.activeCompositeRig()?.snapNextPose();
  }

  getFeedbackAnchor(): Point {
    return this.labelAnchor();
  }

  flash(durationMs: number): void {
    assertFiniteNonNegative(durationMs, 'Enemy flash durationMs');
    this.flashRemainingMs = durationMs;
    this.sprite.setTint(0xffffff);
  }

  recoil(input: {
    readonly direction: Point;
    readonly distancePx: number;
    readonly popScale: number;
    readonly durationMs: number;
  }): void {
    assertPoint(input.direction, 'Enemy recoil direction');
    assertFiniteNonNegative(input.distancePx, 'Enemy recoil distancePx');
    assertFiniteNonNegative(input.durationMs, 'Enemy recoil durationMs');
    if (!Number.isFinite(input.popScale) || input.popScale <= 0) {
      throw new RangeError('Enemy recoil popScale must be finite and positive');
    }
    this.recoilState = {
      direction: { ...input.direction },
      distancePx: input.distancePx,
      popScale: input.popScale,
      durationMs: input.durationMs,
      remainingMs: input.durationMs,
    };
    this.applyFeedbackTransform(this.currentSnapshot?.position ?? { x: 0, y: 0 });
  }

  stepFeedback(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'Enemy feedback stepMs');
    const hadFlash = this.flashRemainingMs > 0;
    const hadRecoil = this.recoilState !== undefined;
    if (!hadFlash && !hadRecoil) return;
    this.flashRemainingMs = Math.max(0, this.flashRemainingMs - stepMs);
    if (hadFlash && this.flashRemainingMs === 0) this.sprite.clearTint();
    if (this.recoilState !== undefined) {
      this.recoilState.remainingMs = Math.max(0, this.recoilState.remainingMs - stepMs);
      if (this.recoilState.remainingMs === 0) this.recoilState = undefined;
    }
    if (hadRecoil) {
      this.applyFeedbackTransform(this.currentSnapshot?.position ?? { x: 0, y: 0 });
    }
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

  beginDeath(durationMs: 160): void {
    if (durationMs !== 160) throw new RangeError('Enemy death presentation must last 160ms');
    this.activeCompositeRig()?.beginDeath(durationMs);
    this.startDeathTimeline();
  }

  startDeathTimeline(): void {
    this.deathElapsedMs ??= 0;
  }

  stepDeath(stepMs: number): 'active' | 'release' {
    assertFiniteNonNegative(stepMs, 'Enemy death stepMs');
    if (this.deathElapsedMs === undefined) return 'active';
    this.deathElapsedMs += stepMs;
    if (this.deathElapsedMs >= 160) return 'release';
    const progress = this.deathElapsedMs / 160;
    const scale = progress < 0.25
      ? 1 + 0.12 * (progress / 0.25)
      : 1.12 * (1 - (progress - 0.25) / 0.75);
    this.syncContainerScale(Math.max(0, scale));
    return 'active';
  }

  reset(): void {
    this.deactivateCompositeRig();
    this.movementAnimationClock.reset();
    this.currentSnapshot = undefined;
    this.deathElapsedMs = undefined;
    this.flashRemainingMs = 0;
    this.recoilState = undefined;
    this.container.removeAllListeners();
    this.sprite.removeAllListeners();
    this.sprite.anims.stop();
    this.syncSpriteIdentity(DEFAULT_TEXTURE, 0);
    this.sprite
      .setScale(DEFAULT_DISPLAY_HEIGHT / 204)
      .setPosition(0, 0)
      .setRotation(0)
      .setAlpha(1)
      .clearTint()
      .setFlip(false, false)
      .setAngle(0);
    this.syncSpriteVisibility(false);
    this.syncContainerPosition(0, 0);
    this.syncDepth(0);
    this.container
      .setAlpha(1)
      .setAngle(0);
    this.syncContainerScale(1);
    this.syncContainerVisibility(false);
  }

  private applyFeedbackTransform(base: Point): void {
    const feedback = this.feedbackSnapshot();
    this.syncContainerPosition(
      base.x + feedback.recoilOffset.x,
      base.y + feedback.recoilOffset.y,
    );
    this.syncContainerScale(feedback.popScale);
  }

  private syncSpriteIdentity(textureKey: string, frame: number): void {
    if (this.renderedTextureKey !== textureKey) {
      this.sprite.setTexture(textureKey);
      this.renderedTextureKey = textureKey;
      this.renderedFrame = undefined;
    }
    if (this.renderedFrame !== frame) {
      this.sprite.setFrame(frame);
      this.renderedFrame = frame;
    }
    if (!this.bottomOriginApplied) {
      this.sprite.setOrigin(0.5, 1);
      this.bottomOriginApplied = true;
    }
  }

  private syncDepth(depth: number): void {
    if (this.renderedDepth === depth) return;
    this.container.setDepth(depth);
    this.renderedDepth = depth;
  }

  private syncSpriteVisibility(visible: boolean): void {
    if (this.renderedSpriteActive !== visible) {
      this.sprite.setActive(visible);
      this.renderedSpriteActive = visible;
    }
    if (this.renderedSpriteVisible !== visible) {
      this.sprite.setVisible(visible);
      this.renderedSpriteVisible = visible;
    }
  }

  private syncContainerVisibility(visible: boolean): void {
    if (this.renderedContainerActive !== visible) {
      this.container.setActive(visible);
      this.renderedContainerActive = visible;
    }
    if (this.renderedContainerVisible !== visible) {
      this.container.setVisible(visible);
      this.renderedContainerVisible = visible;
    }
  }

  private syncContainerPosition(x: number, y: number): void {
    if (this.renderedContainerPosition?.x === x && this.renderedContainerPosition.y === y) return;
    this.container.setPosition(x, y);
    this.renderedContainerPosition = { x, y };
  }

  private syncContainerScale(scale: number): void {
    if (this.renderedContainerScale === scale) return;
    this.container.setScale(scale);
    this.renderedContainerScale = scale;
  }

  private activeCompositeRig(): CompositeEnemyRig | undefined {
    return this.compositeRigActive && this.currentSnapshot?.kind === 'dogTrader'
      ? this.compositeRig
      : undefined;
  }

  private deactivateCompositeRig(): void {
    if (!this.compositeRigActive) return;
    this.compositeRig?.reset();
    this.compositeRigActive = false;
  }

  private recoilProgress(): number {
    if (this.recoilState === undefined) return 0;
    if (this.recoilState.durationMs === 0) return 0;
    return this.recoilState.remainingMs / this.recoilState.durationMs;
  }
}

function frameAtFps(
  elapsedMs: number,
  frameCount: number,
  fps: number,
  loop: boolean,
): number {
  validateElapsed(elapsedMs);
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('Enemy animation fps must be positive');
  const frame = Math.floor((elapsedMs + 1e-7) / (1000 / fps));
  return loop ? frame % frameCount : Math.min(frameCount - 1, frame);
}

function movementAnimationDelta(
  rawDeltaMs: number,
  previous: EnemyAnimationClockSample,
): number {
  if (rawDeltaMs <= 0) return 0;
  if (previous.slowRemainingMs <= 0 || previous.slowRemainingMs >= rawDeltaMs) {
    return rawDeltaMs * previous.moveSpeedMultiplier;
  }
  return previous.slowRemainingMs * previous.moveSpeedMultiplier +
    (rawDeltaMs - previous.slowRemainingMs);
}

function validateElapsed(elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Enemy animation elapsed time must be finite and non-negative');
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
