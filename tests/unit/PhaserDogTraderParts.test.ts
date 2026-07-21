import { describe, expect, it, vi } from 'vitest';
import { PhaserDogTraderParts } from '../../src/game/enemies/PhaserDogTraderParts';
import { HUCHU_PRESENTATION } from '../../src/game/presentation/PresentationConfig';

vi.mock('phaser', () => ({
  default: { TintModes: { FILL: 1 } },
}));

describe('PhaserDogTraderParts truck silhouette scale', () => {
  it.each([
    { direction: 'north', widthPx: [220, 222], heightPx: [150, 150] },
    { direction: 'northWest', widthPx: [230, 232], heightPx: [149, 150] },
    { direction: 'west', widthPx: [239, 240], heightPx: [142, 142] },
    { direction: 'southWest', widthPx: [228, 234], heightPx: [149, 150] },
    { direction: 'south', widthPx: [239, 240], heightPx: [135, 135] },
  ] as const)(
    '$direction source의 모든 frame alpha bounds를 390px CSS 목표 범위에 균일 scale한다',
    ({ direction, widthPx, heightPx }) => {
      const fake = createFakeScene();
      const parts = new PhaserDogTraderParts(fake.scene as never);
      const truck = partAt(fake, 1);

      parts.renderTruck({ x: 30, y: 40 }, direction, {
        target: { x: 30, y: 40 },
        rolling: true,
        elapsedMs: 0,
      });

      expect(lastCall(truck.sprite, 'setDisplaySize')).toBeUndefined();
      const scaleCall = lastCall(truck.sprite, 'setScale');
      expect(scaleCall).toHaveLength(1);
      const scale = scaleCall?.[0];
      expect(scale).toEqual(expect.any(Number));
      if (typeof scale !== 'number') throw new TypeError('Truck scale must be numeric');

      const cssScale = 390 / HUCHU_PRESENTATION.logicalWidth;
      expect(widthPx[0] * scale * cssScale).toBeGreaterThanOrEqual(96);
      expect(widthPx[1] * scale * cssScale).toBeLessThanOrEqual(110);
      expect(heightPx[0] * scale * cssScale).toBeGreaterThanOrEqual(58);
      expect(heightPx[1] * scale * cssScale).toBeLessThanOrEqual(66);
    },
  );
});

