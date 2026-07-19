import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  ShelterSystem,
  shelterVisualState,
} from '../../src/game/shelter/ShelterSystem';
import {
  SHELTER_DISPLAY_HEIGHT,
  ShelterView,
  shelterFrameFor,
  shelterShakeOffsetAt,
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

it('shelter shake offset은 0..120ms 네 leg를 순수하게 계산하고 경계에서 0으로 reset한다', () => {
  expect([0, 15, 30, 45, 60, 75, 90, 105, 120].map(shelterShakeOffsetAt))
    .toEqual([-4, 0, 4, 0, -4, 0, 4, 0, 0]);
  for (const elapsedMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => shelterShakeOffsetAt(elapsedMs)).toThrow(RangeError);
  }
});

it('보호소 view는 바닥 중심과 77px 높이를 유지하고 tween 없이 simulation shake를 시작한다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);

  view.render('critical');
  view.showDamage();

  expect(SHELTER_DISPLAY_HEIGHT).toBe(77);
  expect(fake.spriteCalls).toContainEqual({
    method: 'add.sprite',
    args: [270, 480, AssetKeys.shelter, 0],
  });
  expect(fake.spriteCalls).toContainEqual({ method: 'setOrigin', args: [0.5, 224 / 256] });
  expect(fake.spriteCalls).toContainEqual({ method: 'setDisplaySize', args: [77, 77] });
  expect(fake.spriteCalls).toContainEqual({ method: 'setFrame', args: [2] });
  expect(fake.lastX()).toBe(266);
  expect(fake.tweenAdd).not.toHaveBeenCalled();
});

it('simulation shake는 repeated hit에서 restart하고 120ms 경계에 정확히 x270으로 끝난다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);

  view.showDamage();
  view.stepSimulation(30);
  expect(fake.lastX()).toBe(274);
  view.showDamage();
  expect(fake.lastX()).toBe(266);
  view.stepSimulation(119);
  expect(fake.lastX()).not.toBe(270);
  view.stepSimulation(1);
  expect(fake.lastX()).toBe(270);
});

it('failed hold shake는 world와 분리된 UI time 1200ms 경계까지 유지한다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);

  view.showFailedHold();
  view.stepFailedHold(1199);

  expect(view.shakeElapsedSnapshot()).toBe(1199);
  expect(fake.lastX()).not.toBe(270);

  view.stepFailedHold(1);

  expect(view.shakeElapsedSnapshot()).toBeNull();
  expect(fake.lastX()).toBe(270);
});

it('reset과 destroy는 진행 중 shake를 x270으로 정리하고 이후 step을 no-op 처리한다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);

  view.showDamage();
  view.stepSimulation(30);
  view.reset();
  expect(fake.lastX()).toBe(270);
  expect(fake.spriteCalls).toContainEqual({ method: 'setFrame', args: [0] });

  view.showDamage();
  view.destroy();
  const callsAfterDestroy = fake.spriteCalls.length;
  expect(fake.lastX()).toBe(270);
  expect(fake.spriteCalls).toContainEqual({ method: 'destroy', args: [] });
  view.stepSimulation(30);
  expect(fake.spriteCalls).toHaveLength(callsAfterDestroy);
});

function createFakeShelterScene(): {
  readonly scene: object;
  readonly spriteCalls: Array<{ readonly method: string; readonly args: readonly unknown[] }>;
  readonly tweenAdd: ReturnType<typeof vi.fn>;
  lastX(): number | undefined;
} {
  const spriteCalls: Array<{ readonly method: string; readonly args: readonly unknown[] }> = [];
  const sprite = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      spriteCalls.push({ method: String(property), args });
      return sprite;
    },
  });
  const tweenAdd = vi.fn(() => ({ stop: vi.fn() }));
  return {
    scene: {
      add: {
        sprite: (...args: unknown[]) => {
          spriteCalls.push({ method: 'add.sprite', args });
          return sprite;
        },
      },
      tweens: { add: tweenAdd },
    },
    spriteCalls,
    tweenAdd,
    lastX: () => spriteCalls
      .filter(({ method }) => method === 'setX')
      .at(-1)?.args.at(0) as number | undefined,
  };
}
