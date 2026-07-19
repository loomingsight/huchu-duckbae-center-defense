export type MovementIntent = { x: number; y: number; magnitude: number };

export function keyboardVector(keys: {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}): MovementIntent {
  const x = Number(keys.right) - Number(keys.left);
  const y = Number(keys.down) - Number(keys.up);
  const length = Math.hypot(x, y);
  return length === 0
    ? { x: 0, y: 0, magnitude: 0 }
    : { x: x / length, y: y / length, magnitude: 1 };
}

export function joystickVector(
  offset: { x: number; y: number },
  radius: number,
): MovementIntent {
  const raw = Math.min(Math.hypot(offset.x, offset.y) / radius, 1);
  if (raw <= 0.15) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = (raw - 0.15) / 0.85;
  const length = Math.hypot(offset.x, offset.y);
  return {
    x: (offset.x / length) * magnitude,
    y: (offset.y / length) * magnitude,
    magnitude,
  };
}
