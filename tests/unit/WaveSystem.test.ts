import { SeededRng } from '../../src/game/core/SeededRng';
import { WAVE_DEFINITIONS } from '../../src/game/data/waveDefinitions';
import { WaveSystem } from '../../src/game/waves/WaveSystem';

describe('WaveSystem', () => {
  it.each([
    [1, 10],
    [2, 14],
    [3, 7],
    [4, 18],
    [5, 15],
  ])('wave %i는 정확히 %i명을 예약한다', (wave, expected) => {
    expect(WAVE_DEFINITIONS.at(wave - 1)!.spawns).toHaveLength(expected);
  });

  it('wave 3 보스는 마지막 일반 적 2초 뒤 P3에서 나온다', () => {
    const wave = WAVE_DEFINITIONS.at(2)!;
    const boss = wave.spawns.at(-1)!;
    const lastRegular = wave.spawns.at(-2)!;

    expect(boss).toMatchObject({ kind: 'dogTrader', pathId: 'P3' });
    expect(boss.atMs - lastRegular.atMs).toBe(2000);
  });

  it('W1/W2의 exact path·kind schedule과 regular variant 교대를 지킨다', () => {
    expect(WAVE_DEFINITIONS.at(0)!.spawns.map(({ pathId, kind }) => [pathId, kind])).toEqual(
      Array.from({ length: 10 }, (_, index) => [
        index % 2 === 0 ? 'P1' : 'P2',
        'poopGuardian',
      ]),
    );
    expect(WAVE_DEFINITIONS.at(1)!.spawns.map(({ kind }) => kind)).toEqual([
      'poopGuardian',
      'offLeashGuardian',
      'offLeashGuardian',
      'poopGuardian',
      'offLeashGuardian',
      'offLeashGuardian',
      'poopGuardian',
      'offLeashGuardian',
      'offLeashGuardian',
      'poopGuardian',
      'offLeashGuardian',
      'offLeashGuardian',
      'poopGuardian',
      'poopGuardian',
    ]);
    for (const kind of ['poopGuardian', 'offLeashGuardian'] as const) {
      const variants = WAVE_DEFINITIONS
        .flatMap((wave) => wave.spawns)
        .filter((spawn) => spawn.kind === kind)
        .map((spawn) => spawn.variant);
      expect(variants.every(
        (variant, index) => variant === (index % 2 === 0 ? 'male' : 'female'),
      )).toBe(true);
    }
  });

  it.each([4, 5])('W%i의 동시 spawn은 2명이며 같은 path를 쓰지 않는다', (waveNumber) => {
    const regular = WAVE_DEFINITIONS
      .at(waveNumber - 1)!
      .spawns.filter((spawn) => !['dogTrader', 'illegalBreeder'].includes(spawn.kind));

    for (const atMs of new Set(regular.map((spawn) => spawn.atMs))) {
      const spawns = regular.filter((spawn) => spawn.atMs === atMs);
      expect(spawns).toHaveLength(2);
      expect(new Set(spawns.map((spawn) => spawn.pathId)).size).toBe(2);
    }
  });

  it('W5 boss variant는 injected RNG 하나로 고르고 P3에 둔다', () => {
    const male = new WaveSystem(WAVE_DEFINITIONS, { next: () => 0.1 }).previewBoss(5);
    const female = new WaveSystem(WAVE_DEFINITIONS, { next: () => 0.9 }).previewBoss(5);

    expect(male).toMatchObject({
      kind: 'illegalBreeder',
      variant: 'male',
      pathId: 'P3',
    });
    expect(female).toMatchObject({
      kind: 'illegalBreeder',
      variant: 'female',
      pathId: 'P3',
    });
  });

  it('W5 preview 후 start와 spawn까지 같은 cached variant를 쓰고 RNG는 총 한 번만 소비한다', () => {
    const values = [0.9, 0.1];
    let calls = 0;
    const system = new WaveSystem(WAVE_DEFINITIONS, {
      next: () => values[calls++]!,
    });

    const preview = system.previewBoss(5);
    system.start(5);
    const boss = system.step(10_000, 0).at(-1);

    expect(preview).toMatchObject({ kind: 'illegalBreeder', variant: 'female' });
    expect(boss).toMatchObject({ kind: 'illegalBreeder', variant: 'female' });
    expect(calls).toBe(1);
  });

  it('W5 start 후 preview도 start에서 고른 cached variant를 쓰고 RNG는 총 한 번만 소비한다', () => {
    const values = [0.1, 0.9];
    let calls = 0;
    const system = new WaveSystem(WAVE_DEFINITIONS, {
      next: () => values[calls++]!,
    });

    system.start(5);
    const preview = system.previewBoss(5);
    const boss = system.step(10_000, 0).at(-1);

    expect(preview).toMatchObject({ kind: 'illegalBreeder', variant: 'male' });
    expect(boss).toMatchObject({ kind: 'illegalBreeder', variant: 'male' });
    expect(calls).toBe(1);
  });

  it('dogTrader preview는 seeded variant가 아니므로 RNG를 소비하지 않는다', () => {
    let calls = 0;
    const system = new WaveSystem(WAVE_DEFINITIONS, {
      next: () => {
        calls += 1;
        return 0.9;
      },
    });

    expect(system.previewBoss(3)).toMatchObject({ kind: 'dogTrader', variant: 'male' });
    expect(calls).toBe(0);
  });

  it('W5 start에서 RNG를 정확히 한 번 소비하고 boss variant를 고정한다', () => {
    let calls = 0;
    const system = new WaveSystem(WAVE_DEFINITIONS, {
      next: () => {
        calls += 1;
        return 0.9;
      },
    });

    system.start(5);
    expect(calls).toBe(1);

    const first = system.step(5000, 60);
    const requests = system.step(5000, 0);
    expect(first).toEqual([]);
    expect(requests.at(-1)).toMatchObject({
      kind: 'illegalBreeder',
      variant: 'female',
      pathId: 'P3',
    });
    expect(calls).toBe(1);
  });

  it('활성 적 cap이 차면 spawn을 순서대로 보류하고 유실하거나 시간을 바꾸지 않는다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
    system.start(1);

    expect(system.step(10_000, 60)).toEqual([]);
    expect(system.pendingCount).toBe(10);
    expect(system.elapsed).toBe(10_000);

    expect(system.step(0, 59)).toEqual([
      expect.objectContaining({ atMs: 0, spawnSequence: 0 }),
    ]);
    const released = system.step(0, 0);
    expect(released.map(({ atMs }) => atMs)).toEqual(
      Array.from({ length: 9 }, (_, index) => (index + 1) * 1000),
    );
    expect(released.map(({ spawnSequence }) => spawnSequence)).toEqual(
      Array.from({ length: 9 }, (_, index) => index + 1),
    );
    expect(system.pendingCount).toBe(0);
  });

  it('동시 spawn도 cap 남은 자리만 내보내고 나머지는 다음 step까지 보류한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
    system.start(4);

    const first = system.step(0, 59);
    const second = system.step(0, 59);

    expect(first).toHaveLength(1);
    expect(first.at(0)).toMatchObject({ atMs: 0, pathId: 'P1', spawnSequence: 0 });
    expect(second).toHaveLength(1);
    expect(second.at(0)).toMatchObject({ atMs: 0, pathId: 'P2', spawnSequence: 1 });
  });

  it('start 전 step과 알 수 없는 wave를 fail-fast한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));

    expect(() => system.step(0, 0)).toThrow('WaveSystem.start must be called first');
    for (const wave of [0, 6, 1.5, Number.NaN]) {
      expect(() => system.start(wave)).toThrow(RangeError);
    }
  });

  it('유효하지 않은 stepMs와 active enemy count를 상태 변경 전에 거부한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
    system.start(1);

    for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => system.step(stepMs, 0)).toThrow(RangeError);
    }
    for (const activeEnemies of [-1, 1.5, 61, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => system.step(0, activeEnemies)).toThrow(RangeError);
    }
    expect(system.elapsed).toBe(0);
    expect(system.pendingCount).toBe(10);
  });

  it('start는 선택한 wave의 elapsed와 cursor를 초기화한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
    system.start(1);
    expect(system.step(2500, 0)).toHaveLength(3);

    system.start(2);

    expect(system.current).toBe(2);
    expect(system.elapsed).toBe(0);
    expect(system.pendingCount).toBe(14);
    expect(system.step(0, 0)).toEqual([
      expect.objectContaining({ atMs: 0, spawnSequence: 3 }),
    ]);
  });

  it('다음 wave는 번호만 한 번 예약하고 startPendingNext에서 정확히 한 번 시작한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
    system.start(1);

    system.setPendingNext(2);
    system.setPendingNext(2);

    expect(system.pendingNext).toBe(2);
    expect(system.current).toBe(1);
    expect(system.startPendingNext()).toBe(2);
    expect(system.current).toBe(2);
    expect(system.pendingNext).toBeNull();
    expect(() => system.startPendingNext()).toThrow('No next wave is pending');
  });

  it('현재 wave의 바로 다음 번호가 아닌 pending 예약은 상태 변경 전에 거부한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
    system.start(2);

    for (const nextWave of [2, 4, 6, 2.5, Number.NaN]) {
      expect(() => system.setPendingNext(nextWave)).toThrow(RangeError);
      expect(system.pendingNext).toBeNull();
      expect(system.current).toBe(2);
    }
  });

  it('boss가 없는 wave preview를 fail-fast한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));

    expect(() => system.previewBoss(1)).toThrow(RangeError);
    expect(() => system.previewBoss(0)).toThrow(RangeError);
  });

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('enemyCap %s를 positive safe integer가 아니면 거부한다', (enemyCap) => {
    expect(() => new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1), enemyCap))
      .toThrow(RangeError);
  });
});
