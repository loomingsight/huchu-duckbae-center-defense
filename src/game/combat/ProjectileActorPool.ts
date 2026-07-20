import type Phaser from 'phaser';
import { BALANCE } from '../data/balance';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import type { Point } from '../world/Geometry';
import {
  CombatEffectPool,
  projectileImpactFrameAt,
  type ProjectileImpactSnapshot,
} from './CombatEffectPool';
import type {
  ProjectileKind,
  ProjectileSnapshot,
} from './ProjectileSystem';

const POOP_ARC_HEIGHT = 16;
const SHELTER_CENTER = { x: BALANCE.shelter.x, y: BALANCE.shelter.y } as const;

export { projectileImpactFrameAt };
export type { ProjectileImpactSnapshot };

export interface ProjectileVisualTransform {
  readonly offsetY: number;
  readonly angle: number;
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
  private projectileKind: ProjectileKind | undefined;
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
      this.projectileKind = undefined;
    }
    const transform = projectileVisualTransform(
      snapshot.kind,
      this.start,
      { x: snapshot.x, y: snapshot.y },
      SHELTER_CENTER,
    );
    if (this.projectileKind !== snapshot.kind) {
      this.drawProjectile(snapshot.kind);
      this.projectileKind = snapshot.kind;
    }
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
    this.projectileKind = undefined;
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

export class ProjectileActorPool {
  private readonly pool: ObjectPool<ProjectileActor>;
  private readonly activeActors = new Map<number, ProjectileActor>();

  constructor(
    scene: Phaser.Scene,
    private readonly effects: CombatEffectPool,
  ) {
    this.pool = new ObjectPool(
      BALANCE.caps.projectiles,
      () => new ProjectileActor(scene),
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
    this.effects.showProjectileImpact(projectileId, kind, position);
  }

  stepEffects(stepMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Projectile effect step must be finite and non-negative');
    }
    this.effects.step(stepMs);
  }

  get activeEffectCount(): number {
    return this.effects.projectileImpactSnapshots().length;
  }

  releaseAll(): void {
    this.activeActors.clear();
    this.pool.releaseAll((actor) => actor.resetProjectile());
    this.effects.releaseType('projectileImpact');
  }

  snapshot(): PoolSnapshot {
    return this.pool.snapshot();
  }

  impactPoolSnapshot(): PoolSnapshot {
    return this.effects.snapshot();
  }

  impactSnapshots(): readonly ProjectileImpactSnapshot[] {
    return this.effects.projectileImpactSnapshots();
  }

  impactAgesSnapshot(): readonly number[] {
    return this.effects.effectAges('projectileImpact');
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
