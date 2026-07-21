import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { projectileShapeFrame } from '../assets/CombatShapeAtlas';
import { BALANCE } from '../data/balance';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import {
  PROJECTILE_WORKLOAD_TOPOLOGY,
  type ProjectileViewWorkloadCounters,
} from '../presentation/PresentationWorkloadTelemetry';
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

interface ProjectileActorTelemetry {
  readonly stateChanged: () => void;
  readonly visibilityChanged: (visible: boolean) => void;
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
  readonly image: Phaser.GameObjects.Image;
  private projectileId = -1;
  private projectileKind: ProjectileKind | undefined;
  private imageFrame: ReturnType<typeof projectileShapeFrame> | undefined;
  private start: Point = { x: 0, y: 0 };
  private imageX = 0;
  private imageY = 0;
  private imageAngle = 0;
  private imageDepth = 0;
  private imageAlpha = 1;
  private imageActive = false;
  private imageVisible = false;

  constructor(
    scene: Phaser.Scene,
    private readonly telemetry: ProjectileActorTelemetry,
  ) {
    this.image = scene.add.image(0, 0, AssetKeys.combatShapes);
    try {
      this.image.setOrigin(0.5, 0.5);
      this.resetProjectile();
    } catch (initializationError) {
      try {
        this.image.destroy();
      } catch (cleanupError) {
        throw new AggregateError(
          [initializationError, cleanupError],
          'Projectile actor initialization and cleanup both failed',
        );
      }
      throw initializationError;
    }
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
      const frame = projectileShapeFrame(snapshot.kind);
      if (this.imageFrame !== frame) {
        this.image.setFrame(frame);
        this.imageFrame = frame;
        this.telemetry.stateChanged();
      }
      this.projectileKind = snapshot.kind;
      this.setImageAlpha(1);
      this.setImageActive(true);
      this.setImageVisible(true);
    }
    this.setImagePosition(snapshot.x, snapshot.y + transform.offsetY);
    this.setImageAngle(transform.angle);
    this.setImageDepth(snapshot.y + 1);
    this.setImageAlpha(1);
    this.setImageActive(true);
    this.setImageVisible(true);
  }

  resetProjectile(): void {
    this.projectileId = -1;
    this.projectileKind = undefined;
    this.start = { x: 0, y: 0 };
    runEveryStep([
      () => this.image.removeAllListeners(),
      () => this.setImagePosition(0, 0, true),
      () => this.setImageAngle(0, true),
      () => this.image.setScale(1),
      () => this.setImageDepth(0, true),
      () => this.setImageAlpha(1, true),
      () => this.setImageActive(false, true),
      () => this.setImageVisible(false, true),
    ]);
  }

  destroy(): void {
    this.image.destroy();
  }

  get isResetSafeForReuse(): boolean {
    return this.projectileId === -1
      && this.projectileKind === undefined
      && !this.imageActive
      && !this.imageVisible;
  }

  private setImagePosition(x: number, y: number, force = false): void {
    const changed = this.imageX !== x || this.imageY !== y;
    if (!changed && !force) return;
    this.image.setPosition(x, y);
    if (!changed) return;
    this.imageX = x;
    this.imageY = y;
    this.telemetry.stateChanged();
  }

  private setImageAngle(angle: number, force = false): void {
    const changed = this.imageAngle !== angle;
    if (!changed && !force) return;
    this.image.setAngle(angle);
    if (!changed) return;
    this.imageAngle = angle;
    this.telemetry.stateChanged();
  }

  private setImageDepth(depth: number, force = false): void {
    const changed = this.imageDepth !== depth;
    if (!changed && !force) return;
    this.image.setDepth(depth);
    if (!changed) return;
    this.imageDepth = depth;
    this.telemetry.stateChanged();
  }

  private setImageAlpha(alpha: number, force = false): void {
    const changed = this.imageAlpha !== alpha;
    if (!changed && !force) return;
    this.image.setAlpha(alpha);
    if (!changed) return;
    this.imageAlpha = alpha;
    this.telemetry.stateChanged();
  }

  private setImageActive(active: boolean, force = false): void {
    const changed = this.imageActive !== active;
    if (!changed && !force) return;
    this.image.setActive(active);
    if (!changed) return;
    this.imageActive = active;
    this.telemetry.stateChanged();
  }

  private setImageVisible(visible: boolean, force = false): void {
    const changed = this.imageVisible !== visible;
    if (!changed && !force) return;
    this.image.setVisible(visible);
    if (!changed) return;
    this.imageVisible = visible;
    this.telemetry.visibilityChanged(visible);
  }
}

export class ProjectileActorPool {
  private readonly pool: ObjectPool<ProjectileActor>;
  private readonly activeActors = new Map<number, ProjectileActor>();
  private readonly counters: Mutable<ProjectileViewWorkloadCounters>;

