import { UiTransitionClock } from '../../src/game/ui/UiTransitionClock';

describe('UiTransitionClock', () => {
  it('countdown만 진행하고 visibility pause에서는 남은 시간을 보존한다', () => {
    const clock = new UiTransitionClock(3000);
    clock.step(1000, 'countdown');
    clock.pause();
    clock.step(10_000, 'visibilityPause');
    expect(clock.remainingMs).toBe(2000);
    clock.resume();

    expect(clock.step(2000, 'countdown')).toBe('completed');
  });

  it('2999ms에는 running이고 마지막 1ms에 정확히 complete한다', () => {
    const clock = new UiTransitionClock(3000);

    expect(clock.step(2999, 'countdown')).toBe('running');
    expect(clock.remainingMs).toBe(1);
    expect(clock.step(1, 'countdown')).toBe('completed');
    expect(clock.remainingMs).toBe(0);
  });

  it.each(['playing', 'visibilityPause', 'won'] as const)(
    '%s에서는 UI transition 시간을 소비하지 않는다',
    (mode) => {
      const clock = new UiTransitionClock(3000);

      expect(clock.step(3000, mode)).toBe('running');
      expect(clock.remainingMs).toBe(3000);
    },
  );

  it('restart는 pause 상태까지 초기화하고 0 duration은 즉시 complete다', () => {
    const clock = new UiTransitionClock(3000);
    clock.pause();

    clock.restart(0);

    expect(clock.step(0, 'countdown')).toBe('completed');
  });

  it('invalid duration/step은 상태를 바꾸기 전에 거부한다', () => {
    expect(() => new UiTransitionClock(-1)).toThrow(RangeError);
    expect(() => new UiTransitionClock(Number.NaN)).toThrow(RangeError);
    const clock = new UiTransitionClock(3000);

    for (const duration of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => clock.restart(duration)).toThrow(RangeError);
    }
    for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => clock.step(stepMs, 'countdown')).toThrow(RangeError);
    }
    expect(clock.remainingMs).toBe(3000);
  });
});
