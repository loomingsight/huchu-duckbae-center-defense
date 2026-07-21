import type Phaser from 'phaser';
import type { Point } from '../world/Geometry';
import type { EnemySnapshot } from './EnemyTypes';
import type { ImpactFeedbackTarget } from './ImpactFeedbackTarget';

export interface CompositeEnemyRig extends ImpactFeedbackTarget {
  render(snapshot: EnemySnapshot, deltaMs: number): void;
  humanAnchor(): Point;
  snapNextPose(): void;
  reset(): void;
}

export type CompositeEnemyRigFactory = (scene: Phaser.Scene) => CompositeEnemyRig;

export function createNoopCompositeEnemyRig(): CompositeEnemyRig {
  let anchor: Point = { x: 0, y: 0 };
  return {
    render: (snapshot) => { anchor = { ...snapshot.position }; },
    humanAnchor: () => ({ ...anchor }),
    snapNextPose: () => undefined,
    reset: () => { anchor = { x: 0, y: 0 }; },
    getFeedbackAnchor: () => ({ ...anchor }),
    flash: () => undefined,
    recoil: () => undefined,
    beginDeath: () => undefined,
  };
}

export const NOOP_COMPOSITE_ENEMY_RIG_FACTORY: CompositeEnemyRigFactory =
  () => createNoopCompositeEnemyRig();