  constructor(
    scene: Phaser.Scene,
    private readonly effects: CombatEffectPool,
  ) {
    this.counters = {
      topology: PROJECTILE_WORKLOAD_TOPOLOGY,
      poolInstanceId: 0,
      allocatedRoots: BALANCE.caps.projectiles,
      allocatedChildren: 0,
      active: 0,
      visibleRoots: 0,
      visibleLeaves: 0,
      renderPasses: 0,
      requestedVisits: 0,
      visibleRootVisits: 0,
      stateVersion: 0,
      activations: 0,
      releases: 0,
      rejected: 0,
    };
    const telemetry: ProjectileActorTelemetry = {
      stateChanged: () => {
        this.counters.stateVersion += 1;
      },
      visibilityChanged: (visible) => {
        this.counters.visibleRoots += visible ? 1 : -1;
        this.counters.visibleLeaves += visible ? 1 : -1;
        this.counters.stateVersion += 1;
      },
    };
    this.pool = createProjectileActors(scene, telemetry);
    this.counters.poolInstanceId = this.pool.snapshot().instanceId;
    this.counters.stateVersion = 0;
  }

  render(snapshots: readonly ProjectileSnapshot[]): void {
    const desiredIds = new Set(snapshots.map(({ id }) => id));
    for (const projectileId of [...this.activeActors.keys()]) {
      if (!desiredIds.has(projectileId)) this.release(projectileId);
    }
    for (const snapshot of snapshots) {
      const active = this.activeActors.get(snapshot.id);
      if (active !== undefined) {
        active.render(snapshot);
        continue;
      }
      const actor = this.pool.acquire();
      if (actor === undefined) {
        this.counters.rejected += 1;
        throw new Error('Projectile actor pool exhausted');
      }
      try {
        actor.render(snapshot);
      } catch (renderError) {
        this.counters.rejected += 1;
        const rollback = this.resetForRelease(actor);
        if (rollback.safe) this.pool.release(actor);
        if (rollback.failed) {
          throw new AggregateError(
            [renderError, rollback.error],
            'Projectile actor render and rollback both failed',
          );
        }
        if (!rollback.safe) {
          throw new AggregateError(
            [renderError, new Error('Projectile actor quarantined after render rollback')],
            'Projectile actor render and rollback both failed',
          );
        }
        throw renderError;
      }
      this.activeActors.set(snapshot.id, actor);
      this.counters.active = this.activeActors.size;
      this.counters.activations += 1;
    }
    this.counters.renderPasses += 1;
    this.counters.requestedVisits += snapshots.length;
    this.counters.visibleRootVisits += this.counters.visibleRoots;
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
    this.reset();
    this.effects.releaseType('projectileImpact');
  }

  reset(): void {
    runEveryStep(
      [...this.activeActors.keys()].map((projectileId) => (
        () => this.release(projectileId)
      )),
    );
  }

  snapshot(): PoolSnapshot {
    return this.pool.snapshot();
  }

  workloadCounters(): Readonly<ProjectileViewWorkloadCounters> {
    return this.counters;
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

  private release(projectileId: number): void {
    const actor = this.activeActors.get(projectileId);
    if (actor === undefined) return;
    this.activeActors.delete(projectileId);
    this.counters.active = this.activeActors.size;
    const reset = this.resetForRelease(actor);
    if (reset.safe && this.pool.release(actor)) this.counters.releases += 1;
    if (reset.failed) throw reset.error;
    if (!reset.safe) {
      throw new Error('Projectile actor quarantined after incomplete reset');
    }
  }

  private resetForRelease(actor: ProjectileActor): {
    readonly failed: boolean;
    readonly error: unknown;
    readonly safe: boolean;
  } {
    let failed = false;
    let error: unknown;
    try {
      actor.resetProjectile();
    } catch (resetError) {
      failed = true;
      error = resetError;
    }
    if (failed && !actor.isResetSafeForReuse) {
      try {
        actor.resetProjectile();
      } catch (cleanupError) {
        error = new AggregateError(
          [error, cleanupError],
          'Projectile actor reset and cleanup retry both failed',
        );
      }
    }
    return { failed, error, safe: actor.isResetSafeForReuse };
  }
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

function runEveryStep(steps: readonly (() => void)[]): void {
  let failed = false;
  let firstFailure: unknown;
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      if (!failed) firstFailure = error;
      failed = true;
    }
  }
  if (failed) throw firstFailure;
}

function createProjectileActors(
  scene: Phaser.Scene,
  telemetry: ProjectileActorTelemetry,
): ObjectPool<ProjectileActor> {
  const actors: ProjectileActor[] = [];
  try {
    return new ObjectPool(BALANCE.caps.projectiles, () => {
      const actor = new ProjectileActor(scene, telemetry);
      actors.push(actor);
      return actor;
    });
  } catch (creationError) {
    try {
      runEveryStep(actors.map((actor) => () => actor.destroy()));
    } catch (cleanupError) {
      throw new AggregateError(
        [creationError, cleanupError],
        'Projectile actor allocation and cleanup both failed',
      );
    }
    throw creationError;
  }
}
