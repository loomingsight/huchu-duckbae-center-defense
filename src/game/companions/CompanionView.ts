import type Phaser from 'phaser';
import {
  animationEntry,
  animationFrameAt,
  type AnimationManifestEntry,
} from '../assets/AnimationManifest';
import { AssetKeys } from '../assets/AssetKeys';
import type { Point } from '../world/Geometry';
import type { CompanionSnapshot } from './CompanionSystem';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';
import { secondaryMotionAt } from '../presentation/ActorMotion';

const FOLLOW_BEHIND_LOGICAL = 62;
const FOLLOW_LEFT_LOGICAL = 18;
const FOLLOW_SMOOTHING_MS = 100;
const DEFAULT_FACING = { x: 0, y: -1 } as const;
const WALK_ENTRY = animationEntry(AssetKeys.deokbaeWalk);
const ATTACK_ENTRY = animationEntry(AssetKeys.deokbaeAttack);
const BODY_SCALE = HUCHU_PRESENTATION.dogOpaqueHeightLogical / WALK_ENTRY.opaqueHeightPx;
const ATTACK_IMPACT_ELAPSED_MS = (ATTACK_ENTRY.eventFrame ?? 0) / ATTACK_ENTRY.fps * 1000;

export interface CompanionPoseInput {
  readonly player: Point;
  readonly facing: Point;
}

export interface CompanionRenderSnapshot extends CompanionPoseInput {
  readonly companion: CompanionSnapshot;
  readonly moving: boolean;
  readonly worldAnimationMs: number;
  readonly renderDeltaMs: number;
  readonly reducedMotion: boolean;
}

export interface CompanionViewSnapshot {
  readonly position: Point;
  readonly bodyScale: number;
  readonly attacking: boolean;
  readonly attackCastId: string | null;
  readonly attackElapsedMs: number | null;
}

interface ActiveAttack {
  readonly castId: string;
  elapsedMs: number;
}

export function companionTargetPose(player: Point, facing: Point): Point {
  assertPoint(player, 'Companion player');
  assertPoint(facing, 'Companion facing');
  const length = Math.hypot(facing.x, facing.y);
  const forward = length === 0
    ? DEFAULT_FACING
    : { x: facing.x / length, y: facing.y / length };
  const left = { x: forward.y, y: -forward.x };
  return {
    x: player.x - forward.x * FOLLOW_BEHIND_LOGICAL + left.x * FOLLOW_LEFT_LOGICAL,
    y: player.y - forward.y * FOLLOW_BEHIND_LOGICAL + left.y * FOLLOW_LEFT_LOGICAL,
  };
}

export function smoothCompanionPose(
  current: Point,
  target: Point,
  deltaMs: number,
): Point {
  assertPoint(current, 'Companion current pose');
  assertPoint(target, 'Companion target pose');
  assertFiniteNonNegative(deltaMs, 'Companion render deltaMs');
  const alpha = 1 - Math.exp(-deltaMs / FOLLOW_SMOOTHING_MS);
  return {
    x: current.x + (target.x - current.x) * alpha,
    y: current.y + (target.y - current.y) * alpha,
  };
}

