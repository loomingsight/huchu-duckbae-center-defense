import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
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
const BARK_WAVE_START_RADIUS = 26;
const BARK_WAVE_END_RADIUS = 82;

export const BARK_WAVE_POOL_CAPACITY = 8;
export const BARK_WAVE_DURATION_MS = 180;
export const BARK_WAVE_CONE_DEGREES = 70;

export interface BarkWaveVisual {
  readonly alpha: number;
  readonly radius: number;
  readonly rotation: number;
  readonly arcStart: number;
  readonly arcEnd: number;
}

export function barkWaveVisualAt(ageMs: number, origin: Point, target: Point): BarkWaveVisual {
  assertFiniteNonNegative(ageMs, 'Bark wave ageMs');
  assertPoint(origin, 'Bark wave origin');
  assertPoint(target, 'Bark wave target');
  const progress = Math.min(1, ageMs / BARK_WAVE_DURATION_MS);
  const halfCone = BARK_WAVE_CONE_DEGREES * Math.PI / 360;
  return {
    alpha: 1 - progress,
    radius: BARK_WAVE_START_RADIUS
      + (BARK_WAVE_END_RADIUS - BARK_WAVE_START_RADIUS) * progress,
    rotation: Math.atan2(target.y - origin.y, target.x - origin.x),
    arcStart: -halfCone,
    arcEnd: halfCone,
  };
}

export interface PlayerRenderSnapshot extends PlayerSnapshot {
  readonly worldAnimationMs: number;
  readonly moving: boolean;
  readonly barkElapsedMs?: number;
}

export class PlayerView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly wavePool: ObjectPool<BarkWaveEffect>;
  private readonly activeWaves = new Set<BarkWaveEffect>();

  constructor(scene: Phaser.Scene, initial: PlayerSnapshot) {
    this.sprite = scene.add
      .sprite(initial.x, initial.y, AssetKeys.huchu, 0)
      .setOrigin(0.5, 1)
      .setScale(BASE_SCALE)
      .setDepth(initial.y);
    this.wavePool = new ObjectPool(
      BARK_WAVE_POOL_CAPACITY,
      () => new BarkWaveEffect(scene.add.graphics()),
    );
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
    for (const wave of this.activeWaves) wave.render();
  }

  showBarkWave(origin: Point, target: Point): boolean {
    barkWaveVisualAt(0, origin, target);
    const wave = this.wavePool.acquire();
    if (wave === undefined) return false;
    wave.activate(origin, target);
    this.activeWaves.add(wave);
    return true;
  }

  stepSimulation(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'PlayerView simulation stepMs');
    for (const wave of [...this.activeWaves]) {
      wave.step(stepMs);
      if (!wave.expired) continue;
      this.activeWaves.delete(wave);
      wave.reset();
      this.wavePool.release(wave);
    }
  }

  resetCombatVisuals(): void {
    this.activeWaves.clear();
    this.wavePool.releaseAll((wave) => wave.reset());
  }

  effectPoolSnapshot(): PoolSnapshot {
    return this.wavePool.snapshot();
  }

  effectAgesSnapshot(): readonly number[] {
    return [...this.activeWaves].map((wave) => wave.ageSnapshot());
  }

  destroy(): void {
    this.resetCombatVisuals();
    this.sprite.removeAllListeners();
  }
}

class BarkWaveEffect {
  private ageMs = 0;
  private origin: Point = { x: 0, y: 0 };
  private target: Point = { x: 0, y: 0 };

  constructor(private readonly graphics: Phaser.GameObjects.Graphics) {
    this.reset();
  }

  activate(origin: Point, target: Point): void {
    barkWaveVisualAt(0, origin, target);
    this.ageMs = 0;
    this.origin = { ...origin };
    this.target = { ...target };
  }

  step(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'Bark wave stepMs');
    this.ageMs += stepMs;
  }

  render(): void {
    const visual = barkWaveVisualAt(this.ageMs, this.origin, this.target);
    this.graphics
      .clear()
      .lineStyle(5, 0xffef9a, 1)
      .beginPath()
      .arc(0, 0, visual.radius, visual.arcStart, visual.arcEnd)
      .strokePath()
      .setPosition(this.origin.x, this.origin.y)
      .setRotation(visual.rotation)
      .setDepth(this.origin.y + 1)
      .setAlpha(visual.alpha)
      .setActive(true)
      .setVisible(true);
  }

  reset(): void {
    this.ageMs = 0;
    this.origin = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.graphics.removeAllListeners();
    this.graphics
      .clear()
      .setPosition(0, 0)
      .setRotation(0)
      .setDepth(0)
      .setAlpha(1)
      .setActive(false)
      .setVisible(false);
  }

  get expired(): boolean {
    return this.ageMs >= BARK_WAVE_DURATION_MS;
  }

  ageSnapshot(): number {
    return this.ageMs;
  }
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
