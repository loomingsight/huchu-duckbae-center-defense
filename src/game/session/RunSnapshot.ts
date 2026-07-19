import type { GameMode } from '../core/GameMode';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
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
  readonly skills: Readonly<Record<SkillId, SkillLevel>>;
}
