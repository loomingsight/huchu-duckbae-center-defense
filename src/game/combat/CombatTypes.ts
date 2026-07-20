import type { EnemyLifecycleEvent } from '../enemies/EnemySystem';
import type { DamageSource, ImpactStrength } from '../types/GameTypes';
import type { Point } from '../world/Geometry';

export interface DamageCommand {
  readonly castId: string;
  readonly targetId: number;
  readonly amount: number;
  readonly impactDirection: Point;
  readonly source: DamageSource;
  readonly strength: ImpactStrength;
}

export interface DamageAppliedEvent {
  readonly type: 'damageApplied';
  readonly castId: string;
  readonly appliedAtStep: number;
  readonly targetId: number;
  readonly amount: number;
  readonly effectiveAmount: number;
  readonly position: Point;
  readonly impactDirection: Point;
  readonly source: DamageSource;
  readonly strength: ImpactStrength;
  readonly lethal: boolean;
}

export interface EnemyDamageResult {
  readonly effectiveAmount: number;
  readonly position: Point;
  readonly lethal: boolean;
  readonly lifecycleEvents: readonly EnemyLifecycleEvent[];
}

export type CombatEvent = DamageAppliedEvent | EnemyLifecycleEvent;
