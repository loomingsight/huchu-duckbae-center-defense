import { expect, it } from 'vitest';
import { RunOutcomeResolver } from '../../src/game/session/RunOutcomeResolver';

it('같은 스텝에 모두 참이면 패배를 한 번만 확정한다', () => {
  const resolver = new RunOutcomeResolver();
  const input = { shelterHp: 0, wave: 5, active: 0, pending: 0, skillDue: true };

  expect(resolver.resolve(input)).toEqual({ mode: 'lost' });
  expect(resolver.resolve(input)).toEqual({ mode: 'lost' });
  expect(resolver.transitionCount).toBe(1);
});