describe('PhaserDogTraderParts setter guards', () => {
  it('같은 texture/frame/origin/depth는 반복하지 않고 동적 view setter는 유지한다', () => {
    const fake = createFakeScene();
    const parts = new PhaserDogTraderParts(fake.scene as never);
    const human = partAt(fake, 0);
    const truck = partAt(fake, 1);

    renderBoth(parts, 20, 40, 0);
    const humanIdentityBefore = identitySetterCounts(human);
    const truckIdentityBefore = identitySetterCounts(truck);
    const humanDynamicBefore = dynamicSetterCounts(human);
    const truckDynamicBefore = dynamicSetterCounts(truck);

    renderBoth(parts, 20, 40, 50);

    expectSetterDelta(humanIdentityBefore, identitySetterCounts(human), ZERO_IDENTITY_DELTA);
    expectSetterDelta(truckIdentityBefore, identitySetterCounts(truck), ZERO_IDENTITY_DELTA);
    expectSetterDelta(humanDynamicBefore, dynamicSetterCounts(human), {
      spritePosition: 1,
      spriteScale: 1,
      displaySize: 0,
      flip: 1,
      spriteActive: 1,
      spriteVisible: 1,
      rootPosition: 1,
      rootActive: 1,
      rootVisible: 1,
    });
    expectSetterDelta(truckDynamicBefore, dynamicSetterCounts(truck), {
      spritePosition: 1,
      spriteScale: 1,
      displaySize: 0,
      flip: 1,
      spriteActive: 1,
      spriteVisible: 1,
      rootPosition: 1,
      rootActive: 1,
      rootVisible: 1,
    });
  });

  it('같은 texture의 animation frame 경계에서는 setFrame만 한 번 호출한다', () => {
    const fake = createFakeScene();
    const parts = new PhaserDogTraderParts(fake.scene as never);
    const human = partAt(fake, 0);
    const truck = partAt(fake, 1);
    renderBoth(parts, 20, 40, 0);
    const humanBefore = identitySetterCounts(human);
    const truckBefore = identitySetterCounts(truck);

    renderBoth(parts, 20, 40, 100);

    expectSetterDelta(humanBefore, identitySetterCounts(human), {
      texture: 0,
      frame: 1,
      origin: 0,
      depth: 0,
    });
    expectSetterDelta(truckBefore, identitySetterCounts(truck), {
      texture: 0,
      frame: 1,
      origin: 0,
      depth: 0,
    });
    expect(lastCall(human.sprite, 'setFrame')).toEqual([1]);
    expect(lastCall(truck.sprite, 'setFrame')).toEqual([1]);
  });

  it('texture 변경은 같은 frame 값도 texture와 함께 한 번 다시 적용한다', () => {
    const fake = createFakeScene();
    const parts = new PhaserDogTraderParts(fake.scene as never);
    const human = partAt(fake, 0);
    const truck = partAt(fake, 1);
    renderBoth(parts, 20, 40, 0);
    const humanBefore = identitySetterCounts(human);
    const truckBefore = identitySetterCounts(truck);

    parts.renderHuman({ x: 10, y: 20 }, 'south', 'windup', 0);
    parts.renderTruck({ x: 30, y: 40 }, 'west', {
      target: { x: 30, y: 40 },
      rolling: true,
      elapsedMs: 0,
    });

    expectSetterDelta(humanBefore, identitySetterCounts(human), {
      texture: 1,
      frame: 1,
      origin: 0,
      depth: 0,
    });
    expectSetterDelta(truckBefore, identitySetterCounts(truck), {
      texture: 1,
      frame: 1,
      origin: 0,
      depth: 0,
    });
    expect(lastCall(human.sprite, 'setFrame')).toEqual([0]);
    expect(lastCall(truck.sprite, 'setFrame')).toEqual([0]);
  });

  it('y 변경은 각 part의 setDepth만 한 번 호출한다', () => {
    const fake = createFakeScene();
    const parts = new PhaserDogTraderParts(fake.scene as never);
    const human = partAt(fake, 0);
    const truck = partAt(fake, 1);
    renderBoth(parts, 20, 40, 0);
    const humanBefore = identitySetterCounts(human);
    const truckBefore = identitySetterCounts(truck);

    renderBoth(parts, 21, 41, 0);

    expectSetterDelta(humanBefore, identitySetterCounts(human), {
      texture: 0,
      frame: 0,
      origin: 0,
      depth: 1,
    });
    expectSetterDelta(truckBefore, identitySetterCounts(truck), {
      texture: 0,
      frame: 0,
      origin: 0,
      depth: 1,
    });
    expect(lastCall(human.root, 'setDepth')).toEqual([21]);
    expect(lastCall(truck.root, 'setDepth')).toEqual([41]);
  });

  it('reset/reuse는 실제 depth와 truck frame을 동기화하고 같은 재사용 frame은 반복하지 않는다', () => {
    const fake = createFakeScene();
    const parts = new PhaserDogTraderParts(fake.scene as never);
    const human = partAt(fake, 0);
    const truck = partAt(fake, 1);
    parts.renderHuman({ x: 10, y: 20 }, 'south', 'holding', 500);
    parts.renderTruck({ x: 30, y: 40 }, 'south', {
      target: { x: 30, y: 40 },
      rolling: true,
      elapsedMs: 300,
    });
    const humanBeforeReset = identitySetterCounts(human);
    const truckBeforeReset = identitySetterCounts(truck);

    parts.resetHuman();
    parts.resetTruck();

    expectSetterDelta(humanBeforeReset, identitySetterCounts(human), {
      texture: 0,
      frame: 0,
      origin: 0,
      depth: 1,
    });
    expectSetterDelta(truckBeforeReset, identitySetterCounts(truck), {
      texture: 0,
      frame: 0,
      origin: 0,
      depth: 1,
    });
    const afterResetHuman = identitySetterCounts(human);
    const afterResetTruck = identitySetterCounts(truck);

    parts.resetHuman();
    parts.resetTruck();

    expectSetterDelta(afterResetHuman, identitySetterCounts(human), ZERO_IDENTITY_DELTA);
    expectSetterDelta(afterResetTruck, identitySetterCounts(truck), ZERO_IDENTITY_DELTA);
    const beforeReuseHuman = identitySetterCounts(human);
    const beforeReuseTruck = identitySetterCounts(truck);

    renderBoth(parts, 20, 40, 0);

    expectSetterDelta(beforeReuseHuman, identitySetterCounts(human), {
      texture: 1,
      frame: 1,
      origin: 0,
      depth: 1,
    });
    expectSetterDelta(beforeReuseTruck, identitySetterCounts(truck), {
      texture: 0,
      frame: 1,
      origin: 0,
      depth: 1,
    });
    const afterReuseHuman = identitySetterCounts(human);
    const afterReuseTruck = identitySetterCounts(truck);

    renderBoth(parts, 20, 40, 0);

    expectSetterDelta(afterReuseHuman, identitySetterCounts(human), ZERO_IDENTITY_DELTA);
    expectSetterDelta(afterReuseTruck, identitySetterCounts(truck), ZERO_IDENTITY_DELTA);
  });
});

