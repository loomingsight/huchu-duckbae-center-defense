import { expectTypeOf } from 'vitest';
import { FIXED_STEP_MS } from '../../src/game/constants';
import { BALANCE } from '../../src/game/data/balance';
import { EnemySystem } from '../../src/game/enemies/EnemySystem';
import type { EnemySpawnRequest } from '../../src/game/waves/WaveTypes';

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
  const before = system.snapshots()[0]!;
  system.step(1000, { x: 430, y: 700 });
  const after = system.snapshots()[0]!;

  expect(after.position).not.toEqual(before.position);
  expect(Math.hypot(after.heading.x, after.heading.y)).toBeCloseTo(1, 10);
  expect(after.trailingPose.position).not.toEqual(after.position);
  expect(system.snapshots()[0]).toMatchObject({
    pathProgress: 44,
    moveSpeedMultiplier: 1,
    slowRemainingMs: 0,
  });
});

it('목표가 바뀌어도 순간 이동하지 않고 다음 step 거리만큼만 움직인다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P3' });
  system.step(200, { x: 120, y: 760 });
  const first = system.snapshots()[0]!;

  system.step(200, { x: 470, y: 760 });
  const second = system.snapshots()[0]!;

  expect(Math.hypot(second.position.x - first.position.x, second.position.y - first.position.y))
    .toBeLessThanOrEqual((42 + 64 / 4) * 0.2 + 1e-9);
  expect(second.pathProgress - first.pathProgress).toBeCloseTo((42 + 64 / 4) * 0.2, 9);
});

it('60마리가 한 번의 NavigationField 재계산을 공유한다', () => {
  const system = EnemySystem.withEnemies(60);

  system.step(FIXED_STEP_MS, { x: 270, y: 480 });

  expect(system.navigationSnapshot()).toMatchObject({ recomputeCount: 1 });
  expect(system.snapshots()).toHaveLength(60);
});

it('slow가 step 중간에 끝나면 0.6/정상 구간을 나눠 적분한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P3' });
  const id = system.snapshots()[0]!.id;
  system.applyTailEffect(id, { knockbackPx: 35, multiplier: 0.6, durationMs: 10 });
  const before = system.snapshots()[0]!.pathProgress;

  system.step(20);

  expect(system.snapshots()[0]!.pathProgress - before)
    .toBeCloseTo(44 * 0.6 * 0.01 + 44 * 0.01, 9);
  expect(system.snapshots()[0]).toMatchObject({ moveSpeedMultiplier: 1, slowRemainingMs: 0 });
});

it('재감속은 배율을 중첩하지 않고 더 긴 남은 시간만 보존한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'dogTrader', pathId: 'P3' });
  const id = system.snapshots()[0]!.id;
  system.applyTailEffect(id, { knockbackPx: 0, multiplier: 0.8, durationMs: 1000 });
  system.step(400);
  system.applyTailEffect(id, { knockbackPx: 0, multiplier: 0.8, durationMs: 300 });

  expect(system.snapshots()[0]).toMatchObject({
    moveSpeedMultiplier: 0.8,
    slowRemainingMs: 600,
  });
});

it('오프리시 보호자는 4초 경계를 지나도 매 프레임 연속 이동한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P3' });
  const id = system.snapshots()[0]!.id;
  system.applyTailEffect(id, { knockbackPx: 0, multiplier: 0.6, durationMs: 5000 });
  const continuousSpeed = 42 + 64 / 4;
  const maximumStepProgress = continuousSpeed * 0.6 * FIXED_STEP_MS / 1000;

  let previousProgress = system.snapshots()[0]!.pathProgress;
  for (let tick = 0; tick < 250; tick += 1) {
    system.step(FIXED_STEP_MS);
    const progress = system.snapshots()[0]!.pathProgress;
    expect(progress - previousProgress).toBeLessThanOrEqual(maximumStepProgress + 1e-9);
    previousProgress = progress;
  }

  expect(system.snapshots()[0]!.pathProgress)
    .toBeCloseTo(continuousSpeed * 0.6 * (250 / 60), 9);
});

it('slow 경계를 포함한 큰 step은 같은 합계의 분할 step과 같다', () => {
  const whole = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P3' });
  const split = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P3' });
  whole.applyTailEffect(0, { knockbackPx: 0, multiplier: 0.6, durationMs: 4010 });
  split.applyTailEffect(0, { knockbackPx: 0, multiplier: 0.6, durationMs: 4010 });

  whole.step(5000);
  split.step(4000);
  split.step(10);
  split.step(990);

  expect(whole.snapshots()).toEqual(split.snapshots());
});

