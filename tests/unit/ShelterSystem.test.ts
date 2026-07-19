import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  ShelterSystem,
  shelterVisualState,
} from '../../src/game/shelter/ShelterSystem';
import {
  SHELTER_DISPLAY_HEIGHT,
  ShelterView,
  shelterFrameFor,
} from '../../src/game/shelter/ShelterView';

it.each([
  [100, 'healthy'],
  [67, 'healthy'],
  [66, 'damaged'],
  [34, 'damaged'],
  [33, 'critical'],
  [1, 'critical'],
  [0, 'failed'],
] as const)(
  'HP %i는 %s 프레임이다',
  (hp, state) => expect(shelterVisualState(hp, 100)).toBe(state),
);

it('피해를 HP에 clamp하고 살아 있는 동안 호출당 한 이벤트만 만든다', () => {
  const shelter = new ShelterSystem(100);

  expect(shelter.damage(34)).toEqual([
    { type: 'shelterDamaged', hp: 66, visual: 'damaged' },
  ]);
  expect(shelter.damage(1000)).toEqual([
    { type: 'shelterDamaged', hp: 0, visual: 'failed' },
  ]);
  expect(shelter.damage(1)).toEqual([]);
  expect(shelter.currentHp).toBe(0);
});

it('무효 피해는 무시하고 reset은 최대 HP로 되돌린다', () => {
  const shelter = new ShelterSystem(100, 33);

  expect(shelter.damage(0)).toEqual([]);
  expect(shelter.damage(-1)).toEqual([]);
  shelter.reset();

  expect(shelter.currentHp).toBe(100);
});

it('non-finite HP와 damage는 상태 변경 전에 거부한다', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => new ShelterSystem(value)).toThrow(RangeError);
  }
  const shelter = new ShelterSystem(100);
  for (const amount of [Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => shelter.damage(amount)).toThrow(RangeError);
  }
  expect(shelter.currentHp).toBe(100);
});

it.each([
  [0, 0],
  [-1, 0],
  [100, -1],
  [100, 101],
] as const)('invalid shelter HP %i/%i는 거부한다', (maxHp, initialHp) => {
  expect(() => new ShelterSystem(maxHp, initialHp)).toThrow('Invalid shelter HP');
});

it('보호소 4단계를 sheet frame 0~3으로 고정한다', () => {
  expect((['healthy', 'damaged', 'critical', 'failed'] as const).map(shelterFrameFor))
    .toEqual([0, 1, 2, 3]);
});

it('보호소 view는 바닥 중심과 77px 높이를 유지하고 피격 시 120ms shake한다', () => {
  const spriteCalls: Array<{ readonly method: string; readonly args: readonly unknown[] }> = [];
  const tweenConfigs: Record<string, unknown>[] = [];
  const sprite = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      spriteCalls.push({ method: String(property), args });
      return sprite;
    },
  });
  const scene = {
    add: {
      sprite: (...args: unknown[]) => {
        spriteCalls.push({ method: 'add.sprite', args });
        return sprite;
      },
    },
    tweens: {
      add: (config: Record<string, unknown>) => {
        tweenConfigs.push(config);
        return { stop: vi.fn() };
      },
    },
  };
  const view = new ShelterView(scene as never);

  view.render('critical');
  view.showDamage();
  view.reset();

  expect(SHELTER_DISPLAY_HEIGHT).toBe(77);
  expect(spriteCalls).toContainEqual({
    method: 'add.sprite',
    args: [270, 480, AssetKeys.shelter, 0],
  });
  expect(spriteCalls).toContainEqual({ method: 'setOrigin', args: [0.5, 224 / 256] });
  expect(spriteCalls).toContainEqual({ method: 'setDisplaySize', args: [77, 77] });
  expect(spriteCalls).toContainEqual({ method: 'setFrame', args: [2] });
  expect(spriteCalls).toContainEqual({ method: 'setFrame', args: [0] });
  expect(spriteCalls).toContainEqual({ method: 'setX', args: [270] });
  const shake = tweenConfigs.at(0)!;
  expect(shake.targets).toBe(sprite);
  expect(shake).toMatchObject({
    x: { from: 266, to: 274 },
    duration: 30,
    yoyo: true,
    repeat: 1,
  });
});