const ZERO_IDENTITY_DELTA = Object.freeze({
  texture: 0,
  frame: 0,
  origin: 0,
  depth: 0,
});

interface FakeGameObject {
  readonly object: object;
  readonly calls: Map<string, unknown[][]>;
}

interface FakePart {
  readonly sprite: FakeGameObject;
  readonly root: FakeGameObject;
}

function createFakeScene(): {
  readonly scene: object;
  readonly sprites: FakeGameObject[];
  readonly containers: FakeGameObject[];
} {
  const sprites: FakeGameObject[] = [];
  const containers: FakeGameObject[] = [];
  const create = (collection: FakeGameObject[]): object => {
    const fake = createFakeGameObject();
    collection.push(fake);
    return fake.object;
  };
  return {
    scene: {
      add: {
        sprite: () => create(sprites),
        container: () => create(containers),
      },
      tweens: {
        killTweensOf: vi.fn(),
        add: vi.fn(),
      },
    },
    sprites,
    containers,
  };
}

function createFakeGameObject(): FakeGameObject {
  const calls = new Map<string, unknown[][]>();
  const target = {};
  const object = new Proxy(target, {
    get: (_current, property) => (...args: unknown[]) => {
      const name = String(property);
      const history = calls.get(name) ?? [];
      history.push(args);
      calls.set(name, history);
      return object;
    },
  });
  return { object, calls };
}

function partAt(
  fake: ReturnType<typeof createFakeScene>,
  index: 0 | 1,
): FakePart {
  return {
    sprite: fake.sprites[index]!,
    root: fake.containers[index * 2 + 1]!,
  };
}

function renderBoth(
  parts: PhaserDogTraderParts,
  humanY: number,
  truckY: number,
  elapsedMs: number,
): void {
  parts.renderHuman({ x: 10, y: humanY }, 'south', 'moving', elapsedMs);
  parts.renderTruck({ x: 30, y: truckY }, 'south', {
    target: { x: 30, y: truckY },
    rolling: true,
    elapsedMs,
  });
}

function callCount(fake: FakeGameObject, method: string): number {
  return fake.calls.get(method)?.length ?? 0;
}

function lastCall(fake: FakeGameObject, method: string): unknown[] | undefined {
  return fake.calls.get(method)?.at(-1);
}

function identitySetterCounts(
  part: FakePart,
): Record<'texture' | 'frame' | 'origin' | 'depth', number> {
  return {
    texture: callCount(part.sprite, 'setTexture'),
    frame: callCount(part.sprite, 'setFrame'),
    origin: callCount(part.sprite, 'setOrigin'),
    depth: callCount(part.root, 'setDepth'),
  };
}

function dynamicSetterCounts(
  part: FakePart,
): Record<
  | 'spritePosition'
  | 'spriteScale'
  | 'displaySize'
  | 'flip'
  | 'spriteActive'
  | 'spriteVisible'
  | 'rootPosition'
  | 'rootActive'
  | 'rootVisible',
  number
> {
  return {
    spritePosition: callCount(part.sprite, 'setPosition'),
    spriteScale: callCount(part.sprite, 'setScale'),
    displaySize: callCount(part.sprite, 'setDisplaySize'),
    flip: callCount(part.sprite, 'setFlip'),
    spriteActive: callCount(part.sprite, 'setActive'),
    spriteVisible: callCount(part.sprite, 'setVisible'),
    rootPosition: callCount(part.root, 'setPosition'),
    rootActive: callCount(part.root, 'setActive'),
    rootVisible: callCount(part.root, 'setVisible'),
  };
}

function expectSetterDelta<Keys extends string>(
  before: Record<Keys, number>,
  after: Record<Keys, number>,
  expected: Record<Keys, number>,
): void {
  expect(Object.fromEntries(
    Object.keys(before).map((key) => [key, after[key as Keys] - before[key as Keys]]),
  )).toEqual(expected);
}