it('sub-epsilon slow 경계에서 snapshot ETA는 종료하고 finite하다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P3' });
  system.applyTailEffect(0, { knockbackPx: 0, multiplier: 0.6, durationMs: 4000 });

  system.step(3999.999_999_95);

  expect(Number.isFinite(system.snapshots()[0]!.etaMs)).toBe(true);
});

it('off-leash의 매우 큰 finite step도 도달 경계에서 즉시 종료한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P3' });

  system.step(1e20);
  const settled = system.snapshots()[0]!;
  system.step(1e20);

  expect(settled).toMatchObject({ state: 'moving', etaMs: 0 });
  expect(system.snapshots()[0]).toMatchObject({
    state: 'moving',
    etaMs: 0,
    pathProgress: settled.pathProgress,
    position: settled.position,
  });
});

it('일반 적의 매우 큰 finite step도 도달 경계에서 즉시 종료한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P3' });

  system.step(1e20);
  const settled = system.snapshots()[0]!;

  expect(settled).toMatchObject({ state: 'moving', etaMs: 0 });
  expect(Number.isFinite(settled.pathProgress)).toBe(true);
});

it('slow의 sub-epsilon 경계에서는 배율을 풀되 위치를 건너뛰지 않는다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P3' });
  system.applyTailEffect(0, { knockbackPx: 0, multiplier: 0.6, durationMs: 4000 });

  system.step(3999.999_999_95);

  expect(system.snapshots()[0]).toMatchObject({
    moveSpeedMultiplier: 1,
    slowRemainingMs: 0,
    dashCooldownRemainingMs: 0,
  });
  expect(system.snapshots()[0]!.pathProgress)
    .toBeCloseTo((42 + 64 / 4) * 0.6 * 3.999_999_999_95, 8);
});

it('dogTrader는 경로 시작점에서 즉시 보이고 넉백도 진입점 밖으로 밀리지 않는다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'dogTrader', pathId: 'P3' });
  const before = system.snapshots()[0]!;
  expect(before.pathProgress).toBe(0);
  expect(before.etaMs).toBeGreaterThan(0);

  const nearStart = EnemySystem.withSingleEnemy({
    kind: 'dogTrader',
    pathId: 'P3',
    initialProgress: 10,
  });
  nearStart.applyTailEffect(0, { knockbackPx: 35, multiplier: 0.8, durationMs: 1000 });
  expect(nearStart.snapshots()[0]!.pathProgress).toBe(0);
  nearStart.knockBack(0, 1000);
  expect(nearStart.snapshots()[0]!.pathProgress).toBe(0);
});

it('dogTrader 기본 ETA는 진행도 0을 명시한 경우와 같다', () => {
  const defaultEntry = EnemySystem.withSingleEnemy({ kind: 'dogTrader', pathId: 'P3' });
  const atEntry = EnemySystem.withSingleEnemy({
    kind: 'dogTrader',
    pathId: 'P3',
    initialProgress: 0,
  });

  expect(defaultEntry.snapshots()[0]!.etaMs).toBe(atEntry.snapshots()[0]!.etaMs);
});

it('감속 중 snapshot ETA는 남은 slow을 복사 적분하고 실제 상태는 변경하지 않는다', () => {
  const normal = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P3' });
  const slowed = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P3' });
  slowed.applyTailEffect(0, { knockbackPx: 0, multiplier: 0.6, durationMs: 1500 });
  const first = slowed.snapshots()[0]!;

  expect(first.etaMs).toBeGreaterThan(normal.snapshots()[0]!.etaMs);
  expect(slowed.snapshots()[0]).toEqual(first);
  expect(Number.isFinite(first.etaMs)).toBe(true);
});

it('일반 적 slow ETA delta를 정확히 반영하고 초기 ETA만큼 step하면 0에 도달한다', () => {
  const normal = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P3' });
  const slowed = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P3' });
  slowed.applyTailEffect(0, { knockbackPx: 0, multiplier: 0.6, durationMs: 1500 });
  const initialEtaMs = slowed.snapshots()[0]!.etaMs;

  expect(initialEtaMs - normal.snapshots()[0]!.etaMs).toBeCloseTo(600, 9);
  slowed.step(initialEtaMs);
  expect(slowed.snapshots()[0]!.etaMs).toBe(0);
});

