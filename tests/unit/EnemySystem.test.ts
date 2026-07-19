import { EnemySystem } from '../../src/game/enemies/EnemySystem';
import { BALANCE } from '../../src/game/data/balance';
import type { EnemySpawnRequest } from '../../src/game/waves/WaveTypes';
import { expectTypeOf } from 'vitest';

const spawnRequest = (
  spawnSequence: number,
  overrides: Partial<EnemySpawnRequest> = {},
): EnemySpawnRequest => ({
  atMs: 0,
  kind: 'poopGuardian',
  pathId: 'P1',
  variant: 'male',
  spawnSequence,
  ...overrides,
});

it('속도만큼 경로 진행도를 늘린다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });

  system.step(1000);

  expect(system.snapshots().at(0)!.pathProgress).toBeCloseTo(44, 5);
});

it('HP 0 이하에서 사망·간식을 정확히 한 번 발생시킨다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });

  expect(system.damage(0, 100).map((event) => event.type)).toEqual([
    'enemyDied',
    'snackEarned',
  ]);
  expect(system.damage(0, 100)).toEqual([]);
});

it('3000ms 기절은 60Hz 정확히 180 tick 뒤 풀린다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });

  system.stun(0, 3000);
  for (let tick = 0; tick < 179; tick += 1) system.step(1000 / 60);
  expect(system.snapshots().at(0)!.state).toBe('stunned');
  system.step(1000 / 60);

  expect(system.snapshots().at(0)!.state).toBe('moving');
});

it('fractional 기절 종료 tick은 남은 시간만 이동과 animation에 소비한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  const stunMs = 17;

  system.stun(0, stunMs);
  system.step(1000 / 60);
  system.step(1000 / 60);

  const activeMs = 2 * 1000 / 60 - stunMs;
  expect(system.snapshots().at(0)).toMatchObject({
    state: 'moving',
    stunnedMs: 0,
  });
  expect(system.snapshots().at(0)!.pathProgress).toBeCloseTo(44 * activeMs / 1000, 8);
  expect(system.snapshots().at(0)!.animationElapsedMs).toBeCloseTo(activeMs, 8);
});

it('fractional 기절을 포함한 큰 step은 같은 합계의 분할 step과 같다', () => {
  const whole = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  const split = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  whole.stun(0, 17);
  split.stun(0, 17);

  whole.step(1017);
  split.step(17);
  split.step(1000);

  expect(whole.snapshots()).toEqual(split.snapshots());
});

it('공격 경계에서 진행도를 clamp하고 moving 상태는 유지한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });

  system.step(1_000_000);
  const atBoundary = system.snapshots().at(0)!;
  system.step(1000);

  expect(system.snapshots().at(0)).toMatchObject({
    state: 'moving',
    pathProgress: atBoundary.pathProgress,
    position: atBoundary.position,
    etaMs: 0,
  });
});

it('피해는 HP를 0에 clamp하고 적 종류의 간식만 한 번 보상한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'dogTrader', pathId: 'P3' });

  expect(system.damage(0, 599)).toEqual([]);
  expect(system.snapshots().at(0)!.currentHp).toBe(1);
  expect(system.damage(0, 1000)).toEqual([
    { type: 'enemyDied', enemyId: 0 },
    { type: 'snackEarned', enemyId: 0, amount: BALANCE.enemies.dogTrader.snack },
  ]);
  expect(system.activeCount).toBe(0);
  expect(system.damage(0, 1)).toEqual([]);
});

it('knockback은 경로 앞으로만 clamp하고 기절·애니메이션을 취소한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  system.step(1000);
  system.stun(0, 3000);

  system.knockBack(0, 20);

  expect(system.snapshots().at(0)).toMatchObject({
    pathProgress: 24,
    state: 'moving',
    stunnedMs: 0,
    animationElapsedMs: 0,
  });
  system.knockBack(0, 1000);
  expect(system.snapshots().at(0)!.pathProgress).toBe(0);
});

