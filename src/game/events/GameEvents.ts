import type { BarkEvent } from '../combat/BarkSystem';
import type { DamageAppliedEvent } from '../combat/CombatTypes';
import type {
  EnemyCombatEvent as EnemySystemCombatEvent,
} from '../combat/EnemyAttackSystem';
import type { CompanionEvent } from '../companions/CompanionSystem';
import type { GameMode } from '../core/GameMode';
import type { SkillPurchaseResult } from '../progression/ProgressionTypes';
import type { SkillTimelineEvent } from '../skills/SkillSystem';
import type { EnemyKind } from '../types/GameTypes';
import type { Point } from '../world/Geometry';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
import type { WaveNumber } from '../session/RunSnapshot';

export type CoreCombatEvent = BarkEvent | CompanionEvent | SkillTimelineEvent;

export type CoreStateEvent =
  | {
    readonly type: 'skillPurchaseResolved';
    readonly result: SkillPurchaseResult & { readonly status: 'learned' };
  }
  | {
    readonly type: 'enemyDied';
    readonly enemyId: number;
    readonly kind: EnemyKind;
    readonly position: Point;
  }
  | {
    readonly type: 'snackEarned';
    readonly enemyId: number;
    readonly kind: EnemyKind;
    readonly amount: number;
    readonly snacks: number;
  }
  | {
    readonly type: 'bossActiveChanged';
    readonly active: boolean;
    readonly activeBossCount: number;
  }
  | {
    readonly type: 'playerDamaged';
    readonly castId: string;
    readonly appliedAtStep: number;
    readonly sourceEnemyId: number;
    readonly sourceEnemyKind: EnemyKind;
    readonly amount: number;
    readonly effectiveAmount: number;
    readonly hp: number;
    readonly maxHp: number;
    readonly lethal: boolean;
    readonly position: Point;
    readonly impactDirection: Point;
    readonly strength: 'medium' | 'heavy';
  };

export type EnemyCombatEvent = EnemySystemCombatEvent;

export type SessionLifecycleEvent =
  | { readonly type: 'modeChanged'; readonly mode: GameMode }
  | { readonly type: 'runEnded'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'resultReady'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'enemySpawnRequested'; readonly request: EnemySpawnRequest }
  | {
    readonly type: 'enemySpawned';
    readonly enemyId: number;
    readonly request: EnemySpawnRequest;
  }
  | { readonly type: 'waveStarted'; readonly wave: WaveNumber }
  | {
    readonly type: 'waveTransition';
    readonly fromWave: Exclude<WaveNumber, 5>;
    readonly toWave: Exclude<WaveNumber, 1>;
    readonly countdownMs: 3000;
  }
  | { readonly type: 'waveCountdownChanged'; readonly remainingMs: number };

export type GameEvent =
  | DamageAppliedEvent
  | CoreCombatEvent
  | CoreStateEvent
  | EnemyCombatEvent
  | SessionLifecycleEvent;
