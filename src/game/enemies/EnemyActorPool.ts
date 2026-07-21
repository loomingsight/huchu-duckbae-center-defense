import type Phaser from 'phaser';
import { BALANCE } from '../data/balance';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';
import type { Point } from '../world/Geometry';
import type { CompositeEnemyRigFactory } from './CompositeEnemyRig';
import { EnemyActor } from './EnemyActor';
import { EnemyLabelPool } from './EnemyLabelPool';
import type { EnemyLabelView, LabelBounds } from './EnemyLabelView';
import type { EnemySnapshot } from './EnemyTypes';
import type { ImpactFeedbackTarget } from './ImpactFeedbackTarget';

export interface EnemyActorPoolOptions {
  readonly labelPool?: EnemyLabelPool;
  readonly compositeRigFactory?: CompositeEnemyRigFactory;
}

interface ActiveEnemyView {
  readonly actor: EnemyActor;
  readonly label: EnemyLabelView;
}

export interface EnemyLabelBindingTelemetry {
  readonly enemyId: number;
  readonly displayName: string;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly hpRatio: number;
  readonly hpColor: number;
}

export class EnemyActorPool {
  private readonly pool: ObjectPool<EnemyActor>;
  private readonly labels: EnemyLabelPool;
  private readonly activeActors = new Map<number, ActiveEnemyView>();
  private readonly dyingActors = new Map<number, ActiveEnemyView>();

  constructor(scene: Phaser.Scene, options: EnemyActorPoolOptions = {}) {
    this.pool = new ObjectPool(
      BALANCE.caps.enemies,
      () => new EnemyActor(scene, options.compositeRigFactory),
    );
    this.labels = options.labelPool ?? new EnemyLabelPool(scene);
  }

  acquire(snapshot: EnemySnapshot): EnemyActor | undefined {
    assertEnemyId(snapshot.id);
    const existing = this.activeActors.get(snapshot.id);
    if (existing !== undefined) return existing.actor;
    if (this.dyingActors.has(snapshot.id)) return undefined;
    const actor = this.pool.acquire();
    if (actor === undefined) return undefined;
    const label = this.labels.acquire();
    if (label === undefined) {
      actor.reset();
      this.pool.release(actor);
      return undefined;
    }
    try {
      label.bind(BALANCE.enemies[snapshot.kind].displayName);
      actor.bind(snapshot);
    } catch (error) {
      this.labels.release(label);
      actor.reset();
      this.pool.release(actor);
      throw error;
    }
    this.activeActors.set(snapshot.id, { actor, label });
    return actor;
  }

  release(enemyId: number): boolean {
    assertEnemyId(enemyId);
    const active = this.activeActors.get(enemyId);
    if (active === undefined) return false;
    const released = this.releaseView(active);
    if (!released) return false;
    this.activeActors.delete(enemyId);
    return true;
  }

