import {
  EnemyAttackSystem,
  distanceToShelterBoundary,
} from '../../src/game/combat/EnemyAttackSystem';
import { ProjectileSystem } from '../../src/game/combat/ProjectileSystem';
import { BALANCE, attackImpactMs } from '../../src/game/data/balance';
import { EnemySystem } from '../../src/game/enemies/EnemySystem';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';
import type { EnemyKind } from '../../src/game/types/GameTypes';
import { attackFrameAt } from '../../src/game/world/AnimationFrameResolver';

const snapshot = (overrides: Partial<EnemySnapshot> = {}): EnemySnapshot => ({
  id: 1,
  kind: 'poopGuardian',
  variant: 'male',
  state: 'moving',
  pathId: 'P1',
  pathProgress: 77,
  position: { x: 270, y: 550 },
  etaMs: 0,
  currentHp: 60,
  maxHp: 60,
  spawnSequence: 0,
  isBoss: false,
  moveSpeedMultiplier: 1,
  slowRemainingMs: 0,
  dashCooldownRemainingMs: 4000,
  animationElapsedMs: 0,
  ...overrides,
});

const inRangeEnemy = (overrides: Partial<EnemySnapshot> = {}): EnemySnapshot =>
  snapshot(overrides);

const outOfRangeEnemy = (overrides: Partial<EnemySnapshot> = {}): EnemySnapshot =>
  snapshot({ position: { x: 270, y: 570 }, pathProgress: 76, ...overrides });

const attackSystemFor = (kind: EnemyKind): EnemyAttackSystem => new EnemyAttackSystem({
  kind,
  balance: BALANCE.enemies[kind],
  shelter: { center: { x: 270, y: 480 }, radius: 38 },
});

it('새 tail impact는 windup만 한 번 취소하고 holding/projectile은 지우지 않는다', () => {
  const attack = attackSystemFor('poopGuardian');
  const target = inRangeEnemy({ id: 3, state: 'windup' });
  attack.step(0, target);

  expect(attack.interruptWindup(3)).toBe(true);
  expect(attack.interruptWindup(3)).toBe(false);
  expect('stunnedMs' in target).toBe(false);

  attack.step(0, target);
  attack.step(250, target);
  expect(attack.snapshot(3).state).toBe('holding');
  expect(attack.interruptWindup(3)).toBe(false);
  expect(attack.snapshot(3).state).toBe('holding');
});

it('일반 공격은 250ms, 두 보스 공격은 500ms event frame에 release한다', () => {
  const regular = attackSystemFor('poopGuardian');
  const dogTrader = attackSystemFor('dogTrader');
  const illegalBreeder = attackSystemFor('illegalBreeder');
  expect(regular.step(249, inRangeEnemy({ id: 1 })).some(
    (event) => event.type === 'projectileRequested',
  )).toBe(false);
  expect(regular.step(1, inRangeEnemy({ id: 1 })).some(
    (event) => event.type === 'projectileRequested',
  )).toBe(true);
  expect(dogTrader.step(499, inRangeEnemy({ id: 2, kind: 'dogTrader', isBoss: true })).some(
    (event) => event.type === 'projectileRequested',
  )).toBe(false);
  expect(dogTrader.step(1, inRangeEnemy({ id: 2, kind: 'dogTrader', isBoss: true })).some(
    (event) => event.type === 'projectileRequested',
  )).toBe(true);
  expect(illegalBreeder.step(
    500,
    inRangeEnemy({ id: 4, kind: 'illegalBreeder', isBoss: true }),
  ).some((event) => event.type === 'projectileRequested')).toBe(true);
  expect(attackImpactMs(BALANCE.enemies.illegalBreeder.attackTiming)).toBe(500);
});

it('enemy castId와 kind는 attack start부터 projectile hit까지 보존된다', () => {
  const attack = attackSystemFor('poopGuardian');
  const target = inRangeEnemy({ id: 7 });
  const started = attack.step(0, target)[0];
  const projectileRequest = attack.step(250, target)
    .find((event) => event.type === 'projectileRequested')!;
  const projectiles = new ProjectileSystem(1);
  projectiles.spawn({ ...projectileRequest, id: 99 });
  expect(attack.interruptWindup(7)).toBe(false);
  const impactEvents = projectiles.step(500);

  expect([
    started,
    projectileRequest,
    impactEvents.find((event) => event.type === 'projectileHit'),
    impactEvents.find((event) => event.type === 'shelterDamageRequested'),
  ]).toEqual([
    expect.objectContaining({ type: 'attackStarted', castId: 'enemy:7:1', kind: 'poopGuardian' }),
    expect.objectContaining({
      type: 'projectileRequested', castId: 'enemy:7:1', kind: 'poopGuardian',
    }),
    expect.objectContaining({
      type: 'projectileHit',
      castId: 'enemy:7:1',
      projectileKind: 'poop',
      sourceEnemyId: 7,
      sourceEnemyKind: 'poopGuardian',
    }),
    expect.objectContaining({
      type: 'shelterDamageRequested',
      castId: 'enemy:7:1',
      sourceEnemyId: 7,
      sourceEnemyKind: 'poopGuardian',
      amount: 25,
      strength: 'medium',
    }),
  ]);
});

it('off-leash direct release도 250ms에 구조화된 보호소 요청을 낸다', () => {
  const attack = attackSystemFor('offLeashGuardian');
  const target = inRangeEnemy({ id: 8, kind: 'offLeashGuardian' });
  attack.step(0, target);
  expect(attack.step(250, target).find(
    (event) => event.type === 'shelterDamageRequested',
  )).toMatchObject({
    castId: 'enemy:8:1',
    sourceEnemyId: 8,
    sourceEnemyKind: 'offLeashGuardian',
    amount: 50,
    strength: 'medium',
    position: { x: 270, y: 480 },
    impactDirection: { x: 0, y: -1 },
  });
});