it('off-leash ETA는 남은 slow을 동일하게 적분하고 그 시간만큼 step하면 0에 도달한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P3' });
  system.applyTailEffect(0, { knockbackPx: 0, multiplier: 0.6, durationMs: 5000 });
  system.step(1250);
  const initialEtaMs = system.snapshots()[0]!.etaMs;

  system.step(initialEtaMs);

  expect(system.snapshots()[0]!.etaMs).toBe(0);
});

it('tail impact는 windup만 일회 이동으로 돌리고 holding은 유지한다', () => {
  const windup = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  windup.setState(0, 'windup', 100);
  expect(windup.applyTailEffect(0, {
    knockbackPx: 0,
    multiplier: 0.6,
    durationMs: 1000,
  })).toEqual({ interruptedWindup: true });
  expect(windup.snapshots()[0]).toMatchObject({ state: 'moving', animationElapsedMs: 0 });
  expect(windup.applyTailEffect(0, {
    knockbackPx: 0,
    multiplier: 0.6,
    durationMs: 1000,
  })).toEqual({ interruptedWindup: false });

  const holding = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  holding.setState(0, 'holding');
  expect(holding.applyTailEffect(0, {
    knockbackPx: 0,
    multiplier: 0.6,
    durationMs: 1000,
  })).toEqual({ interruptedWindup: false });
  expect(holding.snapshots()[0]!.state).toBe('holding');
});

it('공격 경계에서 진행도를 clamp하고 moving 상태는 유지한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  system.step(1_000_000);
  const atBoundary = system.snapshots()[0]!;
  system.step(1000);
  expect(system.snapshots()[0]).toMatchObject({
    state: 'moving',
    pathProgress: atBoundary.pathProgress,
    position: atBoundary.position,
    etaMs: 0,
  });
});

it('HP 0 이하에서 사망·간식을 정확히 한 번 발생시킨다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'dogTrader', pathId: 'P3' });
  expect(system.damage(0, BALANCE.enemies.dogTrader.hp - 1)).toEqual([]);
  expect(system.snapshots()[0]!.currentHp).toBe(1);
  expect(system.damage(0, 1)).toEqual([
    { type: 'enemyDied', enemyId: 0 },
    { type: 'snackEarned', enemyId: 0, amount: BALANCE.enemies.dogTrader.snack },
  ]);
  expect(system.damage(0, 1)).toEqual([]);
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

it('step과 tail mutation의 invalid number는 fail-fast하고 valid unknown id는 no-op한다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => system.step(stepMs)).toThrow(RangeError);
  }
  for (const effect of [
    { knockbackPx: -1, multiplier: 0.6, durationMs: 1 },
    { knockbackPx: 1, multiplier: 0, durationMs: 1 },
    { knockbackPx: 1, multiplier: Number.NaN, durationMs: 1 },
    { knockbackPx: 1, multiplier: 0.6, durationMs: Number.POSITIVE_INFINITY },
  ]) {
    expect(() => system.applyTailEffect(0, effect)).toThrow(RangeError);
  }
  expect(system.applyTailEffect(99, {
    knockbackPx: 35,
    multiplier: 0.6,
    durationMs: 1500,
  })).toEqual({ interruptedWindup: false });
  expect(() => system.knockBack(99, 10)).not.toThrow();
  expect(() => system.applyPathProgress(99, 10)).not.toThrow();
  expect(() => system.removeWithoutReward(99)).not.toThrow();
});

it('clear는 enemy id를 0으로 재설정한다', () => {
  const system = EnemySystem.createDefault();
  system.spawn(spawnRequest(42));
  system.clear();
  expect(system.spawn(spawnRequest(0))).toBe(0);
});

it('setState는 공격 상태 세 개만 type/runtime에서 허용한다', () => {
  expectTypeOf<Parameters<EnemySystem['setState']>[1]>().toEqualTypeOf<
    'moving' | 'windup' | 'holding'
  >();
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  system.setState(0, 'windup', 125);
  system.setState(0, 'holding');
  expect(system.snapshots()[0]).toMatchObject({ state: 'holding', animationElapsedMs: 125 });
  system.setState(0, 'moving');
  expect(system.snapshots()[0]).toMatchObject({ state: 'moving', animationElapsedMs: 0 });
  for (const state of ['stunned', 'dead', 'unknown'] as const) {
    expect(() => system.setState(0, state as never)).toThrow(RangeError);
  }
});
