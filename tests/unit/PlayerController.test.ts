import { PlayerController } from '../../src/game/player/PlayerController';

it('150px/s로 이동하고 논리 맵 경계를 넘지 않는다', () => {
  const player = new PlayerController({ x: 539, y: 959 });
  player.step(1000, { x: 1, y: 1, magnitude: 1 });
  expect(player.snapshot()).toMatchObject({ x: 540, y: 960 });
});
