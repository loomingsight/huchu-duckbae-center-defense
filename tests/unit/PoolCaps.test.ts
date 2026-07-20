import { ObjectPool } from '../../src/game/pooling/ObjectPool';

it('cap을 넘는 acquire를 거부하고 release한 객체를 재사용한다', () => {
  const pools = {
    enemies: new ObjectPool(60, () => ({ kind: 'enemy' })),
    projectiles: new ObjectPool(80, () => ({ kind: 'projectile' })),
    effects: new ObjectPool(120, () => ({ kind: 'effect' })),
  };
  const cycle = <T extends object>(pool: ObjectPool<T>, cap: number): void => {
    const acquired = Array.from({ length: cap }, () => pool.acquire()!);
    expect(pool.acquire()).toBeUndefined();
    for (const item of acquired) pool.release(item);
  };
  cycle(pools.enemies, 60);
  cycle(pools.projectiles, 80);
  cycle(pools.effects, 120);
  const initial = {
    enemies: pools.enemies.snapshot(),
    projectiles: pools.projectiles.snapshot(),
    effects: pools.effects.snapshot(),
  };
  for (let iteration = 0; iteration < 3; iteration += 1) {
    cycle(pools.enemies, 60);
    cycle(pools.projectiles, 80);
    cycle(pools.effects, 120);
  }
  expect({
    enemies: pools.enemies.snapshot(),
    projectiles: pools.projectiles.snapshot(),
    effects: pools.effects.snapshot(),
  }).toEqual(initial);
  expect(initial).toMatchObject({
    enemies: { created: 60 },
    projectiles: { created: 80 },
    effects: { created: 120 },
  });
});
