import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import {
  reachedDuration,
  TIME_EPSILON_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../constants';
import { BALANCE } from '../data/balance';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import type { SkillCastVisual } from '../skills/SkillSystem';
import type { Point } from '../world/Geometry';
import type { ProjectileKind } from './ProjectileSystem';

export const BARK_WAVE_DURATION_MS = 180;
export const BARK_WAVE_CONE_DEGREES = 70;

const BARK_WAVE_START_RADIUS = 26;
const BARK_WAVE_END_RADIUS = 82;
const IMPACT_FADE_MS = 120;
const IMPACT_FRAME_MS = IMPACT_FADE_MS / 4;
const SCOLD_DURATION_MS = 180;
const BEAM_DURATION_MS = 180;
const HOWL_DURATION_MS = 500;
const SAFETY_DURATION_MS = 500;

export type CombatEffectType =
  | 'projectileImpact'
  | 'bark'
  | SkillCastVisual['kind'];

export interface ProjectileImpactSnapshot {
  readonly projectileId: number;
  readonly kind: ProjectileKind;
  readonly x: number;
  readonly y: number;
  readonly frame: number;
}

export interface CombatEffectSnapshot {
  readonly actorId: number;
  readonly type: CombatEffectType;
  readonly ageMs: number;
  readonly projectileId?: number;
  readonly projectileKind?: ProjectileKind;
  readonly position?: Point;
  readonly visual?: SkillCastVisual;
  readonly origin?: Point;
  readonly target?: Point;
}

export interface BarkWaveVisual {
  readonly alpha: number;
  readonly radius: number;
  readonly rotation: number;
  readonly arcStart: number;
  readonly arcEnd: number;
}

type EffectPayload =
  | {
    readonly type: 'projectileImpact';
    readonly projectileId: number;
    readonly projectileKind: ProjectileKind;
    readonly position: Point;
    readonly stressProfile?: true;
  }
  | {
    readonly type: 'bark';
    readonly origin: Point;
    readonly target: Point;
  }
  | {
    readonly type: 'skill';
    readonly visual: SkillCastVisual;
  };

export function projectileImpactFrameAt(elapsedMs: number): number {
  assertFiniteNonNegative(elapsedMs, 'Projectile impact elapsed time');
  return Math.min(3, Math.floor((elapsedMs + TIME_EPSILON_MS) / IMPACT_FRAME_MS));
}

export function deokbaeHowlFrameAt(elapsedMs: number): number {
  assertFiniteNonNegative(elapsedMs, 'Deokbae howl elapsed time');
  return Math.min(7, 4 + Math.floor((elapsedMs + TIME_EPSILON_MS) / 125));
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

export class CombatEffectPool {
  private readonly pool: ObjectPool<CombatEffectActor>;
  private readonly active = new Set<CombatEffectActor>();

  constructor(scene: Phaser.Scene) {
    let actorId = 0;
    this.pool = new ObjectPool(BALANCE.caps.particles, () => (
      new CombatEffectActor(actorId++, scene)
    ));
  }

  showProjectileImpact(
    projectileId: number,
    kind: ProjectileKind,
    position: Point,
  ): boolean {
    if (!Number.isSafeInteger(projectileId) || projectileId < 0) {
      throw new RangeError('Projectile impact id must be a non-negative safe integer');
    }
    assertPoint(position, 'Projectile impact position');
    return this.activate({
      type: 'projectileImpact',
      projectileId,
      projectileKind: kind,
      position: copyPoint(position),
    });
  }

  showBarkWave(origin: Point, target: Point): boolean {
    barkWaveVisualAt(0, origin, target);
    return this.activate({
      type: 'bark',
      origin: copyPoint(origin),
      target: copyPoint(target),
    });
  }

  showSkillCast(visual: SkillCastVisual): boolean {
    validateSkillVisual(visual);
    return this.activate({
      type: 'skill',
      visual: copySkillVisual(visual),
    });
  }

  step(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'Combat effect stepMs');
    for (const actor of [...this.active]) {
      if (actor.step(stepMs)) continue;
      this.release(actor);
    }
  }

  releaseType(type: CombatEffectType): void {
    for (const actor of [...this.active].reverse()) {
      if (actor.type !== type) continue;
      this.release(actor);
    }
  }

  releaseAll(): void {
    for (const actor of [...this.active].reverse()) this.release(actor);
  }

  seedStressForE2e(active: number): void {
    if (import.meta.env.MODE !== 'e2e') {
      throw new Error('Stress effect seeding is unavailable');
    }
    if (!Number.isSafeInteger(active) || active < 0 || active > this.pool.capacity) {
      throw new RangeError('Stress effect count exceeds the pool capacity');
    }
    this.releaseAll();
    this.maintainStressForE2e(active, true);
  }

  maintainStressForE2e(active: number, staggerInitial = false): void {
    if (import.meta.env.MODE !== 'e2e') {
      throw new Error('Stress effect maintenance is unavailable');
    }
    while (this.active.size < active) {
      const index = this.active.size;
      const activated = this.activate({
        type: 'projectileImpact',
        projectileId: 1_000_000 + index,
        projectileKind: 'poop',
        position: { x: -40 - index, y: 80 + index % 8 * 96 },
        stressProfile: true,
      }, staggerInitial ? index * IMPACT_FADE_MS / this.pool.capacity : 0);
      if (!activated) throw new Error('Combat effect pool exhausted during stress refill');
    }
  }

  snapshot(): PoolSnapshot {
    return this.pool.snapshot();
  }

  effectSnapshots(): readonly CombatEffectSnapshot[] {
    return [...this.active].map((actor) => actor.snapshot());
  }

  projectileImpactSnapshots(): readonly ProjectileImpactSnapshot[] {
    return [...this.active]
      .filter((actor) => actor.type === 'projectileImpact')
      .map((actor) => actor.projectileImpactSnapshot())
      .sort((left, right) => left.projectileId - right.projectileId);
  }

  effectAges(type: CombatEffectType): readonly number[] {
    return [...this.active]
      .filter((actor) => actor.type === type)
      .map((actor) => actor.ageMs);
  }

  private activate(payload: EffectPayload, initialAgeMs = 0): boolean {
    const actor = this.pool.acquire();
    if (actor === undefined) return false;
    actor.activate(payload, initialAgeMs);
    this.active.add(actor);
    return true;
  }

  private release(actor: CombatEffectActor): void {
    this.active.delete(actor);
    actor.reset();
    this.pool.release(actor);
  }
}

class CombatEffectActor {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private payload: EffectPayload | undefined;
  private elapsedMs = 0;

  constructor(readonly actorId: number, scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(1001);
    this.sprite = scene.add.sprite(0, 0, AssetKeys.deokbae, 4).setDepth(1002);
    this.reset();
  }

  activate(payload: EffectPayload, initialAgeMs = 0): void {
    this.payload = copyPayload(payload);
    this.elapsedMs = initialAgeMs;
    this.render();
  }

  step(stepMs: number): boolean {
    this.elapsedMs += stepMs;
    if (reachedDuration(this.elapsedMs, this.durationMs)) return false;
    if (this.payload?.type === 'projectileImpact' && this.payload.stressProfile) return true;
    this.render();
    return true;
  }

  snapshot(): CombatEffectSnapshot {
    const payload = this.requirePayload();
    if (payload.type === 'projectileImpact') {
      return {
        actorId: this.actorId,
        type: payload.type,
        ageMs: this.elapsedMs,
        projectileId: payload.projectileId,
        projectileKind: payload.projectileKind,
        position: copyPoint(payload.position),
      };
    }
    if (payload.type === 'bark') {
      return {
        actorId: this.actorId,
        type: payload.type,
        ageMs: this.elapsedMs,
        origin: copyPoint(payload.origin),
        target: copyPoint(payload.target),
      };
    }
    return {
      actorId: this.actorId,
      type: payload.visual.kind,
      ageMs: this.elapsedMs,
      visual: copySkillVisual(payload.visual),
    };
  }

  projectileImpactSnapshot(): ProjectileImpactSnapshot {
    const payload = this.requirePayload();
    if (payload.type !== 'projectileImpact') {
      throw new Error('Combat effect is not a projectile impact');
    }
    return {
      projectileId: payload.projectileId,
      kind: payload.projectileKind,
      x: payload.position.x,
      y: payload.position.y,
      frame: projectileImpactFrameAt(this.elapsedMs),
    };
  }

  reset(): void {
    this.payload = undefined;
    this.elapsedMs = 0;
    this.graphics
      .removeAllListeners()
      .clear()
      .setPosition(0, 0)
      .setRotation(0)
      .setScale(1)
      .setAlpha(1)
      .setActive(false)
      .setVisible(false);
    this.sprite
      .removeAllListeners()
      .setPosition(0, 0)
      .setRotation(0)
      .setDisplaySize(48, 64)
      .setAlpha(1)
      .setActive(false)
      .setVisible(false);
  }

  get type(): CombatEffectType | undefined {
    const payload = this.payload;
    if (payload === undefined) return undefined;
    return payload.type === 'skill' ? payload.visual.kind : payload.type;
  }

  get ageMs(): number {
    return this.elapsedMs;
  }

  private get durationMs(): number {
    const payload = this.requirePayload();
    if (payload.type === 'projectileImpact') return IMPACT_FADE_MS;
    if (payload.type === 'bark') return BARK_WAVE_DURATION_MS;
    if (payload.visual.kind === 'scold') return SCOLD_DURATION_MS;
    if (payload.visual.kind === 'aquaBeam') return BEAM_DURATION_MS;
    if (payload.visual.kind === 'deokbaeHowl') return HOWL_DURATION_MS;
    return SAFETY_DURATION_MS;
  }

  private requirePayload(): EffectPayload {
    if (this.payload === undefined) throw new Error('Combat effect actor is inactive');
    return this.payload;
  }

  private render(): void {
    const payload = this.requirePayload();
    this.graphics.clear().setAlpha(1).setActive(false).setVisible(false);
    this.sprite.setAlpha(1).setActive(false).setVisible(false);
    if (payload.type === 'projectileImpact') {
      this.renderProjectileImpact(payload);
    } else if (payload.type === 'bark') {
      this.renderCone(payload.origin, payload.target, BARK_WAVE_CONE_DEGREES, 82, 0xffef9a);
    } else if (payload.type === 'skill' && payload.visual.kind === 'scold') {
      const target = {
        x: payload.visual.origin.x + payload.visual.direction.x * payload.visual.length,
        y: payload.visual.origin.y + payload.visual.direction.y * payload.visual.length,
      };
      this.renderCone(
        payload.visual.origin,
        target,
        payload.visual.angleDeg,
        payload.visual.length,
        0xffa53d,
      );
    } else if (payload.type === 'skill' && payload.visual.kind === 'aquaBeam') {
      this.renderBeam(payload.visual);
    } else if (payload.type === 'skill' && payload.visual.kind === 'deokbaeHowl') {
      this.renderHowl(payload.visual);
    } else if (payload.type === 'skill' && payload.visual.kind === 'safetyReport') {
      this.renderSafety(payload.visual);
    } else {
      throw new Error('Unknown combat effect payload');
    }
  }

  private renderProjectileImpact(payload: Extract<EffectPayload, { type: 'projectileImpact' }>): void {
    if (
      payload.position.x < 0
      || payload.position.x > WORLD_WIDTH
      || payload.position.y < 0
      || payload.position.y > WORLD_HEIGHT
    ) {
      this.graphics
        .setPosition(payload.position.x, payload.position.y)
        .setActive(true)
        .setVisible(false);
      return;
    }
    const frame = projectileImpactFrameAt(this.elapsedMs);
    const alpha = [0.85, 0.65, 0.4, 0.2][frame]!;
    const scale = [0.75, 1, 1.2, 1.4][frame]!;
    if (payload.projectileKind === 'poop') {
      this.graphics.fillStyle(0x75421f, alpha).fillEllipse(0, 0, 18, 8);
    } else if (payload.projectileKind === 'net') {
      this.graphics.lineStyle(3, 0xf1d57a, alpha).strokeCircle(0, 0, 16);
    } else {
      this.graphics.lineStyle(4, 0x55f4ef, alpha).strokeCircle(0, 0, 14);
    }
    this.graphics
      .setPosition(payload.position.x, payload.position.y)
      .setScale(scale)
      .setActive(true)
      .setVisible(true);
  }

  private renderCone(
    origin: Point,
    target: Point,
    angleDeg: number,
    radius: number,
    color: number,
  ): void {
    const progress = this.type === 'bark'
      ? Math.min(1, this.elapsedMs / BARK_WAVE_DURATION_MS)
      : Math.min(1, this.elapsedMs / SCOLD_DURATION_MS);
    const half = angleDeg * Math.PI / 360;
    this.graphics
      .lineStyle(5, color, 1)
      .beginPath()
      .arc(0, 0, radius, -half, half)
      .strokePath()
      .setPosition(origin.x, origin.y)
      .setRotation(Math.atan2(target.y - origin.y, target.x - origin.x))
      .setAlpha(1 - progress)
      .setActive(true)
      .setVisible(true);
  }

  private renderBeam(visual: Extract<SkillCastVisual, { kind: 'aquaBeam' }>): void {
    const progress = Math.min(1, this.elapsedMs / BEAM_DURATION_MS);
    this.graphics
      .fillStyle(0x54e4e6, 0.85)
      .fillRoundedRect(0, -visual.width / 2, visual.length, visual.width, visual.width / 2)
      .setPosition(visual.origin.x, visual.origin.y)
      .setRotation(Math.atan2(visual.direction.y, visual.direction.x))
      .setAlpha(1 - progress)
      .setActive(true)
      .setVisible(true);
  }

  private renderHowl(visual: Extract<SkillCastVisual, { kind: 'deokbaeHowl' }>): void {
    const progress = Math.min(1, this.elapsedMs / HOWL_DURATION_MS);
    this.graphics
      .lineStyle(4, 0xffd76d, 1 - progress)
      .strokeCircle(visual.center.x, visual.center.y, visual.radius)
      .setActive(true)
      .setVisible(true);
    this.sprite
      .setTexture(AssetKeys.deokbae)
      .setFrame(deokbaeHowlFrameAt(this.elapsedMs))
      .setPosition(visual.center.x, visual.center.y)
      .setDisplaySize(48, 64)
      .setActive(true)
      .setVisible(true);
  }

  private renderSafety(visual: Extract<SkillCastVisual, { kind: 'safetyReport' }>): void {
    const progress = Math.min(1, this.elapsedMs / SAFETY_DURATION_MS);
    const dropProgress = Math.min(1, progress * 2);
    this.sprite
      .setTexture(AssetKeys.skillSafetyReport)
      .setFrame(0)
      .setPosition(visual.targetPosition.x, visual.targetPosition.y - 72 * (1 - dropProgress))
      .setDisplaySize(28, 28)
      .setActive(true)
      .setVisible(true);
    this.graphics.lineStyle(3, 0xffef9a, 1 - progress);
    for (let index = 0; index < 5; index += 1) {
      const angle = index * Math.PI * 2 / 5 - Math.PI / 2;
      const x = visual.targetPosition.x + Math.cos(angle) * 24;
      const y = visual.targetPosition.y - 24 + Math.sin(angle) * 12;
      this.graphics.strokeCircle(x, y, 3);
    }
    this.graphics.setActive(true).setVisible(true);
  }
}

function validateSkillVisual(visual: SkillCastVisual): void {
  if (visual.kind === 'scold' || visual.kind === 'aquaBeam') {
    assertPoint(visual.origin, 'Skill visual origin');
    assertPoint(visual.direction, 'Skill visual direction');
    return;
  }
  if (visual.kind === 'deokbaeHowl') {
    assertPoint(visual.center, 'Skill visual center');
    return;
  }
  assertPoint(visual.origin, 'Skill visual origin');
  assertPoint(visual.targetPosition, 'Skill visual target');
}

function copyPayload(payload: EffectPayload): EffectPayload {
  if (payload.type === 'projectileImpact') {
    return { ...payload, position: copyPoint(payload.position) };
  }
  if (payload.type === 'bark') {
    return { ...payload, origin: copyPoint(payload.origin), target: copyPoint(payload.target) };
  }
  return { type: 'skill', visual: copySkillVisual(payload.visual) };
}

function copySkillVisual(visual: SkillCastVisual): SkillCastVisual {
  if (visual.kind === 'scold' || visual.kind === 'aquaBeam') {
    return {
      ...visual,
      origin: copyPoint(visual.origin),
      direction: copyPoint(visual.direction),
      targetPositions: visual.targetPositions.map(({ targetId, position }) => ({
        targetId,
        position: copyPoint(position),
      })),
    };
  }
  if (visual.kind === 'deokbaeHowl') {
    return {
      ...visual,
      center: copyPoint(visual.center),
      targetPositions: visual.targetPositions.map(({ targetId, position }) => ({
        targetId,
        position: copyPoint(position),
      })),
    };
  }
  return {
    ...visual,
    origin: copyPoint(visual.origin),
    targetPosition: copyPoint(visual.targetPosition),
  };
}

function copyPoint(point: Point): Point {
  return { x: point.x, y: point.y };
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
