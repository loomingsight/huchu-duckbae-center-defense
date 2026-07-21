import { FIXED_STEP_MS } from '../../src/game/constants';
import {
  ProjectileSystem,
  type ProjectileSpawn,
} from '../../src/game/combat/ProjectileSystem';

const projectile = (overrides: Partial<ProjectileSpawn> = {}): ProjectileSpawn => ({
  id: 1,
  castId: 'enemy:7:1',
  enemyId: 7,
  kind: 'poopGuardian',
  projectileKind: 'poop',
  from: { x: 270, y: 566 },
  to: { x: 270, y: 480 },
  speed: 220,
  damage: 25,
  lifeMs: 1200,
  ...overrides,
});

it('보호소 원에 닿을 때 구조화된 피해를 한 번 요청하고 풀로 반환한다', () => {
  const projectiles = new ProjectileSystem(80);
  projectiles.spawn(projectile());
  const events = projectiles.step(500);
  expect(events).toEqual([
    {
      type: 'projectileHit',
      castId: 'enemy:7:1',
      projectileId: 1,
      projectileKind: 'poop',
      sourceEnemyId: 7,
      sourceEnemyKind: 'poopGuardian',
      position: { x: 270, y: 518 },
    },
    {
      type: 'shelterDamageRequested',
      castId: 'enemy:7:1',
      sourceEnemyId: 7,
      sourceEnemyKind: 'poopGuardian',
      amount: 25,
      position: { x: 270, y: 480 },
      impactDirection: { x: 0, y: -1 },
      strength: 'medium',
    },
  ]);
  expect(projectiles.activeCount).toBe(0);
  expect(projectiles.step(500)).toEqual([]);
});

it('큰 step과 분할 step은 보호소 원의 같은 최초 교차 좌표에서 hit한다', () => {
  const input = projectile();
  const whole = new ProjectileSystem(1);
  const split = new ProjectileSystem(1);
  whole.spawn(input);
  split.spawn(input);
  const wholeHit = whole.step(500).find(({ type }) => type === 'projectileHit');
  const splitHit = Array.from({ length: 30 }, () => split.step(FIXED_STEP_MS))
    .flat()
    .find(({ type }) => type === 'projectileHit');
  expect(splitHit).toEqual(wholeHit);
});

it('cap 이후 투사체는 새 객체 생성이나 crash 없이 drop event로 끝난다', () => {
  const projectiles = new ProjectileSystem(1);
  const input = projectile();
  projectiles.spawn(input);
  expect(projectiles.spawn({ ...input, id: 2 })).toEqual([
    { type: 'projectileDropped', projectileId: 2, kind: 'poop', reason: 'capacity' },
  ]);
  expect(projectiles.poolSnapshot()).toMatchObject({ created: 1, active: 1 });
});

it('1200ms 만료도 한 번 반환되고 이후 step에서 다시 처리되지 않는다', () => {
  const projectiles = new ProjectileSystem(1, 0);
  projectiles.spawn(projectile({
    kind: 'illegalBreeder',
    projectileKind: 'electric',
    from: { x: 0, y: 0 },
    to: { x: 1000, y: 0 },
    speed: 1,
    damage: 160,
  }));
  expect(projectiles.step(1199)).toEqual([]);
  expect(projectiles.step(1)).toEqual([]);
  expect(projectiles.step(1)).toEqual([]);
  expect(projectiles.poolSnapshot()).toMatchObject({ active: 0, available: 1 });
});

it('한 step이 lifetime을 넘겨도 만료 뒤 경로의 늦은 충돌은 피해를 만들지 않는다', () => {
  const projectiles = new ProjectileSystem(1, 0);
  projectiles.spawn(projectile({
    kind: 'dogTrader',
    projectileKind: 'net',
    from: { x: 0, y: 0 },
    to: { x: 1000, y: 0 },
    speed: 1000,
    damage: 120,
    lifeMs: 100,
  }));
  expect(projectiles.step(1000)).toEqual([]);
  expect(projectiles.activeCount).toBe(0);
});

it('정확히 lifetime 경계에서 보호소 원에 닿으면 heavy 피해를 한 번 만든다', () => {
  const projectiles = new ProjectileSystem(1, 0);
  projectiles.spawn(projectile({
    kind: 'illegalBreeder',
    projectileKind: 'electric',
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
    speed: 1000,
    damage: 160,
    lifeMs: 100,
  }));
  expect(projectiles.step(1000)).toEqual([
    {
      type: 'projectileHit',
      castId: 'enemy:7:1',
      projectileId: 1,
      projectileKind: 'electric',
      sourceEnemyId: 7,
      sourceEnemyKind: 'illegalBreeder',
      position: { x: 100, y: 0 },
    },
    {
      type: 'shelterDamageRequested',
      castId: 'enemy:7:1',
      sourceEnemyId: 7,
      sourceEnemyKind: 'illegalBreeder',
      amount: 160,
      position: { x: 100, y: 0 },
      impactDirection: { x: 1, y: 0 },
      strength: 'heavy',
    },
  ]);
});

it('invalid step과 spawn 입력은 상태 변경 전에 거부한다', () => {
  for (const shelterRadius of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => new ProjectileSystem(1, shelterRadius)).toThrow(RangeError);
  }
  const projectiles = new ProjectileSystem(1);
  const input = projectile();
  for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => projectiles.step(stepMs)).toThrow(RangeError);
  }
  for (const invalid of [
    { ...input, castId: '' },
    { ...input, enemyId: -1 },
    { ...input, speed: Number.NaN },
    { ...input, damage: Number.POSITIVE_INFINITY },
    { ...input, lifeMs: Number.NaN },
    { ...input, from: { x: Number.NaN, y: 566 } },
  ]) {
    expect(() => projectiles.spawn(invalid)).toThrow(RangeError);
  }
  expect(projectiles.activeCount).toBe(0);
});

it('reports stable logical workload counters across capacity rejection, clear, and reuse', () => {
  const projectiles = new ProjectileSystem(1, 0);
  const counters = projectiles.workloadCounters();
  const poolInstanceId = projectiles.poolSnapshot().instanceId;

  expect(counters).toEqual({
    poolInstanceId,
    active: 0,
    logicalStepPasses: 0,
    logicalActorVisits: 0,
    activations: 0,
    releases: 0,
    rejected: 0,
  });
  expect(projectiles.workloadCounters()).toBe(counters);

  const initialCounters = { ...counters };
  expect(() => projectiles.step(Number.NaN)).toThrow(RangeError);
  expect(() => projectiles.spawn(projectile({ speed: Number.NaN }))).toThrow(RangeError);
  expect(counters).toEqual(initialCounters);

  projectiles.spawn(projectile());
  projectiles.spawn(projectile({ id: 2 }));
  projectiles.step(1);

  expect(counters).toMatchObject({
    poolInstanceId,
    active: 1,
    logicalStepPasses: 1,
    logicalActorVisits: 1,
    activations: 1,
    releases: 0,
    rejected: 1,
  });

  projectiles.clear();
  projectiles.spawn(projectile({ id: 3 }));
  projectiles.step(1200);

  expect(counters).toEqual({
    poolInstanceId,
    active: 0,
    logicalStepPasses: 2,
    logicalActorVisits: 2,
    activations: 2,
    releases: 2,
    rejected: 1,
  });
  expect(projectiles.workloadCounters()).toBe(counters);
  expect(projectiles.poolSnapshot().instanceId).toBe(poolInstanceId);

  projectiles.step(0);

  expect(counters).toMatchObject({
    active: 0,
    logicalStepPasses: 3,
    logicalActorVisits: 2,
  });
});
