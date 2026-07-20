import { SeededRng } from '../../src/game/core/SeededRng';
import { WAVE_DEFINITIONS } from '../../src/game/data/waveDefinitions';
import type { EnemyKind } from '../../src/game/types/GameTypes';
import { PathDeck } from '../../src/game/waves/PathDeck';
import { WaveSystem } from '../../src/game/waves/WaveSystem';
import type { WaveDefinition } from '../../src/game/waves/WaveTypes';

const summarize = (definitions: readonly WaveDefinition[]) => definitions.map((definition) => {
  const counts: Record<EnemyKind, number> = {
    poopGuardian: 0,
    offLeashGuardian: 0,
    dogTrader: 0,
    illegalBreeder: 0,
  };
  for (const [, poopCount, offLeashCount, bossKind] of definition.groups) {
    counts.poopGuardian += poopCount;
    counts.offLeashGuardian += offLeashCount;
    if (bossKind !== undefined) counts[bossKind] += 1;
  }
  return {
    ...counts,
    times: definition.groups.map(([atSeconds]) => atSeconds),
  };
});

describe('PathDeck', () => {
  it('한 event는 path를 중복하지 않고 deck 소진 뒤 seeded reshuffle한다', () => {
    const first = new PathDeck(['P1', 'P2'], new SeededRng(7));
    const second = new PathDeck(['P1', 'P2'], new SeededRng(7));

    const firstRun = [first.drawMany(2), first.drawMany(2), first.drawMany(2)];
    const secondRun = [second.drawMany(2), second.drawMany(2), second.drawMany(2)];

    expect(firstRun.every((event) => new Set(event).size === 2)).toBe(true);
    expect(firstRun).toEqual(secondRun);
  });

  it('deck을 모두 소진한 다음 draw에서 정확히 한 번 refill한다', () => {
    let calls = 0;
    const deck = new PathDeck(['P1', 'P2'], {
      next: () => { calls += 1; return 0.25; },
    });

    expect(deck.drawMany(2)).toHaveLength(2);
    expect(calls).toBe(1);
    expect(deck.drawMany(2)).toHaveLength(2);
    expect(calls).toBe(2);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 3])(
    '고유 path 수를 벗어난 draw count %s를 거부한다',
    (count) => {
      const deck = new PathDeck(['P1', 'P1', 'P2'], new SeededRng(7));

      expect(() => deck.drawMany(count)).toThrow(RangeError);
    },
  );

  it('0개 draw는 RNG를 소비하지 않는다', () => {
    let calls = 0;
    const deck = new PathDeck(['P1'], { next: () => { calls += 1; return 0; } });

    expect(deck.drawMany(0)).toEqual([]);
    expect(calls).toBe(0);
  });

  it.each([-0.1, 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'RandomSource.next() 경계 밖 값 %s를 거부한다',
    (value) => {
      const deck = new PathDeck(['P1', 'P2'], { next: () => value });

      expect(() => deck.drawMany(1)).toThrow(RangeError);
    },
  );
});

describe('WaveSystem', () => {
  it('다섯 wave의 시간과 계열 총계를 exact하게 보존한다', () => {
    expect(summarize(WAVE_DEFINITIONS)).toEqual([
      { poopGuardian: 10, offLeashGuardian: 0, dogTrader: 0, illegalBreeder: 0, times: [0, 7, 14, 21, 28] },
      { poopGuardian: 6, offLeashGuardian: 8, dogTrader: 0, illegalBreeder: 0, times: [0, 7, 14, 21, 28, 35, 42] },
      { poopGuardian: 8, offLeashGuardian: 10, dogTrader: 0, illegalBreeder: 0, times: [0, 8, 16, 24, 32, 40] },
      { poopGuardian: 4, offLeashGuardian: 6, dogTrader: 1, illegalBreeder: 0, times: [0, 12, 24, 32] },
      { poopGuardian: 6, offLeashGuardian: 8, dogTrader: 0, illegalBreeder: 1, times: [0, 12, 24, 32, 42] },
    ]);
    expect(WAVE_DEFINITIONS.map(({ pathIds }) => pathIds)).toEqual([
      ['P1', 'P2'],
      ['P1', 'P2', 'P3', 'P4'],
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    ]);
    expect(summarize(WAVE_DEFINITIONS).reduce(
      (total, wave) => total + wave.poopGuardian + wave.offLeashGuardian
        + wave.dogTrader + wave.illegalBreeder,
      0,
    )).toBe(68);
  });

  it('seconds를 ms로 바꾸고 각 event의 path를 materialize하며 중복하지 않는다', () => {
    for (const definition of WAVE_DEFINITIONS) {
      const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(77));
      system.start(definition.wave);
      const requests = system.step(60_000, 0);

      expect([...new Set(requests.map(({ atMs }) => atMs))]).toEqual(
        definition.groups.map(([atSeconds]) => atSeconds * 1000),
      );
      for (const atMs of new Set(requests.map(({ atMs }) => atMs))) {
        const event = requests.filter((request) => request.atMs === atMs);
        expect(new Set(event.map(({ pathId }) => pathId)).size).toBe(event.length);
        expect(event.every(({ pathId }) => (
          (definition.pathIds as readonly typeof pathId[]).includes(pathId)
        ))).toBe(true);
      }
    }
  });

  it('같은 seed와 호출 순서는 모든 materialized spawn을 동일하게 만든다', () => {
    const materializeRun = () => {
      const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(20260720));
      return WAVE_DEFINITIONS.flatMap(({ wave }) => {
        system.start(wave);
        return system.step(60_000, 0);
      });
    };

    expect(materializeRun()).toEqual(materializeRun());
  });

  it('일반 적 variant는 family별로 run 전체에서 male/female을 교대한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(11));
    const requests = WAVE_DEFINITIONS.flatMap(({ wave }) => {
      system.start(wave);
      return system.step(60_000, 0);
    });

    for (const kind of ['poopGuardian', 'offLeashGuardian'] as const) {
      const variants = requests
        .filter((request) => request.kind === kind)
        .map(({ variant }) => variant);
      expect(variants).toEqual(
        variants.map((_, index) => (index % 2 === 0 ? 'male' : 'female')),
      );
    }
  });

  it('wave 경계도 family별 variant cursor를 초기화하지 않는다', () => {
    const definitions: readonly WaveDefinition[] = [
      { wave: 1, pathIds: ['P1', 'P2'], groups: [[0, 1, 1]] },
      { wave: 2, pathIds: ['P1', 'P2'], groups: [[0, 1, 1]] },
    ];
    const system = new WaveSystem(definitions, new SeededRng(2));

    system.start(1);
    const first = system.step(0, 0);
    system.start(2);
    const second = system.step(0, 0);

    expect(first.map(({ variant }) => variant)).toEqual(['male', 'male']);
    expect(second.map(({ variant }) => variant)).toEqual(['female', 'female']);
  });

  it('dogTrader는 RNG variant를 소비하지 않고 wave 5 breeder만 seeded variant를 쓴다', () => {
    const definitions: readonly WaveDefinition[] = [
      { wave: 4, pathIds: ['P1'], groups: [[0, 0, 0, 'dogTrader']] },
      { wave: 5, pathIds: ['P1'], groups: [[0, 0, 0, 'illegalBreeder']] },
    ];
    let calls = 0;
    const system = new WaveSystem(definitions, {
      next: () => { calls += 1; return 0.9; },
    });
    system.start(4);
    const trader = system.step(0, 0)[0];
    expect(calls).toBe(0);
    system.start(5);
    const breeder = system.step(0, 0)[0];

    expect(trader).toMatchObject({ kind: 'dogTrader', variant: 'male' });
    expect(breeder).toMatchObject({ kind: 'illegalBreeder', variant: 'female' });
    expect(calls).toBe(1);
  });

  it('활성 적 cap이 차면 spawn을 순서대로 보류하고 유실하지 않는다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
    system.start(1);

    expect(system.step(60_000, 60)).toEqual([]);
    expect(system.pendingCount).toBe(10);
    expect(system.elapsed).toBe(60_000);

    expect(system.step(0, 59)).toHaveLength(1);
    expect(system.step(0, 0)).toHaveLength(9);
    expect(system.pendingCount).toBe(0);
  });

  it('동시 spawn도 cap 남은 자리만 내보내고 나머지는 다음 step까지 보류한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
    system.start(4);

    const first = system.step(0, 59);
    const second = system.step(0, 59);

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ atMs: 0, spawnSequence: 0 });
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ atMs: 0, spawnSequence: 1 });
    expect(first[0]!.pathId).not.toBe(second[0]!.pathId);
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

  it('다음 wave 예약과 시작을 정확히 한 번 적용한다', () => {
    const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
    system.start(1);
    system.setPendingNext(2);
    system.setPendingNext(2);

    expect(system.pendingNext).toBe(2);
    expect(system.startPendingNext()).toBe(2);
    expect(system.current).toBe(2);
    expect(system.pendingNext).toBeNull();
    expect(() => system.startPendingNext()).toThrow('No next wave is pending');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'enemyCap %s를 positive safe integer가 아니면 거부한다',
    (enemyCap) => {
      expect(() => new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1), enemyCap))
        .toThrow(RangeError);
    },
  );
});
