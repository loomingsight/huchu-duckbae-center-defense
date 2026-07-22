import { expect, it } from 'vitest';
import { PlayerHpView, playerHpColor } from '../../src/game/player/PlayerHpView';

it('후추 HP 색상은 67/34/0 경계에서 초록·노랑·빨강·회색으로 바뀐다', () => {
  expect([670, 669, 340, 339, 1, 0].map((hp) => playerHpColor(hp, 1000))).toEqual([
    0x5f9f55,
    0xd7a62d,
    0xd7a62d,
    0xd96745,
    0xd96745,
    0x685b52,
  ]);
});

it('72x6 HP 바를 발 아래에 그리고 숫자 텍스트는 만들지 않는다', () => {
  const calls: Array<{ readonly method: string; readonly args: readonly unknown[] }> = [];
  const graphics = new Proxy({}, {
    get: (_target, property) => (...args: readonly unknown[]) => {
      calls.push({ method: String(property), args });
      return graphics;
    },
  });
  const addText = { count: 0 };
  const scene = {
    add: {
      graphics: () => graphics,
      text: () => { addText.count += 1; return graphics; },
    },
  };
  const view = new PlayerHpView(scene as never, 270, 650);

  view.render(500, 1000, 280, 640);

  expect(addText.count).toBe(0);
  expect(calls).toContainEqual({
    method: 'fillRoundedRect',
    args: [-36, 10, 36, 6, 2],
  });
  expect(calls).toContainEqual({ method: 'setPosition', args: [280, 640] });
});

it('피격 flash는 지정 시간 뒤 원래 HP 색으로 돌아간다', () => {
  const colors: number[] = [];
  const graphics = new Proxy({}, {
    get: (_target, property) => (...args: readonly unknown[]) => {
      if (property === 'fillStyle') colors.push(args[0] as number);
      return graphics;
    },
  });
  const view = new PlayerHpView({ add: { graphics: () => graphics } } as never, 270, 650);
  view.render(500, 1000, 270, 650);
  view.flashRed(60);
  expect(colors.at(-1)).toBe(0xff5a55);
  view.step(60);
  expect(colors.at(-1)).toBe(0xd7a62d);
});
