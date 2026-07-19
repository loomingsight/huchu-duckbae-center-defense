import { ManualStepScheduler } from '../../src/game/debug/ManualStepScheduler';
import { FIXED_STEP_MS, TIME_EPSILON_MS } from '../../src/game/constants';

it('긴 호출과 잘게 나눈 호출이 같은 정확한 tick 수를 만든다', () => {
  expect(new ManualStepScheduler().take(5000)).toBe(300);
  const split = new ManualStepScheduler();
  expect(split.take(1)).toBe(0);
  expect(split.take(249)).toBe(15);
  expect(split.take(950)).toBe(57);
  expect(split.take(1800)).toBe(108);
  expect(split.take(2000)).toBe(120);
});

it('120초를 허용하되 호출당 10000 tick을 넘는 진행은 거부한다', () => {
  expect(new ManualStepScheduler().take(120_000)).toBe(7200);
  expect(() => new ManualStepScheduler().take((10_001 * 1000) / 60)).toThrow(RangeError);
});

it('unsafe target을 거부해도 scheduler 상태를 오염시키지 않는다', () => {
  const scheduler = new ManualStepScheduler();
  expect(() => scheduler.take(Number.MAX_VALUE)).toThrow(RangeError);
  expect(scheduler.take(1000)).toBe(60);
});

it('epsilon을 ms 단위로 적용해 fixed-step 경계를 넘지 않는다', () => {
  const scheduler = new ManualStepScheduler();
  expect(scheduler.take(FIXED_STEP_MS - TIME_EPSILON_MS * 2)).toBe(0);
  expect(scheduler.take(TIME_EPSILON_MS * 2)).toBe(1);
  expect(new ManualStepScheduler().take(FIXED_STEP_MS - TIME_EPSILON_MS / 2)).toBe(1);
  expect(new ManualStepScheduler().take(FIXED_STEP_MS + TIME_EPSILON_MS)).toBe(1);
});
