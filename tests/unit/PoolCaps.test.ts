import { ObjectPool } from '../../src/game/pooling/ObjectPool';
import { EnemyLabelPool } from '../../src/game/enemies/EnemyLabelPool';
import { DamageFeedbackPool } from '../../src/game/combat/DamageFeedbackPool';

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

it('presentation label pool cap은 60이며 reset은 새 pool을 만들지 않는다', () => {
  const labels = new EnemyLabelPool(createFakeScene() as never);
  const initial = labels.snapshot();
  const acquired = Array.from({ length: 60 }, () => labels.acquire());

  expect(acquired.every((label) => label !== undefined)).toBe(true);
  expect(labels.acquire()).toBeUndefined();
  labels.reset();
  expect(labels.snapshot()).toEqual(initial);
  expect(labels.acquire()).toBe(acquired.at(-1));
});

it('damage number pool cap은 64이며 reset은 새 pool을 만들지 않는다', () => {
  const damage = new DamageFeedbackPool(createFakeScene() as never);
  const initial = damage.snapshot();
  for (let targetId = 0; targetId < 64; targetId += 1) {
    damage.show({
      type: 'damageApplied', castId: `cast:${targetId}`, appliedAtStep: 1,
      targetId, amount: 1, effectiveAmount: 1, position: { x: 0, y: 0 },
      impactDirection: { x: 1, y: 0 }, source: 'bark', strength: 'light', lethal: false,
    });
  }
  expect(damage.snapshot()).toEqual({ ...initial, active: 64, available: 0 });
  damage.reset();
  expect(damage.snapshot()).toEqual(initial);
});

function createFakeScene(): object {
  const object = (): object => {
    const target = {};
    const proxy = new Proxy(target, {
      get: () => (..._args: unknown[]) => proxy,
    });
    return proxy;
  };
  return { add: { bitmapText: object, image: object } };
}
