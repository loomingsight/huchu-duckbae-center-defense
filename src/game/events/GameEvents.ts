import type { EnemyAttackEvent } from '../combat/EnemyAttackSystem';
import type { ProjectileEvent } from '../combat/ProjectileSystem';
import type { GameMode } from '../core/GameMode';
import type { EnemyLifecycleEvent } from '../enemies/EnemySystem';
import type { SkillSelectionRequest } from '../progression/ProgressionTypes';
import type { ShelterDamageEvent } from '../shelter/ShelterSystem';
import type { SkillCard } from '../skills/SkillTypes';
import type { SkillCastCommand } from '../skills/SkillSystem';
import type { SkillId, SkillLevel } from '../types/GameTypes';
import type { Point } from '../world/Geometry';
import type { EnemySpawnRequest } from '../waves/WaveTypes';

export type GameEvent =
  | EnemyLifecycleEvent
  | EnemyAttackEvent
  | ProjectileEvent
  | ShelterDamageEvent
  | SkillCastCommand
  | { readonly type: 'modeChanged'; readonly mode: GameMode }
  | {
    readonly type: 'skillSelectionOpened';
    readonly request: SkillSelectionRequest;
    readonly cards: readonly SkillCard[];
  }
  | { readonly type: 'skillLearned'; readonly skillId: SkillId; readonly level: SkillLevel }
  | { readonly type: 'runEnded'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'enemySpawnRequested'; readonly request: EnemySpawnRequest }
  | {
    readonly type: 'enemySpawned';
    readonly enemyId: number;
    readonly request: EnemySpawnRequest;
  }
  | {
    readonly type: 'barkStarted';
    readonly attackId: string;
    readonly targetId: number;
  }
  | {
    readonly type: 'barkReleased';
    readonly attackId: string;
    readonly targetId: number;
    readonly origin: Point;
    readonly target: Point;
  }
  | { readonly type: 'waveCountdownChanged'; readonly remainingMs: number };
