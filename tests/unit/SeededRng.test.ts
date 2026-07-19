import { expect, it } from 'vitest';
import { SeededRng } from '../../src/game/core/SeededRng';

it('같은 seed는 같은 수열을 만든다', () => {
  const a = new SeededRng(424242);
  const b = new SeededRng(424242);

  expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
});
