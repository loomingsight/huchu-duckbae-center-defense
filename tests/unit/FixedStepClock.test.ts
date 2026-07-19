import { expect, it } from 'vitest';
import { TIME_EPSILON_MS } from '../../src/game/constants';
import { FixedStepClock } from '../../src/game/core/FixedStepClock';

it('긴 렌더 프레임도 최대 5스텝만 따라잡는다', () => {
  const clock = new FixedStepClock(1000 / 60, 5);

  expect(clock.consume(1000)).toHaveLength(5);
});

it('부분 render delta를 누적해 하나의 고정 스텝으로 만든다', () => {
  const stepMs = 1000 / 60;
  const clock = new FixedStepClock(stepMs, 5);

  expect(clock.consume(stepMs / 2)).toEqual([]);
  expect(clock.consume(stepMs / 2)).toEqual([stepMs]);
});

it('epsilon 이내 경계값을 고정 스텝에 도달한 것으로 처리한다', () => {
  const stepMs = 1000 / 60;
  const clock = new FixedStepClock(stepMs, 5);

  expect(clock.consume(stepMs - TIME_EPSILON_MS)).toEqual([stepMs]);
});

it('catch-up 상한 뒤에 이전 프레임의 backlog를 남기지 않는다', () => {
  const stepMs = 1000 / 60;
  const clock = new FixedStepClock(stepMs, 5);

  expect(clock.consume(1000)).toEqual(Array.from({ length: 5 }, () => stepMs));
  expect(clock.consume(0)).toEqual([]);
});

it('reset은 누적된 부분 delta를 버린다', () => {
  const stepMs = 1000 / 60;
  const clock = new FixedStepClock(stepMs, 5);

  clock.consume(stepMs / 2);
  clock.reset();

  expect(clock.consume(stepMs / 2)).toEqual([]);
});
