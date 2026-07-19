import { FIXED_STEP_MS } from '../../src/game/constants';
import {
  distanceToShelterBoundary,
} from '../../src/game/combat/EnemyAttackSystem';
import { EnemySystem } from '../../src/game/enemies/EnemySystem';
import { GameSession } from '../../src/game/session/GameSession';
import { attackFrameAt } from '../../src/game/world/AnimationFrameResolver';
import {
  attackSystemFor,
  inRangeEnemy,
  outOfRangeEnemy,
} from './fixtures';

it('발에서 보호소 원 경계까지의 거리를 사용한다', () => {
  expect(distanceToShelterBoundary(
    { x: 270, y: 566 },
    { x: 270, y: 480 },
    38,
  )).toBe(48);
});

it('release 전 범위 밖이면 공격을 취소한다', () => {
  const attack = attackSystemFor('poopGuardian');
  attack.step(249, inRangeEnemy());

  expect(attack.step(1, outOfRangeEnemy())).toEqual([
    { type: 'attackCancelled', enemyId: 1 },
  ]);
});

it('기절은 windup을 취소하고 interval을 처음부터 다시 센다', () => {
  const attack = attackSystemFor('offLeashGuardian');
  attack.step(200, inRangeEnemy());
  attack.stun(1, 3000);

  expect(attack.step(3000, inRangeEnemy())).toEqual([]);
  expect(attack.snapshot(1)).toMatchObject({ state: 'moving', cooldownMs: 1600 });
});

it('release 뒤 holding 상태로 위치를 고정하고 시작 시각 기준 interval에 다음 windup을 연다', () => {
  const attack = attackSystemFor('offLeashGuardian');
  const target = inRangeEnemy({ pathProgress: 77 });

  expect(attack.step(250, target).map((event) => event.type)).toEqual([
    'attackStarted',
    'shelterDamageRequested',
    'attackHolding',
  ]);
  expect(attack.snapshot(1)).toMatchObject({ state: 'holding', pathProgress: 77 });
  expect(attack.step(1349, target)).toEqual([]);
  expect(attack.step(1, target)).toEqual([{ type: 'attackStarted', enemyId: 1 }]);
  expect(attack.snapshot(1).state).toBe('windup');
});

it.each([
  ['poopGuardian', 'projectileRequested', 'poop', 220, 3],
  ['offLeashGuardian', 'shelterDamageRequested', undefined, undefined, 6],
  ['dogTrader', 'projectileRequested', 'net', 240, 14],
  ['illegalBreeder', 'projectileRequested', 'electric', 260, 18],
] as const)(
  '%s는 250ms release에 고유 공격을 한 번 만든다',
  (kind, type, projectileKind, speed, damage) => {
    const attack = attackSystemFor(kind);
    const before = attack.step(249, inRangeEnemy());
    expect(before.some((event) => event.type === type)).toBe(false);

    const released = attack.step(1, inRangeEnemy()).find((event) => event.type === type)!;
    if (projectileKind === undefined) expect(released).toMatchObject({ damage });
    else expect(released).toMatchObject({ projectileKind, speed, damage, lifeMs: 1200 });
  },
);

it('8fps 공격 frame은 0.25초 release에서 sheet frame 6이다', () => {
  expect([0, 125, 250, 375].map(attackFrameAt)).toEqual([4, 5, 6, 7]);
});

