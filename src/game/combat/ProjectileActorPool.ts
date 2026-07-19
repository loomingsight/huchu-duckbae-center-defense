import type Phaser from 'phaser';
import { reachedDuration, TIME_EPSILON_MS } from '../constants';
import { BALANCE } from '../data/balance';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import type { Point } from '../world/Geometry';
import type {
  ProjectileKind,
  ProjectileSnapshot,
} from './ProjectileSystem';

const POOP_ARC_HEIGHT = 16;
const IMPACT_FADE_MS = 120;
const IMPACT_FRAME_MS = IMPACT_FADE_MS / 4;
const SHELTER_CENTER = { x: BALANCE.shelter.x, y: BALANCE.shelter.y } as const;

export interface ProjectileVisualTransform {
  readonly offsetY: number;
  readonly angle: number;
}

export interface ProjectileImpactSnapshot {
  readonly projectileId: number;
  readonly kind: ProjectileKind;
  readonly x: number;
  readonly y: number;
  readonly frame: number;
}

export function projectileImpactFrameAt(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Projectile impact elapsed time must be finite and non-negative');
  }
  return Math.min(3, Math.floor((elapsedMs + TIME_EPSILON_MS) / IMPACT_FRAME_MS));
}

export function projectileVisualTransform(
  kind: ProjectileKind,
  start: Point,
  current: Point,
  target: Point,
): ProjectileVisualTransform {
  if (kind !== 'poop') return { offsetY: 0, angle: 0 };
  const totalDistance = Math.hypot(target.x - start.x, target.y - start.y);
  const travelled = Math.hypot(current.x - start.x, current.y - start.y);
  const progress = totalDistance === 0
    ? 1
    : Math.max(0, Math.min(1, travelled / totalDistance));
  return {
    offsetY: -Math.sin(progress * Math.PI) * POOP_ARC_HEIGHT,
    angle: progress * 360,
  };
}

class ProjectileActor {
  readonly container: Phaser.GameObjects.Container;
  private readonly projectileGraphics: Phaser.GameObjects.Graphics;
  private projectileId = -1;
  private start: Point = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.projectileGraphics = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.projectileGraphics]);
    this.resetProjectile();
  }

  render(snapshot: ProjectileSnapshot): void {
    if (this.projectileId !== snapshot.id) {
      this.projectileId = snapshot.id;
      this.start = { x: snapshot.x, y: snapshot.y };
    }
    const transform = projectileVisualTransform(
      snapshot.kind,
      this.start,
      { x: snapshot.x, y: snapshot.y },
      SHELTER_CENTER,
    );
    this.drawProjectile(snapshot.kind);
    this.container
      .setPosition(snapshot.x, snapshot.y + transform.offsetY)
      .setAngle(transform.angle)
      .setDepth(snapshot.y + 1)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
  }

  resetProjectile(): void {
    this.projectileId = -1;
    this.start = { x: 0, y: 0 };
    this.projectileGraphics.removeAllListeners();
    this.projectileGraphics.clear();
    this.projectileGraphics.setAlpha(1).setActive(false).setVisible(false);
    this.container.removeAllListeners();
    this.container
      .setPosition(0, 0)
      .setDepth(0)
      .setAlpha(1)
      .setAngle(0)
      .setScale(1)
      .setActive(false)
      .setVisible(false);
  }

  private drawProjectile(kind: ProjectileKind): void {
    this.projectileGraphics.clear().setAlpha(1).setActive(true).setVisible(true);
    if (kind === 'poop') {
      this.projectileGraphics
        .fillStyle(0x75421f, 1)
        .fillCircle(-3, 2, 5)
        .fillCircle(2, 0, 5)
        .fillStyle(0xd39b5d, 0.8)
        .fillCircle(1, -2, 1.5);
      return;
    }
    if (kind === 'net') {
      this.projectileGraphics
        .lineStyle(2, 0xf1d57a, 1)
        .strokeCircle(0, 0, 10)
        .beginPath()
        .moveTo(-7, -7)
        .lineTo(7, 7)
        .moveTo(7, -7)
        .lineTo(-7, 7)
        .strokePath();
      return;
    }
    this.projectileGraphics
      .lineStyle(4, 0x55f4ef, 1)
      .beginPath()
      .moveTo(-10, -4)
      .lineTo(-3, -1)
      .lineTo(-6, 8)
      .lineTo(10, -5)
      .lineTo(3, -1)
      .lineTo(6, -8)
      .strokePath();
  }

}

