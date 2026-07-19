import type Phaser from 'phaser';
import { BALANCE } from '../data/balance';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import { EnemyActor } from './EnemyActor';
import type { EnemySnapshot } from './EnemyTypes';

export class EnemyActorPool {
  private readonly pool: ObjectPool<EnemyActor>;
  private readonly activeActors = new Map<number, EnemyActor>();

  constructor(scene: Phaser.Scene) {
    this.pool = new ObjectPool(
      BALANCE.caps.enemies,
      () => new EnemyActor(scene),
    );
  }

  acquire(enemyId: number): EnemyActor | undefined {
    assertEnemyId(enemyId);
    const existing = this.activeActors.get(enemyId);
    if (existing !== undefined) return existing;
    const actor = this.pool.acquire();
    if (actor === undefined) return undefined;
    this.activeActors.set(enemyId, actor);
    return actor;
  }

  release(enemyId: number): boolean {
    assertEnemyId(enemyId);
    const actor = this.activeActors.get(enemyId);
    if (actor === undefined) return false;
    this.activeActors.delete(enemyId);
    actor.reset();
    return this.pool.release(actor);
  }

  releaseAll(): void {
    this.activeActors.clear();
    this.pool.releaseAll((actor) => actor.reset());
  }

  render(snapshots: readonly EnemySnapshot[]): void {
    const desiredIds = new Set(snapshots.map(({ id }) => id));
    for (const enemyId of [...this.activeActors.keys()]) {
      if (!desiredIds.has(enemyId)) this.release(enemyId);
    }
    for (const snapshot of snapshots) {
      const actor = this.acquire(snapshot.id);
      if (actor === undefined) throw new Error('Enemy actor pool exhausted');
      actor.render(snapshot);
    }
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
}

function assertEnemyId(enemyId: number): void {
  if (!Number.isSafeInteger(enemyId) || enemyId < 0) {
    throw new RangeError('Enemy actor id must be a non-negative safe integer');
  }
}
