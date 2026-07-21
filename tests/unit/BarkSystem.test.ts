import { BarkSystem, type BarkEvent } from '../../src/game/combat/BarkSystem';
import {
  BARK_WAVE_CONE_DEGREES,
  BARK_WAVE_DURATION_MS,
  BARK_WAVE_POOL_CAPACITY,
  barkWaveVisualAt,
  PlayerView,
} from '../../src/game/player/PlayerView';
import { CombatEffectPool } from '../../src/game/combat/CombatEffectPool';
import { enemy } from './fixtures';

describe('BarkSystem', () => {
  it('3H와 120도 경계를 포함해 모든 대상을 같은 impact에 담는다', () => {
    const bark = new BarkSystem();
    bark.step(0, {
      origin: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 216, y: 0 } })],
    });

    const events = bark.step(250, {
      origin: { x: 10, y: 0 },
      enemies: [
        enemy({ id: 1, position: { x: 226, y: 0 }, spawnSequence: 0 }),
        enemy({ id: 2, position: { x: 118, y: 187.061487 }, spawnSequence: 1 }),
        enemy({ id: 3, position: { x: 118, y: -187.061487 }, spawnSequence: 2 }),
        enemy({ id: 4, position: { x: 226.001, y: 0 }, spawnSequence: 3 }),
      ],
    });

    expect(events.find((event) => event.type === 'barkImpact')).toMatchObject({
      type: 'barkImpact', castId: 'bark:1', origin: { x: 10, y: 0 },
      direction: { x: 1, y: 0 }, targetIds: [1, 2, 3],
    });
  });

  it('locked target 사망 뒤 current origin과 last direction으로 release한다', () => {
    const bark = new BarkSystem();
    bark.step(0, {
      origin: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 100, y: 0 } })],
    });

    expect(bark.step(250, {
      origin: { x: 20, y: 30 },
      enemies: [enemy({ id: 2, position: { x: 120, y: 30 } })],
    }).at(-1)).toMatchObject({
      type: 'barkImpact', origin: { x: 20, y: 30 },
      direction: { x: 1, y: 0 }, targetIds: [2],
    });
  });

  it('locked target이 살아 있으면 impact 시점 위치로 direction을 갱신한다', () => {
    const bark = new BarkSystem();
    bark.step(0, {
      origin: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 100, y: 0 } })],
    });

    expect(bark.step(250, {
      origin: { x: 10, y: 20 },
      enemies: [enemy({ id: 1, position: { x: 10, y: 120 } })],
    }).at(-1)).toMatchObject({
      type: 'barkImpact', origin: { x: 10, y: 20 },
      direction: { x: 0, y: 1 }, targetIds: [1],
    });
  });

  it('대상이 없으면 cadence를 소비하지 않고 250ms impact와 800ms cadence를 지킨다', () => {
    const bark = new BarkSystem();
    const context = {
      origin: { x: 0, y: 0 },
      enemies: [enemy({ id: 7, position: { x: 100, y: 0 } })],
    };

    expect(bark.step(5000, { origin: context.origin, enemies: [] })).toEqual([]);
    expect(bark.step(0, context)).toEqual([{
      type: 'barkStarted', castId: 'bark:1', targetId: 7,
    }]);
    expect(bark.step(249, context)).toEqual([]);
    expect(bark.step(1, context).at(-1)).toMatchObject({ type: 'barkImpact', targetIds: [7] });
    expect(bark.step(549, context)).toEqual([]);
    expect(bark.step(1, context)).toEqual([{
      type: 'barkStarted', castId: 'bark:2', targetId: 7,
    }]);
  });

  it('cooldown 중에는 다음 cast가 ready가 될 때까지 target ranking을 수행하지 않는다', () => {
    const bark = new BarkSystem();
    const context = {
      origin: { x: 0, y: 0 },
      enemies: [enemy({ id: 7, position: { x: 100, y: 0 } })],
    };
    bark.step(250, context);
    const unreadableEnemies = new Proxy([] as ReturnType<typeof enemy>[], {
      get: () => { throw new Error('cooldown enemies were read'); },
    });

    expect(() => bark.step(100, {
      origin: context.origin,
      enemies: unreadableEnemies,
    })).not.toThrow();
  });

  it('한 큰 step과 같은 duration의 분할 step은 같은 event와 snapshot을 만든다', () => {
    const single = new BarkSystem();
    const split = new BarkSystem();
    const context = {
      origin: { x: 0, y: 0 },
      enemies: [enemy({ id: 7, position: { x: 100, y: 0 } })],
    };

    const singleEvents = single.step(1601, context);
    const splitEvents: BarkEvent[] = [];
    for (const duration of [0, 200, 50, 549, 1, 250, 550, 1]) {
      splitEvents.push(...split.step(duration, context));
    }

    expect(splitEvents).toEqual(singleEvents);
    expect(split.snapshot()).toEqual(single.snapshot());
  });

  it('reset은 phase, direction, lock과 cast sequence를 초기화한다', () => {
    const bark = new BarkSystem();
    const context = {
      origin: { x: 0, y: 0 },
      enemies: [enemy({ id: 7, position: { x: 100, y: 0 } })],
    };
    bark.step(250, context);

    bark.reset();

    expect(bark.snapshot()).toEqual({
      ready: true, phase: 'ready', elapsedMs: 0, lockedTargetId: null,
    });
    expect(bark.step(0, context).at(0)).toMatchObject({ castId: 'bark:1' });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'invalid stepMs %s를 state 변경 전에 거부한다',
    (stepMs) => {
      const bark = new BarkSystem();
      const before = bark.snapshot();

      expect(() => bark.step(stepMs, { origin: { x: 0, y: 0 }, enemies: [] }))
        .toThrow(RangeError);
      expect(bark.snapshot()).toEqual(before);
    },
  );
});