class ProjectileImpactActor {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private projectileId = -1;
  private kind: ProjectileKind = 'poop';
  private position: Point = { x: 0, y: 0 };
  private ageMs = IMPACT_FADE_MS;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(1001);
    this.reset();
  }

  show(projectileId: number, kind: ProjectileKind, position: Point): void {
    this.projectileId = projectileId;
    this.kind = kind;
    this.position = { ...position };
    this.ageMs = 0;
    this.render();
  }

  step(stepMs: number): boolean {
    this.ageMs += stepMs;
    if (reachedDuration(this.ageMs, IMPACT_FADE_MS)) {
      this.reset();
      return false;
    }
    this.render();
    return true;
  }

  snapshot(): ProjectileImpactSnapshot {
    return {
      projectileId: this.projectileId,
      kind: this.kind,
      x: this.position.x,
      y: this.position.y,
      frame: projectileImpactFrameAt(this.ageMs),
    };
  }

  ageSnapshot(): number {
    return this.ageMs;
  }

  reset(): void {
    this.projectileId = -1;
    this.kind = 'poop';
    this.position = { x: 0, y: 0 };
    this.ageMs = IMPACT_FADE_MS;
    this.graphics
      .removeAllListeners()
      .clear()
      .setPosition(0, 0)
      .setScale(1)
      .setAlpha(1)
      .setActive(false)
      .setVisible(false);
  }

  private render(): void {
    const frame = projectileImpactFrameAt(this.ageMs);
    const alpha = [0.85, 0.65, 0.4, 0.2][frame]!;
    const scale = [0.75, 1, 1.2, 1.4][frame]!;
    this.graphics.clear();
    if (this.kind === 'poop') {
      this.graphics.fillStyle(0x75421f, alpha).fillEllipse(0, 0, 18, 8);
    } else if (this.kind === 'net') {
      this.graphics.lineStyle(3, 0xf1d57a, alpha).strokeCircle(0, 0, 16);
    } else {
      this.graphics.lineStyle(4, 0x55f4ef, alpha).strokeCircle(0, 0, 14);
    }
    this.graphics
      .setPosition(this.position.x, this.position.y)
      .setScale(scale)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
  }
}

export class ProjectileActorPool {
  private readonly pool: ObjectPool<ProjectileActor>;
  private readonly impactPool: ObjectPool<ProjectileImpactActor>;
  private readonly activeActors = new Map<number, ProjectileActor>();
  private readonly activeImpacts = new Set<ProjectileImpactActor>();

  constructor(scene: Phaser.Scene) {
    this.pool = new ObjectPool(
      BALANCE.caps.projectiles,
      () => new ProjectileActor(scene),
    );
    this.impactPool = new ObjectPool(
      BALANCE.caps.particles,
      () => new ProjectileImpactActor(scene),
    );
  }

  render(snapshots: readonly ProjectileSnapshot[]): void {
    const desiredIds = new Set(snapshots.map(({ id }) => id));
    for (const projectileId of [...this.activeActors.keys()]) {
      if (!desiredIds.has(projectileId)) this.release(projectileId);
    }
    for (const snapshot of snapshots) {
      const actor = this.acquire(snapshot.id);
      if (actor === undefined) throw new Error('Projectile actor pool exhausted');
      actor.render(snapshot);
    }
  }

  showHit(projectileId: number, kind: ProjectileKind, position: Point): void {
    if (
      !Number.isSafeInteger(projectileId)
      || projectileId < 0
      || !Number.isFinite(position.x)
      || !Number.isFinite(position.y)
    ) {
      throw new RangeError('Invalid projectile impact');
    }
    const impact = this.impactPool.acquire();
    if (impact === undefined) return;
    impact.show(projectileId, kind, position);
    this.activeImpacts.add(impact);
  }

  stepEffects(stepMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Projectile effect step must be finite and non-negative');
    }
    for (const impact of [...this.activeImpacts]) {
      if (!impact.step(stepMs)) {
        this.activeImpacts.delete(impact);
        this.impactPool.release(impact);
      }
    }
  }

  get activeEffectCount(): number {
    return this.activeImpacts.size;
  }

  releaseAll(): void {
    this.activeActors.clear();
    this.pool.releaseAll((actor) => actor.resetProjectile());
    this.activeImpacts.clear();
    this.impactPool.releaseAll((impact) => impact.reset());
  }

  snapshot(): PoolSnapshot {
    return this.pool.snapshot();
  }

  impactPoolSnapshot(): PoolSnapshot {
    return this.impactPool.snapshot();
  }

  impactSnapshots(): readonly ProjectileImpactSnapshot[] {
    return [...this.activeImpacts]
      .map((impact) => impact.snapshot())
      .sort((left, right) => left.projectileId - right.projectileId);
  }

  impactAgesSnapshot(): readonly number[] {
    return [...this.activeImpacts].map((impact) => impact.ageSnapshot());
  }

  private acquire(projectileId: number): ProjectileActor | undefined {
    const active = this.activeActors.get(projectileId);
    if (active !== undefined) return active;
    const actor = this.pool.acquire();
    if (actor !== undefined) this.activeActors.set(projectileId, actor);
    return actor;
  }

  private release(projectileId: number): void {
    const actor = this.activeActors.get(projectileId);
    if (actor === undefined) return;
    this.activeActors.delete(projectileId);
    actor.resetProjectile();
    this.pool.release(actor);
  }
}
