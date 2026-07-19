import { ManualStepScheduler } from '../../src/game/debug/ManualStepScheduler';

it('긴 호출과 잘게 나눈 호출이 같은 정확한 tick 수를 만든다', () => {
  expect(new ManualStepScheduler().take(5000)).toBe(300);
  const split = new ManualStepScheduler();
  expect(split.take(1)).toBe(0);
  expect(split.take(249)).toBe(15);
  expect(split.take(950)).toBe(57);
  expect(split.take(1800)).toBe(108);
  expect(split.take(2000)).toBe(120);
});
