import { createHapticFeedback, HAPTIC_PULSE_MS } from '../../src/game/ui/HapticFeedback';

it('지원 navigator에는 15ms 표준 vibration을 정확히 한 번 전달한다', () => {
  const calls: number[] = [];
  const haptic = createHapticFeedback({
    vibrate: (duration: number) => {
      calls.push(duration);
      return true;
    },
  });

  haptic.pulse();
  expect(HAPTIC_PULSE_MS).toBe(15);
  expect(calls).toEqual([15]);
});

it.each([
  ['미지원', undefined],
  ['false 반환', { vibrate: (): boolean => false }],
  ['예외', { vibrate: (): boolean => { throw new Error('blocked'); } }],
] as const)('%s 환경에서도 입력 흐름을 중단하지 않는다', (_label, navigatorRef) => {
  const haptic = createHapticFeedback(navigatorRef);
  expect(() => haptic.pulse()).not.toThrow();
});
