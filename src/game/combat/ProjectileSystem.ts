import { reachedDuration } from '../constants';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import type { Point } from '../world/Geometry';

export type ProjectileKind = 'poop' | 'net' | 'electric';

export interface ProjectileSpawn {
  readonly id: number;
  readonly kind: ProjectileKind;
  readonly from: Point;
  readonly to: Point;
  readonly speed: number;
  readonly damage: number;
  readonly lifeMs: number;
}

export interface ProjectileSnapshot {
  readonly id: number;
  readonly kind: ProjectileKind;
  readonly x: number;
  readonly y: number;
  readonly speed: number;
  readonly damage: number;
  readonly lifeMs: number;
}

export type ProjectileEvent =
  | {
    readonly type: 'projectileSpawned';
    readonly projectileId: number;
    readonly kind: ProjectileKind;
  }
  | {
    readonly type: 'projectileDropped';
    readonly projectileId: number;
    readonly kind: ProjectileKind;
    readonly reason: 'capacity';
  }
  | {
    readonly type: 'projectileHit';
    readonly projectileId: number;
    readonly kind: ProjectileKind;
    readonly position: Point;
  }
  | {
    readonly type: 'shelterDamageRequested';
    readonly projectileId: number;
    readonly damage: number;
  };

interface MutableProjectile {
  id: number;
  kind: ProjectileKind;
  position: Point;
  velocity: Point;
  target: Point;
  speed: number;
  damage: number;
  ageMs: number;
  lifeMs: number;
}

function firstSegmentCircleIntersection(
  from: Point,
  to: Point,
  center: Point,
  radius: number,
): Point | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fromCenterX = from.x - center.x;
  const fromCenterY = from.y - center.y;
  const radiusSquared = radius * radius;
  if (fromCenterX * fromCenterX + fromCenterY * fromCenterY <= radiusSquared + 1e-9) {
    return canonicalPoint(from);
  }

  const a = dx * dx + dy * dy;
  if (a === 0) return undefined;
  const b = 2 * (fromCenterX * dx + fromCenterY * dy);
  const c = fromCenterX * fromCenterX + fromCenterY * fromCenterY - radiusSquared;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return undefined;

  const squareRoot = Math.sqrt(Math.max(0, discriminant));
  const roots = [(-b - squareRoot) / (2 * a), (-b + squareRoot) / (2 * a)];
  const first = roots.find((root) => root >= -1e-9 && root <= 1 + 1e-9);
  if (first === undefined) return undefined;
  const progress = Math.max(0, Math.min(1, first));
  return canonicalPoint({
    x: from.x + dx * progress,
    y: from.y + dy * progress,
  });
}

function canonicalPoint(point: Point): Point {
  return {
    x: Math.round(point.x * 1e9) / 1e9,
    y: Math.round(point.y * 1e9) / 1e9,
  };
}

export class ProjectileSystem {
  private readonly pool: ObjectPool<MutableProjectile>;
  private readonly active = new Set<MutableProjectile>();
  private readonly shelterRadius: number;

  constructor(capacity: number, shelterRadius = 38) {
    if (!Number.isFinite(shelterRadius) || shelterRadius < 0) {
      throw new RangeError('Projectile shelter radius must be finite and non-negative');
    }
    this.shelterRadius = shelterRadius;
    this.pool = new ObjectPool(capacity, () => ({
      id: -1,
      kind: 'poop',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      speed: 0,
      damage: 0,
      ageMs: 0,
      lifeMs: 0,
    }));
  }

  spawn(input: ProjectileSpawn): readonly ProjectileEvent[] {
    if (
      !Number.isSafeInteger(input.id)
      || input.id < 0
      || !Number.isFinite(input.from.x)
      || !Number.isFinite(input.from.y)
      || !Number.isFinite(input.to.x)
      || !Number.isFinite(input.to.y)
      || !Number.isFinite(input.speed)
      || !Number.isFinite(input.damage)
      || !Number.isFinite(input.lifeMs)
    ) {
      throw new RangeError('Invalid projectile');
    }
    const dx = input.to.x - input.from.x;
    const dy = input.to.y - input.from.y;
    const length = Math.hypot(dx, dy);
    if (length === 0 || input.speed <= 0 || input.lifeMs <= 0) {
      throw new RangeError('Invalid projectile');
    }
    const projectile = this.pool.acquire();
    if (projectile === undefined) {
      return [{
        type: 'projectileDropped',
        projectileId: input.id,
        kind: input.kind,
        reason: 'capacity',
      }];
    }
    Object.assign(projectile, {
      id: input.id,
      kind: input.kind,
      position: { ...input.from },
      velocity: { x: dx / length * input.speed, y: dy / length * input.speed },
      target: { ...input.to },
      speed: input.speed,
      damage: input.damage,
      ageMs: 0,
      lifeMs: input.lifeMs,
    });
    this.active.add(projectile);
    return [{ type: 'projectileSpawned', projectileId: input.id, kind: input.kind }];
  }

  step(stepMs: number): readonly ProjectileEvent[] {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Projectile step must be finite and non-negative');
    }
    const events: ProjectileEvent[] = [];
    for (const projectile of [...this.active]) {
      const previous = projectile.position;
      const remainingLifeMs = Math.max(0, projectile.lifeMs - projectile.ageMs);
      const movementMs = Math.min(stepMs, remainingLifeMs);
      const next = {
        x: previous.x + projectile.velocity.x * movementMs / 1000,
        y: previous.y + projectile.velocity.y * movementMs / 1000,
      };
      projectile.ageMs += movementMs;
      const impactPosition = firstSegmentCircleIntersection(
        previous,
        next,
        projectile.target,
        this.shelterRadius,
      );
      projectile.position = impactPosition ?? next;
      if (impactPosition !== undefined) {
        events.push(
          {
            type: 'projectileHit',
            projectileId: projectile.id,
            kind: projectile.kind,
            position: impactPosition,
          },
          {
            type: 'shelterDamageRequested',
            projectileId: projectile.id,
            damage: projectile.damage,
          },
        );
      }
      if (impactPosition !== undefined || reachedDuration(projectile.ageMs, projectile.lifeMs)) {
        this.release(projectile);
      }
    }
    return events;
  }

  snapshots(): readonly ProjectileSnapshot[] {
    return [...this.active].map((projectile) => ({
      id: projectile.id,
      kind: projectile.kind,
      x: projectile.position.x,
      y: projectile.position.y,
      speed: projectile.speed,
      damage: projectile.damage,
      lifeMs: projectile.lifeMs,
    }));
  }

  get activeCount(): number {
    return this.active.size;
  }

  poolSnapshot(): PoolSnapshot {
    return this.pool.snapshot();
  }

  clear(): void {
    for (const projectile of [...this.active]) this.release(projectile);
  }

  private release(projectile: MutableProjectile): void {
    this.active.delete(projectile);
    this.pool.release(projectile);
  }
}
