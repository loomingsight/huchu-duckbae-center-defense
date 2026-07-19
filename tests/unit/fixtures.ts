import { EnemyAttackSystem } from '../../src/game/combat/EnemyAttackSystem';
import { BALANCE } from '../../src/game/data/balance';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';
import type { EnemyKind } from '../../src/game/types/GameTypes';

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
