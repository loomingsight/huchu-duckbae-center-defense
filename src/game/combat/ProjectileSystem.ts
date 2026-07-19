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

function pointToSegmentDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const projection = Math.max(0, Math.min(
    1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
  ));
  return Math.hypot(
    point.x - (from.x + dx * projection),
    point.y - (from.y + dy * projection),
  );
}

export class ProjectileSystem {
  private readonly pool: ObjectPool<MutableProjectile>;
  private readonly active = new Set<MutableProjectile>();

  constructor(capacity: number, private readonly shelterRadius = 38) {
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
      projectile.position = next;
      projectile.ageMs += movementMs;
      const hit = pointToSegmentDistance(projectile.target, previous, next)
        <= this.shelterRadius + 1e-9;
      if (hit) {
        events.push(
          { type: 'projectileHit', projectileId: projectile.id, kind: projectile.kind },
          {
            type: 'shelterDamageRequested',
            projectileId: projectile.id,
            damage: projectile.damage,
          },
        );
      }
      if (hit || reachedDuration(projectile.ageMs, projectile.lifeMs)) {
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
