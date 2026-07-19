import { EnemyAttackSystem } from '../../src/game/combat/EnemyAttackSystem';
import { BALANCE } from '../../src/game/data/balance';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';
import { ProgressionSystem } from '../../src/game/progression/ProgressionSystem';
import { SkillSystem, type SkillContext } from '../../src/game/skills/SkillSystem';
import type { SkillLevels } from '../../src/game/skills/SkillTypes';
import type { EnemyKind, SkillId } from '../../src/game/types/GameTypes';

export const skillLevels = (overrides: Partial<SkillLevels> = {}): SkillLevels => ({
  bark: 1,
  scold: 0,
  aquaBeam: 0,
  deokbaeHowl: 0,
  safetyReport: 0,
  ...overrides,
});

export function pendingTwoSelections(): ProgressionSystem {
  const progression = new ProgressionSystem([8, 22, 40, 62, 88], 5000);
  progression.addSnacks(40);
  progression.takeNextRequest();
  progression.resolveSelection();
  progression.step(5000, { mode: 'playing', activeEnemies: 1 });
  progression.takeNextRequest();
  progression.resolveSelection();
  return progression;
}

export function enemy(overrides: Partial<EnemySnapshot> = {}): EnemySnapshot {
  return {
    id: 7,
    kind: 'poopGuardian',
    variant: 'male',
    state: 'moving',
    pathId: 'P1',
    pathProgress: 10,
    position: { x: 100, y: 100 },
    etaMs: 1000,
    currentHp: 35,
    maxHp: 35,
    spawnSequence: 0,
    isBoss: false,
    stunnedMs: 0,
    animationElapsedMs: 0,
    ...overrides,
  };
}

export const candidate = (overrides: Partial<EnemySnapshot> = {}): EnemySnapshot =>
  enemy({ id: 7, position: { x: 100, y: 100 }, ...overrides });

export const inRangeEnemy = (overrides: Partial<EnemySnapshot> = {}): EnemySnapshot =>
  enemy({ id: 1, position: { x: 270, y: 550 }, pathProgress: 77, ...overrides });

export const outOfRangeEnemy = (overrides: Partial<EnemySnapshot> = {}): EnemySnapshot =>
  enemy({ id: 1, position: { x: 270, y: 570 }, pathProgress: 76, ...overrides });

export const attackSystemFor = (kind: EnemyKind): EnemyAttackSystem => new EnemyAttackSystem({
  kind,
  balance: BALANCE.enemies[kind],
  shelter: { center: { x: 270, y: 480 }, radius: 38 },
});

export function learnedSkillSystem(id: Exclude<SkillId, 'bark'>): SkillSystem {
  return new SkillSystem(skillLevels({ [id]: 1 } as Partial<SkillLevels>));
}

export const emptySkillContext = (): SkillContext => ({
  player: { x: 270, y: 600 },
  enemies: [],
});

export const candidateAt = (
  x: number,
  y: number,
  etaMs: number,
  overrides: Partial<EnemySnapshot> = {},
): EnemySnapshot => enemy({ position: { x, y }, etaMs, ...overrides });
