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

it('zero-arg 보호소는 V2 기본 최대 HP 1000으로 시작한다', () => {
  const shelter = new ShelterSystem();

  expect(shelter.maximumHp).toBe(1000);
  expect(shelter.currentHp).toBe(1000);
});

it('무효 피해는 무시하고 reset은 최대 HP로 되돌린다', () => {
  const shelter = new ShelterSystem(100, 33);

  expect(shelter.maximumHp).toBe(100);

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

it('보호소 view는 바닥 중심과 390px 화면의 68~74px 불투명 높이를 유지한다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);

  view.render('critical');
  view.showDamage();

  expect(SHELTER_DISPLAY_HEIGHT * (204 / 256) * (390 / 540)).toBeCloseTo(72.22, 2);
  expect(fake.spriteCalls).toContainEqual({
    method: 'add.sprite',
    args: [270, 480, AssetKeys.shelter, 0],
  });
  expect(fake.spriteCalls).toContainEqual({ method: 'setOrigin', args: [0.5, 224 / 256] });
  const displaySize = fake.spriteCalls.find(({ method }) => method === 'setDisplaySize')!.args;
  expect(displaySize[0]).toBeCloseTo(125.49, 2);
  expect(displaySize[1]).toBeCloseTo(125.49, 2);
  expect(fake.spriteCalls).toContainEqual({ method: 'setFrame', args: [2] });
  expect(fake.lastX()).toBe(266);
  expect(fake.lastHpBarPosition()).toEqual([266, 480]);
  expect(fake.lastHpTextPosition()).toEqual([266, 501]);
  expect(fake.hpBarCalls).toContainEqual({
    method: 'fillRoundedRect',
    args: [-46, 12, 92, 7, 2],
  });
  expect(fake.tweenAdd).not.toHaveBeenCalled();
});

it('simulation shake는 repeated hit에서 restart하고 120ms 경계에 정확히 x270으로 끝난다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);

  view.showDamage();
  view.stepSimulation(30);
  expect(fake.lastX()).toBe(274);
  expect(fake.lastHpBarPosition()).toEqual([274, 480]);
  expect(fake.lastHpTextPosition()).toEqual([274, 501]);
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

it('보호소 feedback port는 inverse recoil/pop과 HP red flash를 공용 stepped clock으로 끝낸다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);

  expect(view.getFeedbackAnchor()).toEqual({ x: 270, y: 480 });
  view.flash(60);
  view.recoil({ direction: { x: 1, y: 0 }, distancePx: 3, popScale: 1.06, durationMs: 60 });
  expect(view.feedbackSnapshot()).toMatchObject({
    flashRemainingMs: 60,
    recoilRemainingMs: 60,
    recoilOffset: { x: 3, y: 0 },
    popScale: 1.06,
  });
  expect(fake.hpBarCalls).toContainEqual({ method: 'fillStyle', args: [0xd94b45, 1] });
  view.stepSimulation(60);
  expect(view.feedbackSnapshot()).toMatchObject({
    flashRemainingMs: 0,
    recoilRemainingMs: 0,
    recoilOffset: { x: 0, y: 0 },
    popScale: 1,
  });
  expect(fake.lastX()).toBe(270);
  expect(fake.tweenAdd).not.toHaveBeenCalled();
});

it('보호소 recoil/pop과 reset은 390px 화면의 초기 silhouette scale을 기준으로 유지한다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);
  const initialOpaqueHeight = SHELTER_DISPLAY_HEIGHT * (204 / 256) * (390 / 540);

  expect(fake.opaqueHeightAt390()).toBeCloseTo(initialOpaqueHeight, 5);

  view.flash(60);
  expect(fake.opaqueHeightAt390()).toBeCloseTo(initialOpaqueHeight, 5);

  view.recoil({ direction: { x: 1, y: 0 }, distancePx: 3, popScale: 1.06, durationMs: 60 });
  expect(fake.opaqueHeightAt390()).toBeCloseTo(initialOpaqueHeight * 1.06, 5);

  view.stepSimulation(60);
  expect(fake.opaqueHeightAt390()).toBeCloseTo(initialOpaqueHeight, 5);

  view.reset();
  expect(fake.opaqueHeightAt390()).toBeCloseTo(initialOpaqueHeight, 5);

  view.recoil({ direction: { x: 0, y: -1 }, distancePx: 5, popScale: 1.08, durationMs: 90 });
  expect(fake.opaqueHeightAt390()).toBeCloseTo(initialOpaqueHeight * 1.08, 5);
});