it('순수 projectile origin을 사용하고 0 방향은 위쪽 fallback으로 정규화한다', () => {
  const origin = { x: 120, y: 300 };
  const attack = new EnemyAttackSystem({
    kind: 'dogTrader',
    balance: BALANCE.enemies.dogTrader,
    shelter: { center: { x: 270, y: 480 }, radius: 38 },
    projectileOrigin: () => origin,
  });
  const target = inRangeEnemy({ id: 9, kind: 'dogTrader', isBoss: true });
  const request = attack.step(500, target).find(
    (event) => event.type === 'projectileRequested',
  );
  expect(request).toMatchObject({ from: origin, castId: 'enemy:9:1' });

  const direct = new EnemyAttackSystem({
    kind: 'offLeashGuardian',
    balance: BALANCE.enemies.offLeashGuardian,
    shelter: { center: { x: 270, y: 480 }, radius: 38 },
    projectileOrigin: () => ({ x: 270, y: 480 }),
  });
  expect(direct.step(250, inRangeEnemy({ id: 10 })).find(
    (event) => event.type === 'shelterDamageRequested',
  )).toMatchObject({ impactDirection: { x: 0, y: -1 } });
});

it('보스 projectile은 보호소 hit에 heavy 요청을 낸다', () => {
  const attack = attackSystemFor('dogTrader');
  const target = inRangeEnemy({ id: 11, kind: 'dogTrader', isBoss: true });
  const request = attack.step(500, target).find(
    (event) => event.type === 'projectileRequested',
  )!;
  const projectiles = new ProjectileSystem(1);
  projectiles.spawn({ ...request, id: 1 });
  const events = projectiles.step(500);
  expect(events.find((event) => event.type === 'projectileHit')).toMatchObject({
    castId: 'enemy:11:1',
    projectileKind: 'net',
    sourceEnemyId: 11,
    sourceEnemyKind: 'dogTrader',
  });
  expect(events.find((event) => event.type === 'shelterDamageRequested')).toMatchObject({
    castId: 'enemy:11:1',
    amount: 120,
    strength: 'heavy',
    sourceEnemyId: 11,
    sourceEnemyKind: 'dogTrader',
  });
});

it('발에서 보호소 원 경계까지의 거리를 사용한다', () => {
  expect(distanceToShelterBoundary(
    { x: 270, y: 566 },
    { x: 270, y: 480 },
    38,
  )).toBe(48);
});

it('release 전 범위 밖이면 동일 castId로 공격을 취소한다', () => {
  const attack = attackSystemFor('poopGuardian');
  attack.step(249, inRangeEnemy());
  expect(attack.step(1, outOfRangeEnemy())).toEqual([{
    type: 'attackCancelled',
    castId: 'enemy:1:1',
    enemyId: 1,
    kind: 'poopGuardian',
  }]);
});

it('release 뒤 holding에서 시작 시각 기준 interval로 다음 windup을 연다', () => {
  const attack = attackSystemFor('offLeashGuardian');
  const target = inRangeEnemy({ pathProgress: 77 });
  expect(attack.step(250, target).map((event) => event.type)).toEqual([
    'attackStarted',
    'shelterDamageRequested',
    'attackHolding',
  ]);
  expect(attack.snapshot(1)).toMatchObject({ state: 'holding', pathProgress: 77 });
  expect(attack.step(1549, target)).toEqual([]);
  expect(attack.step(1, target)).toEqual([{
    type: 'attackStarted',
    castId: 'enemy:1:2',
    enemyId: 1,
    kind: 'offLeashGuardian',
  }]);
});

it('windup에서 holding으로 바뀐 때 release frame elapsed를 보존한다', () => {
  const stepMs = 1000 / 60;
  const enemies = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P1' });
  const attack = attackSystemFor('offLeashGuardian');
  for (let tick = 0; tick < 15; tick += 1) {
    enemies.step(stepMs);
    for (const event of attack.step(stepMs, inRangeEnemy())) {
      if (event.type === 'attackStarted') enemies.setState(0, 'windup', stepMs);
      if (event.type === 'attackHolding') enemies.setState(0, 'holding');
    }
  }
  expect(enemies.snapshots()[0]!.animationElapsedMs).toBeCloseTo(250, 8);
  expect(attackFrameAt(enemies.snapshots()[0]!.animationElapsedMs)).toBe(6);
});

it('큰 step도 cadence 경계를 유실하지 않고 분할 step과 같은 event를 만든다', () => {
  const target = inRangeEnemy();
  const whole = attackSystemFor('offLeashGuardian');
  const split = attackSystemFor('offLeashGuardian');
  const wholeEvents = whole.step(3450, target);
  const splitEvents = Array.from({ length: 69 }, () => split.step(50, target)).flat();
  expect(wholeEvents).toEqual(splitEvents);
  expect(whole.snapshot(1)).toEqual(split.snapshot(1));
});

it('invalid attack step은 track 변경 전에 거부한다', () => {
  const attack = attackSystemFor('poopGuardian');
  for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => attack.step(stepMs, inRangeEnemy())).toThrow(RangeError);
  }
  expect(() => attack.snapshot(1)).toThrow('Unknown attack enemy 1');
  expect(attack.interruptWindup(99)).toBe(false);
});
