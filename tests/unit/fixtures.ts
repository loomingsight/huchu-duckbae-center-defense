import { EnemyAttackSystem } from '../../src/game/combat/EnemyAttackSystem';
import { BALANCE } from '../../src/game/data/balance';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';
import { SkillSystem, type SkillContext } from '../../src/game/skills/SkillSystem';
import type { EnemyKind, PurchasableSkillId } from '../../src/game/types/GameTypes';

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
    moveSpeedMultiplier: 1,
    slowRemainingMs: 0,
    dashCooldownRemainingMs: 4000,
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

export function learnedSkillSystem(id: PurchasableSkillId, learnedAtMs = 0): SkillSystem {
  const system = new SkillSystem();
  system.learn(id, learnedAtMs);
  return system;
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
