import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';

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