it('windup에서 holding으로 바뀔 때 release frame의 elapsed를 보존한다', () => {
  const stepMs = 1000 / 60;
  const enemies = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P1' });
  const attack = attackSystemFor('offLeashGuardian');
  let released = false;

  for (let tick = 0; tick < 15; tick += 1) {
    enemies.step(stepMs);
    for (const event of attack.step(stepMs, inRangeEnemy())) {
      if (event.type === 'attackStarted') enemies.setState(0, 'windup', stepMs);
      if (event.type === 'attackHolding') enemies.setState(0, 'holding');
      if (event.type === 'shelterDamageRequested') released = true;
    }
  }

  expect(released).toBe(true);
  expect(enemies.snapshots().at(0)!.animationElapsedMs).toBeCloseTo(250, 8);
  expect(attackFrameAt(enemies.snapshots().at(0)!.animationElapsedMs)).toBe(6);
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

it('GameSession은 off-leash release command를 보호소 피해로 정확히 한 번 소비한다', () => {
  const run = GameSession.create({ seed: 1 });
  run.suppressWaveSpawnsForScenario();
  run.spawnEnemyForScenario({
    kind: 'offLeashGuardian',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'attackBoundary' },
  });
  const events = Array.from({ length: 15 }, () => run.step(FIXED_STEP_MS, { x: 0, y: 0 })).flat();

  expect(run.snapshot()).toMatchObject({
    shelterHp: 94,
    activeEnemyCount: 1,
    enemies: [{ state: 'holding' }],
  });
  expect(run.snapshot().enemies.at(0)!.animationElapsedMs).toBeCloseTo(250, 8);
  expect(events.filter(({ type }) => type === 'shelterDamageRequested')).toHaveLength(1);
  expect(events.filter(({ type }) => type === 'shelterDamaged')).toHaveLength(1);

  expect(run.step(FIXED_STEP_MS, { x: 0, y: 0 }).filter(
    ({ type }) => type === 'shelterDamaged',
  )).toHaveLength(0);
  expect(run.snapshot().shelterHp).toBe(94);
});

it('holding cadence에서 다시 열린 windup animation은 경계 뒤 0ms부터 시작한다', () => {
  const run = GameSession.create({ seed: 1 });
  run.suppressWaveSpawnsForScenario();
  run.spawnEnemyForScenario({
    kind: 'offLeashGuardian',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'attackBoundary' },
  });

  for (let tick = 0; tick < 96; tick += 1) run.step(FIXED_STEP_MS, { x: 0, y: 0 });

  expect(run.snapshot().enemies.at(0)).toMatchObject({
    state: 'windup',
    animationElapsedMs: 0,
  });
});

it('invalid attack step과 stun duration은 track 변경 전에 거부한다', () => {
  const attack = attackSystemFor('poopGuardian');

  for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => attack.step(stepMs, inRangeEnemy())).toThrow(RangeError);
  }
  for (const durationMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => attack.stun(1, durationMs)).toThrow(RangeError);
  }
  expect(() => attack.snapshot(1)).toThrow('Unknown attack enemy 1');
});

it('GameSession stun은 이동·cooldown·animation을 함께 freeze하고 interval을 reset한다', () => {
  const run = GameSession.create({ seed: 1 });
  run.suppressWaveSpawnsForScenario();
  const enemyId = run.spawnEnemyForScenario({
    kind: 'offLeashGuardian',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'attackBoundary' },
  });
  for (let tick = 0; tick < 12; tick += 1) run.step(FIXED_STEP_MS, { x: 0, y: 0 });
  const before = run.snapshot().enemies.at(0)!;

  run.stunEnemy(enemyId, 3000);
  for (let tick = 0; tick < 180; tick += 1) run.step(FIXED_STEP_MS, { x: 0, y: 0 });

  expect(run.snapshot().enemies.at(0)).toMatchObject({
    state: 'moving',
    pathProgress: before.pathProgress,
    animationElapsedMs: 0,
  });
  expect(run.snapshot().shelterHp).toBe(100);
  const events = run.step(FIXED_STEP_MS, { x: 0, y: 0 });
  expect(events.filter(({ type }) => type === 'attackStarted')).toHaveLength(1);
});

it('GameSession knockback은 holding과 attack track을 함께 취소한다', () => {
  const run = GameSession.create({ seed: 1 });
  run.suppressWaveSpawnsForScenario();
  const enemyId = run.spawnEnemyForScenario({
    kind: 'offLeashGuardian',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'attackBoundary' },
  });
  for (let tick = 0; tick < 15; tick += 1) run.step(FIXED_STEP_MS, { x: 0, y: 0 });
  const atBoundary = run.snapshot().enemies.at(0)!;

  run.knockBackEnemy(enemyId, 20);

  expect(run.snapshot().enemies.at(0)).toMatchObject({
    state: 'moving',
    animationElapsedMs: 0,
  });
  expect(run.snapshot().enemies.at(0)!.pathProgress).toBeLessThan(atBoundary.pathProgress);
  expect(run.step(FIXED_STEP_MS, { x: 0, y: 0 }).filter(
    ({ type }) => type === 'shelterDamaged',
  )).toHaveLength(0);
  expect(run.snapshot().shelterHp).toBe(94);
});
