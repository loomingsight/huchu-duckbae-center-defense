import { PlayerController } from '../../src/game/player/PlayerController';

it('150px/s로 이동하고 논리 맵 경계를 넘지 않는다', () => {
  const player = new PlayerController({ x: 539, y: 959 });
  player.step(1000, { x: 1, y: 1, magnitude: 1 });
  expect(player.snapshot()).toMatchObject({ x: 540, y: 960 });
});

it('유한하지 않은 초기 좌표를 거부한다', () => {
  expect(() => new PlayerController({ x: Number.NaN, y: 0 })).toThrow(RangeError);
  expect(() => new PlayerController({ x: 0, y: Number.POSITIVE_INFINITY })).toThrow(RangeError);
});

it('음수·비유한 step과 비유한 intent를 상태 변경 전에 거부한다', () => {
  const player = new PlayerController({ x: 100, y: 200 });
  const intent = { x: 1, y: 0, magnitude: 1 };
  for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => player.step(stepMs, intent)).toThrow(RangeError);
  }
  expect(() => player.step(16, { x: Number.NaN, y: 0, magnitude: 1 })).toThrow(RangeError);
  expect(() => player.step(16, { x: 0, y: Number.POSITIVE_INFINITY, magnitude: 1 }))
    .toThrow(RangeError);
  expect(() => player.step(16, { x: 0, y: 0, magnitude: Number.NaN })).toThrow(RangeError);
  expect(player.snapshot()).toEqual({ x: 100, y: 200 });
});
