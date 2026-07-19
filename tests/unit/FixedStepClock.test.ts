import { expect, it } from 'vitest';
import { FixedStepClock } from '../../src/game/core/FixedStepClock';

it('긴 렌더 프레임도 최대 5스텝만 따라잡는다', () => {
  const clock = new FixedStepClock(1000 / 60, 5);

  expect(clock.consume(1000)).toHaveLength(5);
});