  releaseAll(): void {
    let firstFailure: unknown;
    let failed = false;
    for (const enemyId of [...this.activeActors.keys()]) {
      try {
        this.release(enemyId);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstFailure = error;
        }
      }
    }
    for (const [enemyId, view] of [...this.dyingActors]) {
      try {
        if (this.releaseView(view)) this.dyingActors.delete(enemyId);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstFailure = error;
        }
      }
    }
    if (failed) throw firstFailure;
  }

  reset(): void {
    this.releaseAll();
  }

  render(snapshots: readonly EnemySnapshot[], deltaMs = 0): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError('Enemy actor render deltaMs must be finite and non-negative');
    }
    const desiredIds = new Set(snapshots.map(({ id }) => id));
    for (const enemyId of [...this.activeActors.keys()]) {
      if (!desiredIds.has(enemyId)) this.release(enemyId);
    }
    for (const snapshot of snapshots) {
      const actor = this.acquire(snapshot);
      if (actor === undefined) throw new Error('Enemy actor/label pool exhausted');
      actor.render(snapshot, deltaMs);
      const active = this.activeActors.get(snapshot.id)!;
      active.label.render({
        position: actor.labelAnchor(),
        currentHp: snapshot.currentHp,
        maxHp: snapshot.maxHp,
        opaqueHeightLogical: enemyOpaqueHeight(snapshot),
        visible: true,
      });
    }
  }

  feedbackTarget(enemyId: number): ImpactFeedbackTarget | undefined {
    assertEnemyId(enemyId);
    return this.activeActors.get(enemyId)?.actor.feedbackTarget();
  }

  damageAnchor(enemyId: number): Point | undefined {
    assertEnemyId(enemyId);
    const label = this.activeActors.get(enemyId)?.label;
    if (label === undefined) return undefined;
    const snapshot = label.snapshot();
    return snapshot.visible ? { ...snapshot.damageAnchor } : undefined;
  }

  beginDeath(enemyId: number, feedbackAlreadyStarted = false): boolean {
    assertEnemyId(enemyId);
    const active = this.activeActors.get(enemyId);
    if (active === undefined) return false;
    this.activeActors.delete(enemyId);
    this.dyingActors.set(enemyId, active);
    if (feedbackAlreadyStarted) active.actor.startDeathTimeline();
    else active.actor.beginDeath(160);
    return true;
  }

  step(stepMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Enemy actor pool stepMs must be finite and non-negative');
    }
    for (const view of this.activeActors.values()) view.actor.stepFeedback(stepMs);
    for (const [enemyId, view] of [...this.dyingActors]) {
      view.actor.stepFeedback(stepMs);
      if (view.actor.stepDeath(stepMs) === 'active') continue;
      if (this.releaseView(view)) this.dyingActors.delete(enemyId);
    }
  }

  labelPoolSnapshot(): PoolSnapshot {
    return this.labels.snapshot();
  }

  labelBindingSnapshots(): readonly EnemyLabelBindingTelemetry[] {
    return [...this.activeActors.entries()]
      .sort(([leftId], [rightId]) => leftId - rightId)
      .map(([enemyId, { label }]) => {
        const snapshot = label.snapshot();
        if (snapshot.displayName === null || snapshot.hp === null) {
          throw new Error(`Active enemy ${enemyId} label telemetry is incomplete`);
        }
        return {
          enemyId,
          displayName: snapshot.displayName,
          ...snapshot.hp,
        };
      });
  }

  renderedVisibleLabelCount(
    camera: Phaser.Cameras.Scene2D.Camera,
    viewport: LabelBounds,
  ): number {
    return [...this.activeActors.values()]
      .filter(({ label }) => label.renderedVisible(camera, viewport))
      .length;
  }

  snapCompositePoses(): void {
    for (const { actor } of this.activeActors.values()) actor.snapCompositePose();
  }

  snapshot(): PoolSnapshot {
    return this.pool.snapshot();
  }

  get createdCount(): number {
    return this.pool.createdCount;
  }

  get activeCount(): number {
    return this.activeActors.size;
  }

  get dyingCount(): number {
    return this.dyingActors.size;
  }

  private releaseView(view: ActiveEnemyView): boolean {
    view.actor.reset();
    const labelReleased = this.labels.release(view.label);
    if (!labelReleased) return false;
    const actorReleased = this.pool.release(view.actor);
    return actorReleased && labelReleased;
  }
}

function enemyOpaqueHeight(snapshot: EnemySnapshot): number {
  return snapshot.isBoss
    ? HUCHU_PRESENTATION.bossOpaqueHeightLogical
    : HUCHU_PRESENTATION.regularEnemyOpaqueHeightLogical;
}

function assertEnemyId(enemyId: number): void {
  if (!Number.isSafeInteger(enemyId) || enemyId < 0) {
    throw new RangeError('Enemy actor id must be a non-negative safe integer');
  }
}
