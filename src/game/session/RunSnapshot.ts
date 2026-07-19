import type { GameMode } from '../core/GameMode';
import type { BarkSystem } from '../combat/BarkSystem';
import type { ProjectileSnapshot } from '../combat/ProjectileSystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { SkillSnapshot } from '../skills/SkillSystem';
import type { SkillId, SkillLevel } from '../types/GameTypes';

export interface RunSnapshot {
  readonly mode: GameMode;
  readonly simulationMs: number;
  readonly wave: number;
  readonly pendingSpawns: number;
  readonly activeEnemyCount: number;
  readonly activeProjectileCount: number;
  readonly shelterHp: number;
  readonly snacks: number;
  readonly enemies: readonly EnemySnapshot[];
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly skills: Readonly<Record<SkillId, SkillLevel>>;
  readonly skillStates: Readonly<Record<SkillId, SkillSnapshot>>;
  readonly barkState: ReturnType<BarkSystem['snapshot']>;
}
