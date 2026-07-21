import type Phaser from 'phaser';
import { BALANCE } from '../data/balance';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import { EnemyLabelView } from './EnemyLabelView';

export class EnemyLabelPool {
  private readonly pool: ObjectPool<EnemyLabelView>;

  constructor(scene: Phaser.Scene) {
    const createdLabels: EnemyLabelView[] = [];
    let pool: ObjectPool<EnemyLabelView>;
    try {
      pool = new ObjectPool(
        BALANCE.caps.enemies,
        () => {
          const label = new EnemyLabelView(scene);
          createdLabels.push(label);
          return label;
        },
      );
    } catch (error) {
      createdLabels.forEach((label) => label.destroy());
      throw error;
    }
    this.pool = pool;
  }

  acquire(): EnemyLabelView | undefined {
    return this.pool.acquire();
  }

  release(label: EnemyLabelView): boolean {
    label.reset();
    return this.pool.release(label);
  }

  reset(): void {
    this.pool.releaseAll((label) => label.reset());
  }

  snapshot(): PoolSnapshot {
    return this.pool.snapshot();
  }
}
