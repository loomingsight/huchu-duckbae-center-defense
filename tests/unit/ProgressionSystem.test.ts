import { ProgressionSystem } from '../../src/game/progression/ProgressionSystem';
import { pendingTwoSelections } from './fixtures';

describe('ProgressionSystem', () => {
  it('여러 기준을 넘겨도 한 번에 하나만 열고 초과분을 보존한다', () => {
    const progression = new ProgressionSystem([8, 22, 40, 62, 88], 5000);
    progression.addSnacks(40);

    expect(progression.takeNextRequest()).toMatchObject({ threshold: 8 });
    progression.resolveSelection();
    progression.step(4999, { mode: 'playing', activeEnemies: 1 });
    expect(progression.takeNextRequest()).toBeUndefined();
    progression.step(1, { mode: 'playing', activeEnemies: 1 });

    expect(progression.takeNextRequest()).toMatchObject({ threshold: 22 });
    expect(progression.snapshot()).toMatchObject({ snacks: 40, pendingCount: 1 });
  });

  it('적 없는 웨이브 간 countdown은 전투 5초에 포함하지 않는다', () => {
    const progression = pendingTwoSelections();

    progression.step(5000, { mode: 'countdown', activeEnemies: 0 });

    expect(progression.canOpen()).toBe(false);
  });

  it.each(['skillSelection', 'countdown', 'visibilityPause', 'won', 'lost'] as const)(
    '%s 시간은 다음 threshold combat delay에 누적하지 않는다',
    (mode) => {
      const progression = new ProgressionSystem([8, 22], 5000);
      progression.addSnacks(22);
      progression.takeNextRequest();
      progression.resolveSelection();

      progression.step(5000, { mode, activeEnemies: 1 });

      expect(progression.canOpen()).toBe(false);
      expect(progression.snapshot().combatDelayRemainingMs).toBe(5000);
    },
  );

  it('playing이어도 active enemy가 없으면 delay를 누적하지 않는다', () => {
    const progression = new ProgressionSystem([8, 22], 5000);
    progression.addSnacks(22);
    progression.takeNextRequest();
    progression.resolveSelection();

    progression.step(5000, { mode: 'playing', activeEnemies: 0 });

    expect(progression.canOpen()).toBe(false);
  });

  it('reset은 snacks, cursor, open request, delay를 run 시작 상태로 되돌린다', () => {
    const progression = new ProgressionSystem([8, 22], 5000);
    progression.addSnacks(22);
    progression.takeNextRequest();
    progression.resolveSelection();
    progression.step(2500, { mode: 'playing', activeEnemies: 1 });

    progression.reset();
    progression.addSnacks(8);

    expect(progression.snapshot()).toMatchObject({
      snacks: 8,
      nextThreshold: 8,
      pendingCount: 1,
      selectionOpen: false,
      combatDelayRemainingMs: 0,
    });
    expect(progression.takeNextRequest()).toEqual({ threshold: 8, index: 0 });
  });

  it.each([
    [[0], 5000],
    [[8, 8], 5000],
    [[8, Number.NaN], 5000],
    [[8], -1],
    [[8], Number.POSITIVE_INFINITY],
  ] as const)('invalid thresholds/delay를 거부한다', (thresholds, delayMs) => {
    expect(() => new ProgressionSystem(thresholds, delayMs)).toThrow(RangeError);
  });

  it('invalid snack/step/context는 기존 상태를 바꾸지 않는다', () => {
    const progression = new ProgressionSystem([8, 22], 5000);
    const before = progression.snapshot();

    for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => progression.addSnacks(amount)).toThrow(RangeError);
    }
    for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => progression.step(stepMs, { mode: 'playing', activeEnemies: 1 }))
        .toThrow(RangeError);
    }
    for (const activeEnemies of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => progression.step(1, { mode: 'playing', activeEnemies }))
        .toThrow(RangeError);
    }

    expect(progression.snapshot()).toEqual(before);
  });

  it('threshold 입력 배열의 이후 mutation과 unsafe snack 합계를 차단한다', () => {
    const thresholds = [8, 22];
    const progression = new ProgressionSystem(thresholds, 5000);
    thresholds[0] = 1;

    progression.addSnacks(8);
    expect(progression.takeNextRequest()).toEqual({ threshold: 8, index: 0 });
    progression.resolveSelection();
    progression.addSnacks(Number.MAX_SAFE_INTEGER - 8);
    const before = progression.snapshot();

    expect(() => progression.addSnacks(1)).toThrow(RangeError);
    expect(progression.snapshot()).toEqual(before);
  });
});
