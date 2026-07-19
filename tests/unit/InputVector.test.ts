import { joystickVector, keyboardVector } from '../../src/game/player/InputVector';

it('키보드 대각선을 단위 벡터로 정규화한다', () => {
  const intent = keyboardVector({ left: false, right: true, up: true, down: false });
  expect(intent.x).toBeCloseTo(Math.SQRT1_2, 15);
  expect(intent.y).toBeCloseTo(-Math.SQRT1_2, 15);
  expect(intent.magnitude).toBe(1);
});

it('조이스틱 반지름 15% 이하는 0이고 나머지는 0~1로 재매핑한다', () => {
  expect(joystickVector({ x: 10, y: 0 }, 100)).toEqual({ x: 0, y: 0, magnitude: 0 });
  const half = joystickVector({ x: 57.5, y: 0 }, 100);
  expect(half.x).toBeCloseTo(0.5, 15);
  expect(half.y).toBe(0);
  expect(half.magnitude).toBeCloseTo(0.5, 15);
});
