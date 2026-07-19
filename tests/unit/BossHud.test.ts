import {
  BOSS_HUD,
  BossHud,
  bossName,
} from '../../src/game/ui/BossHud';
import { enemy } from './fixtures';

it('W3/W5 boss 이름과 280x12 상단 bar 계약을 고정한다', () => {
  expect(bossName('dogTrader')).toBe('개장수');
  expect(bossName('illegalBreeder')).toBe('불법번식업자');
  expect(bossName('poopGuardian')).toBeUndefined();
  expect(BOSS_HUD).toEqual({ x: 130, y: 58, width: 280, height: 12 });
});

it('새 boss notice만 900ms 표시하고 같은 boss render는 timer를 다시 시작하지 않는다', () => {
  const hud = new BossHud(createFakeScene() as never);
  const trader = enemy({
    id: 11,
    kind: 'dogTrader',
    isBoss: true,
    currentHp: 600,
    maxHp: 600,
  });

  hud.render([trader]);
  expect(hud.snapshot()).toEqual({
    name: '개장수',
    width: 280,
    height: 12,
    noticeVisible: true,
  });
  hud.step(899);
  hud.render([{ ...trader, currentHp: 300 }]);
  expect(hud.snapshot()?.noticeVisible).toBe(true);
  hud.step(1);
  expect(hud.snapshot()?.noticeVisible).toBe(false);
  hud.render([{ ...trader, currentHp: 299 }]);
  expect(hud.snapshot()?.noticeVisible).toBe(false);
});

it('boss 교체는 notice를 다시 열고 death/reset은 bar를 숨긴다', () => {
  const hud = new BossHud(createFakeScene() as never);
  hud.render([enemy({ id: 1, kind: 'dogTrader', isBoss: true, maxHp: 600 })]);
  hud.step(900);
  hud.render([enemy({ id: 2, kind: 'illegalBreeder', isBoss: true, maxHp: 1000 })]);

  expect(hud.snapshot()).toMatchObject({
    name: '불법번식업자',
    noticeVisible: true,
  });
  hud.render([]);
  expect(hud.snapshot()).toBeNull();
  hud.render([enemy({ id: 3, kind: 'dogTrader', isBoss: true, maxHp: 600 })]);
  hud.reset();
  expect(hud.snapshot()).toBeNull();
  hud.destroy();
  hud.destroy();
});

function createFakeScene(): object {
  const gameObject = new Proxy({}, {
    get: () => (..._args: unknown[]) => gameObject,
  });
  return {
    add: {
      text: () => gameObject,
      graphics: () => gameObject,
    },
  };
}
