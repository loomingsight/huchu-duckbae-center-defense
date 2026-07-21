import { joystickVector, keyboardVector } from '../../src/game/player/InputVector';
import { JOYSTICK_RING_RADIUS } from '../../src/game/player/VirtualJoystick';

it('키보드 대각선을 단위 벡터로 정규화한다', () => {
  const intent = keyboardVector({ left: false, right: true, up: true, down: false });
  expect(intent.x).toBeCloseTo(Math.SQRT1_2, 15);
  expect(intent.y).toBeCloseTo(-Math.SQRT1_2, 15);
  expect(intent.magnitude).toBe(1);
});

it('조이스틱의 유한하지 않은 offset과 양수가 아닌 radius를 거부한다', () => {
  expect(() => joystickVector({ x: Number.NaN, y: 0 }, 100)).toThrow(RangeError);
  expect(() => joystickVector({ x: 0, y: Number.POSITIVE_INFINITY }, 100)).toThrow(RangeError);
  for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => joystickVector({ x: 1, y: 0 }, radius)).toThrow(RangeError);
  }
});

it('조이스틱 반지름 15% 이하는 0이고 나머지는 0~1로 재매핑한다', () => {
  expect(joystickVector({ x: 10, y: 0 }, 100)).toEqual({ x: 0, y: 0, magnitude: 0 });
  const half = joystickVector({ x: 57.5, y: 0 }, 100);
  expect(half.x).toBeCloseTo(0.5, 15);
  expect(half.y).toBe(0);
  expect(half.magnitude).toBeCloseTo(0.5, 15);
});

it('DOM joystick의 46 CSS px ring에서도 같은 15% dead zone을 사용한다', () => {
  expect(joystickVector({ x: JOYSTICK_RING_RADIUS * 0.15, y: 0 }, JOYSTICK_RING_RADIUS))
    .toEqual({ x: 0, y: 0, magnitude: 0 });
  const half = joystickVector(
    { x: JOYSTICK_RING_RADIUS * (0.15 + 0.85 * 0.5), y: 0 },
    JOYSTICK_RING_RADIUS,
  );
  expect(half).toMatchObject({ y: 0 });
  expect(half.x).toBeCloseTo(0.5, 15);
  expect(half.magnitude).toBeCloseTo(0.5, 15);
});