export class CompanionView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Sprite;
  private position: Point;
  private presentationElapsedMs = 0;
  private activeAttack: ActiveAttack | undefined;
  private destroyed = false;

  constructor(scene: Phaser.Scene, initial: CompanionPoseInput) {
    this.position = companionTargetPose(initial.player, initial.facing);
    this.body = scene.add
      .sprite(0, 0, AssetKeys.deokbaeWalk, 0)
      .setOrigin(0.5, 1)
      .setScale(BODY_SCALE);
    this.root = scene.add
      .container(this.position.x, this.position.y, [this.body])
      .setDepth(this.position.y);
  }

  render(snapshot: CompanionRenderSnapshot): void {
    if (this.destroyed) return;
    assertFiniteNonNegative(snapshot.worldAnimationMs, 'Companion world animationMs');
    assertFiniteNonNegative(snapshot.renderDeltaMs, 'Companion render deltaMs');
    const target = companionTargetPose(snapshot.player, snapshot.facing);
    this.position = smoothCompanionPose(this.position, target, snapshot.renderDeltaMs);
    this.presentationElapsedMs += snapshot.renderDeltaMs;

    let entry: AnimationManifestEntry = WALK_ENTRY;
    let animationElapsedMs = snapshot.moving ? snapshot.worldAnimationMs : 0;
    if (this.activeAttack !== undefined) {
      entry = ATTACK_ENTRY;
      animationElapsedMs = this.activeAttack.elapsedMs;
    }

    const secondary = secondaryMotionAt(
      this.presentationElapsedMs,
      snapshot.reducedMotion,
    );
    this.root
      .setPosition(this.position.x, this.position.y)
      .setDepth(this.position.y)
      .setActive(snapshot.companion.active)
      .setVisible(snapshot.companion.active);
    this.body
      .setTexture(entry.key)
      .setFrame(animationFrameAt(entry, animationElapsedMs))
      .setPosition(0, secondary.bobY)
      .setRotation(secondary.tiltRad)
      .setScale(BODY_SCALE, BODY_SCALE * secondary.scaleY)
      .setActive(snapshot.companion.active)
      .setVisible(snapshot.companion.active);
  }

  startAttack(castId: string): void {
    if (this.destroyed) return;
    assertCastId(castId);
    if (this.activeAttack?.castId === castId) return;
    this.activeAttack = { castId, elapsedMs: 0 };
    this.body.setTexture(ATTACK_ENTRY.key).setFrame(0);
  }

  stepSimulation(stepMs: number): void {
    if (this.destroyed) return;
    assertFiniteNonNegative(stepMs, 'Companion simulation stepMs');
    if (this.activeAttack === undefined) return;
    const nextElapsedMs = this.activeAttack.elapsedMs + stepMs;
    if (nextElapsedMs >= animationDurationMs(ATTACK_ENTRY)) {
      this.activeAttack = undefined;
      return;
    }
    this.activeAttack.elapsedMs = nextElapsedMs;
  }

  syncAttackImpact(castId: string): void {
    if (this.destroyed) return;
    assertCastId(castId);
    if (this.activeAttack?.castId !== castId) return;
    this.activeAttack.elapsedMs = ATTACK_IMPACT_ELAPSED_MS;
  }

  snapPose(input: CompanionPoseInput): void {
    if (this.destroyed) return;
    this.position = companionTargetPose(input.player, input.facing);
    this.root
      .setPosition(this.position.x, this.position.y)
      .setDepth(this.position.y);
  }

  reset(input: CompanionPoseInput): void {
    if (this.destroyed) return;
    this.snapPose(input);
    this.presentationElapsedMs = 0;
    this.activeAttack = undefined;
    this.root
      .removeAllListeners()
      .setActive(true)
      .setVisible(true);
    this.body
      .removeAllListeners()
      .setTexture(WALK_ENTRY.key)
      .setFrame(0)
      .setOrigin(0.5, 1)
      .setPosition(0, 0)
      .setRotation(0)
      .setScale(BODY_SCALE)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
  }

  snapshot(): CompanionViewSnapshot {
    return {
      position: { ...this.position },
      bodyScale: BODY_SCALE,
      attacking: this.activeAttack !== undefined,
      attackCastId: this.activeAttack?.castId ?? null,
      attackElapsedMs: this.activeAttack?.elapsedMs ?? null,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.activeAttack = undefined;
    this.body.removeAllListeners();
    this.root.removeAllListeners().destroy(true);
  }
}

function animationDurationMs(entry: AnimationManifestEntry): number {
  return entry.frameCount / entry.fps * 1000;
}

function assertPoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}

function assertCastId(castId: string): void {
  if (castId.length === 0) throw new RangeError('Companion castId must not be empty');
}
