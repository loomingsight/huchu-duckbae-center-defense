import type { PurchasableSkillId } from '../types/GameTypes';
import type { Point } from '../world/Geometry';

export interface SkillTargetSnapshot {
  readonly targetId: number;
  readonly position: Point;
}

export interface SkillSnapshot {
  readonly learned: boolean;
  readonly cooldownRemainingMs: number;
  readonly ready: boolean;
  readonly progress: number;
  readonly activeCastId: string | null;
}

export type CastRequestResult =
  | { readonly status: 'started'; readonly events: readonly [SkillCastStartedEvent] }
  | {
    readonly status: 'noTarget' | 'notReady' | 'notLearned';
    readonly events: readonly [];
  };

export interface SkillCastStartedEvent {
  readonly type: 'skillCastStarted';
  readonly castId: string;
  readonly skillId: PurchasableSkillId;
  readonly origin: Point;
  readonly targets: readonly SkillTargetSnapshot[];
  readonly durationMs: 250 | 300 | 600;
}

export interface SkillTargetChangedEvent {
  readonly type: 'skillTargetChanged';
  readonly castId: string;
  readonly skillId: 'aquaBeam';
  readonly previousTargetId: number;
  readonly targetId: number;
  readonly targetPosition: Point;
}

export interface SkillImpactEvent {
  readonly type: 'skillImpact';
  readonly castId: string;
  readonly skillId: PurchasableSkillId;
  readonly origin: Point;
  readonly targets: readonly SkillTargetSnapshot[];
}

export type SkillTimelineEvent =
  | SkillCastStartedEvent
  | SkillTargetChangedEvent
  | SkillImpactEvent;
