import {
  idleBreathScale,
  loopFrame,
  oneShotFrame,
} from '../../src/game/world/AnimationFrameResolver';

it('walk 6fps loop와 attack 8fps one-shot frame을 wall clock 없이 계산한다', () => {
  expect([0, 167, 334, 501].map((ms) => loopFrame(ms, 6, 0, 4))).toEqual([0, 1, 2, 3]);
  expect([0, 125, 250, 375, 900].map((ms) => oneShotFrame(ms, 8, 4, 4))).toEqual([
    4, 5, 6, 7, 7,
  ]);
});

it('frame resolver의 잘못된 시간·fps·시작 frame·frame 수를 거부한다', () => {
  for (const resolver of [loopFrame, oneShotFrame]) {
    expect(() => resolver(-1, 6, 0, 4)).toThrow(RangeError);
    expect(() => resolver(Number.NaN, 6, 0, 4)).toThrow(RangeError);
    expect(() => resolver(0, 0, 0, 4)).toThrow(RangeError);
    expect(() => resolver(0, Number.POSITIVE_INFINITY, 0, 4)).toThrow(RangeError);
    expect(() => resolver(0, 6, -1, 4)).toThrow(RangeError);
    expect(() => resolver(0, 6, 0.5, 4)).toThrow(RangeError);
    expect(() => resolver(0, 6, 0, 0)).toThrow(RangeError);
    expect(() => resolver(0, 6, 0, 1.5)).toThrow(RangeError);
  }
  expect(() => idleBreathScale(-1)).toThrow(RangeError);
  expect(() => idleBreathScale(Number.POSITIVE_INFINITY)).toThrow(RangeError);
});

it('60Hz 15 tick의 부동소수 누적도 정확히 release frame 6이다', () => {
  const elapsed = Array.from({ length: 15 }, () => 1000 / 60).reduce(
    (total, value) => total + value,
    0,
  );
  expect(oneShotFrame(elapsed, 8, 4, 4)).toBe(6);
});