it('absolute path progress API는 nextPathProgress를 distance로 재해석하지 않고 position/상태를 동기화한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  system.step(1000);
  system.stun(0, 3000);

  system.applyPathProgress(0, 10);

  const applied = system.snapshots().at(0)!;
  expect(applied).toMatchObject({
    pathProgress: 10,
    state: 'moving',
    stunnedMs: 0,
    animationElapsedMs: 0,
  });
  expect(applied.position).not.toEqual({ x: 0, y: 0 });
  system.knockBack(0, 4);
  expect(system.snapshots().at(0)!.pathProgress).toBe(6);
});

it('snapshot을 spawnSequence, id 순으로 결정적 정렬한다', () => {
  const system = EnemySystem.createDefault();
  system.spawn(spawnRequest(2, { pathId: 'P3' }));
  system.spawn(spawnRequest(0, { pathId: 'P2', variant: 'female' }));
  system.spawn(spawnRequest(0, { pathId: 'P1' }));

  expect(system.snapshots().map(({ id, spawnSequence }) => ({ id, spawnSequence }))).toEqual([
    { id: 1, spawnSequence: 0 },
    { id: 2, spawnSequence: 0 },
    { id: 0, spawnSequence: 2 },
  ]);
});

it('60개 cap이 차면 spawn을 fail-fast하고 상태를 보존한다', () => {
  const system = EnemySystem.createDefault();
  for (let index = 0; index < BALANCE.caps.enemies; index += 1) {
    system.spawn(spawnRequest(index));
  }

  expect(() => system.spawn(spawnRequest(60))).toThrow('Enemy cap reached');
  expect(system.activeCount).toBe(60);
  expect(system.snapshots().at(-1)!.spawnSequence).toBe(59);
});

it('scenario seed는 실제 path 투영·공격 경계와 HP/state를 적용한다', () => {
  const system = EnemySystem.createDefault();
  const first = system.spawnForScenario({
    kind: 'poopGuardian',
    variant: 'female',
    pathId: 'P4',
    placement: { kind: 'worldPoint', x: 170, y: 445 },
    currentHp: 17,
    maxHp: 35,
    state: 'stunned',
    stunnedMs: 60_000,
  });
  const second = system.spawnForScenario({
    kind: 'dogTrader',
    variant: 'male',
    pathId: 'P3',
    placement: { kind: 'attackBoundary' },
  });

  expect(first).toEqual({
    enemyId: 0,
    request: spawnRequest(0, { variant: 'female', pathId: 'P4' }),
  });
  expect(system.snapshots().find(({ id }) => id === first.enemyId)).toMatchObject({
    position: { x: 170, y: 445 },
    currentHp: 17,
    maxHp: 35,
    state: 'stunned',
    stunnedMs: 60_000,
  });
  expect(system.snapshots().find(({ id }) => id === second.enemyId)).toMatchObject({ etaMs: 0 });
});

it('invalid scenario seed는 적을 추가하기 전에 fail-fast한다', () => {
  const invalidSeeds = [
    { currentHp: 0, maxHp: 35 },
    { currentHp: 36, maxHp: 35 },
    { currentHp: Number.NaN, maxHp: 35 },
    { currentHp: 1, maxHp: Number.POSITIVE_INFINITY },
    { currentHp: 1, maxHp: 35, placement: { kind: 'worldPoint', x: Number.NaN, y: 0 } },
    { currentHp: 1, maxHp: 35, state: 'stunned', stunnedMs: 0 },
  ] as const;

  for (const seed of invalidSeeds) {
    const system = EnemySystem.createDefault();
    expect(() => system.spawnForScenario({
      kind: 'poopGuardian',
      variant: 'male',
      pathId: 'P1',
      placement: { kind: 'attackBoundary' },
      ...seed,
    } as never)).toThrow(RangeError);
    expect(system.activeCount).toBe(0);
  }
});

