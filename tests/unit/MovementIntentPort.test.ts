import { expect, it } from 'vitest';
import {
  KeyboardJoystickMovementIntentPort,
  MutableMovementIntentPort,
} from '../../src/game/player/MovementIntentPort';

it('production movement port는 keyboard를 우선하고 없으면 joystick을 읽는다', () => {
  const keyboard = { read: () => ({ x: 1, y: 0, magnitude: 1 }) };
  const joystick = { read: () => ({ x: 0, y: 0.5, magnitude: 0.5 }) };
  expect(new KeyboardJoystickMovementIntentPort(keyboard, joystick).read())
    .toEqual({ x: 1, y: 0, magnitude: 1 });

  const idle = { read: () => ({ x: 0, y: 0, magnitude: 0 }) };
  expect(new KeyboardJoystickMovementIntentPort(idle, joystick).read())
    .toEqual({ x: 0, y: 0.5, magnitude: 0.5 });
});

it('mutable movement port는 길이를 1로 clamp하고 reset한다', () => {
  const port = new MutableMovementIntentPort();
  port.write({ x: 3, y: 4 });
  expect(port.read()).toEqual({ x: 0.6, y: 0.8, magnitude: 1 });
  port.reset();
  expect(port.read()).toEqual({ x: 0, y: 0, magnitude: 0 });
  expect(() => port.write({ x: Number.NaN, y: 0 })).toThrow(RangeError);
});