it('진행 중 recoil을 reset하거나 새 recoil로 교체해도 pop scale이 누적되지 않는다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);
  const initialOpaqueHeight = SHELTER_DISPLAY_HEIGHT * (204 / 256) * (390 / 540);

  view.recoil({ direction: { x: 1, y: 0 }, distancePx: 3, popScale: 1.06, durationMs: 60 });
  view.reset();
  expect(view.feedbackSnapshot().recoilRemainingMs).toBe(0);
  expect(fake.opaqueHeightAt390()).toBeCloseTo(initialOpaqueHeight, 5);

  view.recoil({ direction: { x: 0, y: -1 }, distancePx: 5, popScale: 1.08, durationMs: 90 });
  view.recoil({ direction: { x: -1, y: 0 }, distancePx: 2, popScale: 1.03, durationMs: 45 });
  expect(fake.opaqueHeightAt390()).toBeCloseTo(initialOpaqueHeight * 1.03, 5);
});

it('failed hold는 마지막 피격의 flash/recoil clock을 계속 진행해 base scale로 끝낸다', () => {
  const fake = createFakeShelterScene();
  const view = new ShelterView(fake.scene as never);
  const initialOpaqueHeight = SHELTER_DISPLAY_HEIGHT * (204 / 256) * (390 / 540);

  view.flash(60);
  view.recoil({ direction: { x: 1, y: 0 }, distancePx: 3, popScale: 1.06, durationMs: 60 });
  view.showFailedHold();
  view.stepFailedHold(60);

  expect(view.feedbackSnapshot()).toMatchObject({
    flashRemainingMs: 0,
    recoilRemainingMs: 0,
    recoilOffset: { x: 0, y: 0 },
    popScale: 1,
  });
  expect(fake.opaqueHeightAt390()).toBeCloseTo(initialOpaqueHeight, 5);
});

function createFakeShelterScene(): {
  readonly scene: object;
  readonly spriteCalls: Array<{ readonly method: string; readonly args: readonly unknown[] }>;
  readonly hpBarCalls: Array<{ readonly method: string; readonly args: readonly unknown[] }>;
  readonly hpTextCalls: Array<{ readonly method: string; readonly args: readonly unknown[] }>;
  readonly tweenAdd: ReturnType<typeof vi.fn>;
  lastX(): number | undefined;
  lastHpBarPosition(): readonly unknown[] | undefined;
  lastHpTextPosition(): readonly unknown[] | undefined;
  opaqueHeightAt390(): number | undefined;
} {
  const spriteCalls: Array<{ readonly method: string; readonly args: readonly unknown[] }> = [];
  const hpBarCalls: Array<{ readonly method: string; readonly args: readonly unknown[] }> = [];
  const hpTextCalls: Array<{ readonly method: string; readonly args: readonly unknown[] }> = [];
  let spriteDisplayHeight: number | undefined;
  const sprite = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const method = String(property);
      spriteCalls.push({ method, args });
      if (method === 'setDisplaySize') spriteDisplayHeight = args[1] as number;
      if (method === 'setScale') spriteDisplayHeight = 256 * ((args[1] ?? args[0]) as number);
      return sprite;
    },
  });
  const tweenAdd = vi.fn(() => ({ stop: vi.fn() }));
  const recordingObject = (
    calls: Array<{ readonly method: string; readonly args: readonly unknown[] }>,
  ): object => {
    let object: object;
    object = new Proxy({}, {
      get: (_target, property) => (...args: unknown[]) => {
        calls.push({ method: String(property), args });
        return object;
      },
    });
    return object;
  };
  const hpBar = recordingObject(hpBarCalls);
  const hpText = recordingObject(hpTextCalls);
  return {
    scene: {
      add: {
        sprite: (...args: unknown[]) => {
          spriteCalls.push({ method: 'add.sprite', args });
          return sprite;
        },
        graphics: () => hpBar,
        text: () => hpText,
      },
      tweens: { add: tweenAdd },
    },
    spriteCalls,
    hpBarCalls,
    hpTextCalls,
    tweenAdd,
    lastX: () => spriteCalls
      .filter(({ method }) => method === 'setX')
      .at(-1)?.args.at(0) as number | undefined,
    lastHpBarPosition: () => hpBarCalls
      .filter(({ method }) => method === 'setPosition')
      .at(-1)?.args,
    lastHpTextPosition: () => hpTextCalls
      .filter(({ method }) => method === 'setPosition')
      .at(-1)?.args,
    opaqueHeightAt390: () => spriteDisplayHeight === undefined
      ? undefined
      : spriteDisplayHeight * (204 / 256) * (390 / 540),
  };
}