it('spawn의 invalid numeric·kind·variant·path를 상태 변경 전에 fail-fast한다', () => {
  const invalid = [
    spawnRequest(0, { atMs: Number.NaN }),
    spawnRequest(0, { atMs: -1 }),
    spawnRequest(1.5),
    spawnRequest(Number.POSITIVE_INFINITY),
    spawnRequest(0, { pathId: 'constructor' as never }),
    spawnRequest(0, { kind: 'unknown' as never }),
    spawnRequest(0, { variant: 'seeded' as never }),
  ];

  for (const request of invalid) {
    const system = EnemySystem.createDefault();
    expect(() => system.spawn(request)).toThrow(RangeError);
    expect(system.activeCount).toBe(0);
  }
});

it('step과 mutation API의 invalid number는 fail-fast하고 valid unknown id는 no-op한다', () => {
  for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
    const before = system.snapshots();
    expect(() => system.step(stepMs)).toThrow(RangeError);
    expect(system.snapshots()).toEqual(before);
  }

  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  expect(system.damage(99, 1)).toEqual([]);
  expect(() => system.damage(Number.NaN, 1)).toThrow(RangeError);
  expect(() => system.damage(0, Number.NaN)).toThrow(RangeError);
  expect(system.damage(0, 0)).toEqual([]);
  expect(() => system.stun(0, -1)).toThrow(RangeError);
  expect(() => system.stun(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  expect(() => system.knockBack(0, -1)).toThrow(RangeError);
  expect(() => system.knockBack(0, Number.NaN)).toThrow(RangeError);
  expect(() => system.applyPathProgress(0, -1)).toThrow(RangeError);
  expect(() => system.applyPathProgress(0, Number.NaN)).toThrow(RangeError);
  expect(() => system.stun(99, 1000)).not.toThrow();
  expect(() => system.knockBack(99, 10)).not.toThrow();
  expect(() => system.applyPathProgress(99, 10)).not.toThrow();
  expect(() => system.removeWithoutReward(99)).not.toThrow();
});

it('clear는 enemy id와 scenario spawnSequence를 0으로 재설정한다', () => {
  const system = EnemySystem.createDefault();
  system.spawn(spawnRequest(42));
  system.clear();

  expect(system.spawnForScenario({
    kind: 'poopGuardian',
    variant: 'male',
    pathId: 'P1',
    placement: { kind: 'attackBoundary' },
  })).toEqual({ enemyId: 0, request: spawnRequest(0) });
});

it('setState는 Task 9 공격 상태 세 개만 type/runtime에서 허용한다', () => {
  expectTypeOf<Parameters<EnemySystem['setState']>[1]>().toEqualTypeOf<
    'moving' | 'windup' | 'holding'
  >();
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });

  system.setState(0, 'windup', 125);
  expect(system.snapshots().at(0)).toMatchObject({ state: 'windup', animationElapsedMs: 125 });
  system.setState(0, 'holding');
  expect(system.snapshots().at(0)).toMatchObject({ state: 'holding', animationElapsedMs: 125 });
  system.setState(0, 'moving');
  expect(system.snapshots().at(0)).toMatchObject({ state: 'moving', animationElapsedMs: 0 });
});

it('setState는 stunned·dead·unknown을 active enemy 변경 전에 거부한다', () => {
  for (const state of ['stunned', 'dead', 'unknown'] as const) {
    const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
    const before = system.snapshots();

    expect(() => system.setState(0, state as never)).toThrow(RangeError);

    expect(system.snapshots()).toEqual(before);
    expect(system.activeCount).toBe(1);
    expect(system.damage(0, 100)).toEqual([
      { type: 'enemyDied', enemyId: 0 },
      { type: 'snackEarned', enemyId: 0, amount: 1 },
    ]);
  }
});

it('setState는 state·animation을 unknown id 조회보다 먼저 검증하고 valid unknown id는 no-op한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  const before = system.snapshots();

  expect(() => system.setState(99, 'windup', 125)).not.toThrow();
  expect(() => system.setState(99, 'dead' as never)).toThrow(RangeError);
  for (const elapsedMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => system.setState(99, 'moving', elapsedMs)).toThrow(RangeError);
  }

  expect(system.snapshots()).toEqual(before);
});