describe('PlayerView bark presentation', () => {
  it('wave는 gameplay과 같은 exact 120도/3H 경계까지 simulation age로 확장한다', () => {
    const atStart = barkWaveVisualAt(0, { x: 10, y: 20 }, { x: 110, y: 20 });
    const halfway = barkWaveVisualAt(
      BARK_WAVE_DURATION_MS / 2,
      { x: 10, y: 20 },
      { x: 10, y: 120 },
    );
    const atEnd = barkWaveVisualAt(
      BARK_WAVE_DURATION_MS,
      { x: 10, y: 20 },
      { x: 110, y: 20 },
    );

    expect((atStart.arcEnd - atStart.arcStart) * 180 / Math.PI)
      .toBeCloseTo(BARK_WAVE_CONE_DEGREES, 12);
    expect(atStart).toMatchObject({ alpha: 1, rotation: 0 });
    expect(halfway.alpha).toBeCloseTo(0.5, 12);
    expect(halfway.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(halfway.radius).toBeGreaterThan(atStart.radius);
    expect(atEnd.alpha).toBe(0);
    expect(atEnd.radius).toBe(216);
  });

  it.each([
    [-1, { x: 0, y: 0 }, { x: 1, y: 0 }],
    [Number.NaN, { x: 0, y: 0 }, { x: 1, y: 0 }],
    [0, { x: Number.POSITIVE_INFINITY, y: 0 }, { x: 1, y: 0 }],
    [0, { x: 0, y: 0 }, { x: Number.NaN, y: 0 }],
  ] as const)('invalid wave age/point를 거부한다', (ageMs, origin, target) => {
    expect(() => barkWaveVisualAt(ageMs, origin, target)).toThrow(RangeError);
  });

  it('attack 중에도 새 player 위치와 V2 manifest texture/frame을 직접 설정한다', () => {
    const fake = createPlayerFakeScene();
    const effects = new CombatEffectPool(fake.scene as never);
    const view = new PlayerView(fake.scene as never, { x: 10, y: 20 }, effects);
    const sprite = fake.sprites.at(-1)!;

    view.render({
      x: 55,
      y: 66,
      moving: true,
      worldAnimationMs: 999,
      barkElapsedMs: 125,
    });

    expect(lastPlayerCall(sprite, 'setPosition')).toEqual([55, 66]);
    expect(lastPlayerCall(sprite, 'setTexture')).toEqual(['huchu-attack']);
    expect(lastPlayerCall(sprite, 'setFrame')).toEqual([1]);
    expect(lastPlayerCall(sprite, 'setDepth')).toEqual([66]);
    expect(sprite.calls.has('on')).toBe(false);
    expect(sprite.calls.has('once')).toBe(false);
  });

  it('wave는 고정 cap pool에서만 acquire하고 simulation age로 release한다', () => {
    const fake = createPlayerFakeScene();
    const effects = new CombatEffectPool(fake.scene as never);
    const view = new PlayerView(fake.scene as never, { x: 10, y: 20 }, effects);
    const initial = view.effectPoolSnapshot();

    expect(fake.graphics).toHaveLength(0);
    expect(Array.from({ length: BARK_WAVE_POOL_CAPACITY }, (_, index) => (
      view.showBarkWave({ x: 10, y: 20 }, { x: 100 + index, y: 20 })
    )).every(Boolean)).toBe(true);
    expect(fake.graphics).toHaveLength(BARK_WAVE_POOL_CAPACITY);
    expect(view.showBarkWave({ x: 10, y: 20 }, { x: 999, y: 20 })).toBe(false);
    expect(view.effectPoolSnapshot()).toEqual({
      ...initial,
      active: BARK_WAVE_POOL_CAPACITY,
      available: 0,
    });

    view.stepSimulation(BARK_WAVE_DURATION_MS / 2);
    view.render({ x: 10, y: 20, moving: false, worldAnimationMs: 0 });
    expect(lastPlayerCall(fake.graphics.at(-1)!, 'setAlpha')?.at(0)).toBeCloseTo(0.5, 12);
    view.stepSimulation(BARK_WAVE_DURATION_MS / 2);

    expect(view.effectPoolSnapshot()).toEqual({ ...initial, active: 0, available: BARK_WAVE_POOL_CAPACITY });
  });

  it('explicit reset은 active wave를 반환하고 destroy는 local listener를 정리한다', () => {
    const fake = createPlayerFakeScene();
    const effects = new CombatEffectPool(fake.scene as never);
    const view = new PlayerView(fake.scene as never, { x: 10, y: 20 }, effects);
    const initial = view.effectPoolSnapshot();
    view.showBarkWave({ x: 10, y: 20 }, { x: 100, y: 20 });
    fake.sprites.at(-1)!.listenerCount = 1;
    fake.graphics.at(-1)!.listenerCount = 1;

    view.resetCombatVisuals();
    expect(view.effectPoolSnapshot()).toEqual({ ...initial, active: 0, available: BARK_WAVE_POOL_CAPACITY });
    expect(fake.graphics.every((graphics) => lastPlayerCall(graphics, 'setVisible')?.at(0) === false))
      .toBe(true);

    view.showBarkWave({ x: 10, y: 20 }, { x: 100, y: 20 });
    view.resetCombatVisuals();
    view.destroy();
    expect(view.effectPoolSnapshot()).toEqual({ ...initial, active: 0, available: BARK_WAVE_POOL_CAPACITY });
    expect(fake.sprites.at(-1)!.listenerCount).toBe(0);
    expect(fake.graphics.every((graphics) => graphics.listenerCount === 0)).toBe(true);
  });
});

interface PlayerFakeGameObject {
  readonly object: object;
  readonly calls: Map<string, unknown[][]>;
  listenerCount: number;
}

function createPlayerFakeScene(): {
  readonly scene: object;
  readonly sprites: PlayerFakeGameObject[];
  readonly graphics: PlayerFakeGameObject[];
  readonly bobs: PlayerFakeGameObject[];
} {
  const sprites: PlayerFakeGameObject[] = [];
  const graphics: PlayerFakeGameObject[] = [];
  const bobs: PlayerFakeGameObject[] = [];
  const create = (collection: PlayerFakeGameObject[]): object => {
    const fake = createPlayerFakeGameObject();
    collection.push(fake);
    return fake.object;
  };
  return {
    scene: {
      add: {
        sprite: () => create(sprites),
        graphics: () => create(graphics),
        blitter: () => createPlayerFakeBlitter(bobs).object,
      },
    },
    sprites,
    graphics,
    bobs,
  };
}

function createPlayerFakeBlitter(bobs: PlayerFakeGameObject[]): PlayerFakeGameObject {
  const calls = new Map<string, unknown[][]>();
  const fake: PlayerFakeGameObject = { object: {}, calls, listenerCount: 0 };
  const object = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const name = String(property);
      const history = calls.get(name) ?? [];
      history.push(args);
      calls.set(name, history);
      if (name === 'create') {
        const bob = createPlayerFakeGameObject();
        bobs.push(bob);
        return bob.object;
      }
      return object;
    },
  });
  Object.defineProperty(fake, 'object', { value: object });
  return fake;
}

function createPlayerFakeGameObject(): PlayerFakeGameObject {
  const calls = new Map<string, unknown[][]>();
  const fake: PlayerFakeGameObject = { object: {}, calls, listenerCount: 0 };
  const object = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const name = String(property);
      const history = calls.get(name) ?? [];
      history.push(args);
      calls.set(name, history);
      if (name === 'removeAllListeners') fake.listenerCount = 0;
      return object;
    },
  });
  Object.defineProperty(fake, 'object', { value: object });
  return fake;
}

function lastPlayerCall(fake: PlayerFakeGameObject, method: string): unknown[] | undefined {
  return fake.calls.get(method)?.at(-1);
}
