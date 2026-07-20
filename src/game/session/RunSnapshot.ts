import type { ProjectileSnapshot } from '../combat/ProjectileSystem';
import type { CompanionSnapshot } from '../companions/CompanionSystem';
import type { GameMode } from '../core/GameMode';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { SkillSnapshot } from '../skills/SkillSystem';
import type { PurchasableSkillId, SkillCost } from '../types/GameTypes';

export type WaveNumber = 1 | 2 | 3 | 4 | 5;

export interface RunSnapshot {
  readonly mode: GameMode;
  readonly simulationMs: number;
  readonly wave: WaveNumber;
  readonly shelterHp: number;
  readonly shelterMaxHp: 1000;
  readonly snacks: number;
  readonly nextSkillCost: SkillCost | null;
  readonly learnedSkills: Readonly<Record<PurchasableSkillId, boolean>>;
  readonly skillStates: Readonly<Record<PurchasableSkillId, SkillSnapshot>>;
  readonly companion: CompanionSnapshot;
  readonly enemies: readonly EnemySnapshot[];
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly activeEnemyCount: number;
  readonly pendingSpawns: number;
  readonly activeProjectileCount: number;
}
