import { BarkSystem, type BarkEvent } from '../../src/game/combat/BarkSystem';
import {
  BARK_WAVE_CONE_DEGREES,
  BARK_WAVE_DURATION_MS,
  BARK_WAVE_POOL_CAPACITY,
  barkWaveVisualAt,
  PlayerView,
} from '../../src/game/player/PlayerView';
import { candidate } from './fixtures';

describe('BarkSystem', () => {
  it('target이 있을 때 250ms에 한 번 피해를 내고 650ms cadence를 지킨다', () => {
    const bark = new BarkSystem(1);

    expect(bark.step(0, candidate())).toEqual([{ type: 'barkStarted', targetId: 7 }]);
    expect(bark.step(249, candidate())).toEqual([]);
    expect(bark.step(1, candidate())).toEqual([
      { type: 'barkReleased', targetId: 7 },
      { type: 'damageRequested', targetId: 7, amount: 10, source: 'bark' },
    ]);
    expect(bark.step(399, candidate())).toEqual([]);
    expect(bark.step(1, candidate())).toEqual([{ type: 'barkStarted', targetId: 7 }]);
    expect(bark.step(249, candidate())).toEqual([]);
    expect(bark.step(1, candidate()).find((event) => event.type === 'damageRequested'))
      .toMatchObject({ targetId: 7, amount: 10 });
  });

  it('ready에서 target이 없으면 경과 시간을 쌓지 않고 cooldown 완료 뒤에도 ready다', () => {
    const bark = new BarkSystem(1);

    expect(bark.step(650, undefined)).toEqual([]);
    expect(bark.snapshot()).toEqual({
      ready: true,
      phase: 'ready',
      elapsedMs: 0,
      lockedTargetId: null,
    });
  });

  it('windup 중 후보가 바뀌어도 최초 target lock을 release까지 유지한다', () => {
    const bark = new BarkSystem(1);
    bark.step(0, candidate({ id: 7 }));

    expect(bark.step(125, candidate({ id: 8 }))).toEqual([]);
    expect(bark.step(125, candidate({ id: 8 }), (enemyId) => enemyId === 7)).toEqual([
      { type: 'barkReleased', targetId: 7 },
      { type: 'damageRequested', targetId: 7, amount: 10, source: 'bark' },
    ]);
    expect(bark.step(400, candidate({ id: 8 }))).toEqual([
      { type: 'barkStarted', targetId: 8 },
    ]);
  });

  it('locked target이 release 전에 죽으면 visual release만 내고 피해는 요청하지 않는다', () => {
    const bark = new BarkSystem(1);
    bark.step(0, candidate({ id: 7 }));

    expect(bark.step(250, candidate({ id: 8 }), () => false)).toEqual([
      { type: 'barkReleased', targetId: 7 },
    ]);
  });

  it('isAlive가 거부한 stale target은 ready와 큰 step의 cadence 경계에서 다시 lock하지 않는다', () => {
    const atReady = new BarkSystem(1);
    expect(atReady.step(650, candidate(), () => false)).toEqual([]);
    expect(atReady.snapshot().ready).toBe(true);

    const acrossCadence = new BarkSystem(1);
    acrossCadence.step(0, candidate());
    expect(acrossCadence.step(650, candidate(), () => false)).toEqual([
      { type: 'barkReleased', targetId: 7 },
    ]);
    expect(acrossCadence.snapshot()).toEqual({
      ready: true,
      phase: 'ready',
      elapsedMs: 0,
      lockedTargetId: null,
    });
  });

  it('dead target은 ready와 cadence 경계에서 lock하지 않는다', () => {
    const bark = new BarkSystem(1);
    const dead = candidate({ state: 'dead', currentHp: 0 });

    expect(bark.step(650, dead)).toEqual([]);
    expect(bark.snapshot().ready).toBe(true);
  });

  it('level 2는 피해 13, level 3은 시작 간격 520ms를 사용한다', () => {
    const levelTwo = new BarkSystem(1);
    levelTwo.setLevel(2);
    levelTwo.step(0, candidate());
    expect(levelTwo.step(250, candidate()).find((event) => event.type === 'damageRequested'))
      .toMatchObject({ amount: 13 });

    const levelThree = new BarkSystem(3);
    levelThree.step(0, candidate());
    levelThree.step(250, candidate());
    expect(levelThree.step(269, candidate())).toEqual([]);
    expect(levelThree.step(1, candidate())).toEqual([{ type: 'barkStarted', targetId: 7 }]);
  });

  it('cadence 단일값 accessor는 현재 level 변경을 즉시 반영한다', () => {
    const bark = new BarkSystem(1);

    expect(bark.cadenceDurationMs()).toBe(650);
    bark.setLevel(3);
    expect(bark.cadenceDurationMs()).toBe(520);
  });

  it('큰 step은 여러 release/cadence 경계를 순서대로 모두 통과하고 overshoot를 보존한다', () => {
    const bark = new BarkSystem(1);

    expect(bark.step(1301, candidate())).toEqual([
      { type: 'barkStarted', targetId: 7 },
      { type: 'barkReleased', targetId: 7 },
      { type: 'damageRequested', targetId: 7, amount: 10, source: 'bark' },
      { type: 'barkStarted', targetId: 7 },
      { type: 'barkReleased', targetId: 7 },
      { type: 'damageRequested', targetId: 7, amount: 10, source: 'bark' },
      { type: 'barkStarted', targetId: 7 },
    ]);
    expect(bark.snapshot()).toEqual({
      ready: false,
      phase: 'windup',
      elapsedMs: 1,
      lockedTargetId: 7,
    });
    expect(bark.step(248, candidate())).toEqual([]);
    expect(bark.step(1, candidate())).toEqual([
      { type: 'barkReleased', targetId: 7 },
      { type: 'damageRequested', targetId: 7, amount: 10, source: 'bark' },
    ]);
  });

  it('한 큰 step과 같은 duration의 분할 step은 같은 event와 snapshot을 만든다', () => {
    const single = new BarkSystem(3);
    const split = new BarkSystem(3);

    const singleEvents = single.step(1041, candidate());
    const splitEvents: BarkEvent[] = [];
    for (const duration of [0, 200, 50, 269, 1, 250, 271]) {
      splitEvents.push(...split.step(duration, candidate()));
    }

    expect(splitEvents).toEqual(singleEvents);
    expect(split.snapshot()).toEqual(single.snapshot());
  });

  it('reset은 level을 보존하면서 phase와 lock을 초기화해 같은 입력을 재현한다', () => {
    const bark = new BarkSystem(2);
    const first = [
      ...bark.step(0, candidate()),
      ...bark.step(250, candidate()),
      ...bark.step(400, candidate()),
    ];

    bark.reset();
    const second = [
      ...bark.step(0, candidate()),
      ...bark.step(250, candidate()),
      ...bark.step(400, candidate()),
    ];

    expect(second).toEqual(first);
    expect(bark.snapshot()).toMatchObject({ phase: 'windup', elapsedMs: 0, lockedTargetId: 7 });
  });

  it.each([0, 4, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'constructor는 invalid bark level %s을 거부한다',
    (level) => {
      expect(() => new BarkSystem(level as never)).toThrow(RangeError);
    },
  );

  it('setLevel은 invalid level에서 현재 cycle과 damage를 변경하지 않는다', () => {
    const bark = new BarkSystem(2);
    bark.step(0, candidate());
    const before = bark.snapshot();

    expect(() => bark.setLevel(0)).toThrow(RangeError);
    expect(bark.snapshot()).toEqual(before);
    expect(bark.step(250, candidate()).find((event) => event.type === 'damageRequested'))
      .toMatchObject({ amount: 13 });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'invalid stepMs %s를 state 변경 전에 거부한다',
    (stepMs) => {
      const bark = new BarkSystem(1);
      const before = bark.snapshot();

      expect(() => bark.step(stepMs, candidate())).toThrow(RangeError);
      expect(bark.snapshot()).toEqual(before);
    },
  );

  it.each([
    candidate({ id: -1 }),
    candidate({ id: 1.5 }),
    candidate({ state: 'unknown' as never }),
  ])('invalid target id/state를 state 변경 전에 거부한다', (target) => {
    const bark = new BarkSystem(1);

    expect(() => bark.step(0, target)).toThrow(RangeError);
    expect(bark.snapshot().ready).toBe(true);
  });

  it('target snapshot object를 변경하지 않는다', () => {
    const target = Object.freeze(candidate({ position: Object.freeze({ x: 10, y: 20 }) }));
    const bark = new BarkSystem(1);

    expect(() => bark.step(250, target)).not.toThrow();
    expect(target).toEqual(candidate({ position: { x: 10, y: 20 } }));
  });
});

describe('PlayerView bark presentation', () => {
  it('wave cone은 70도 이하이고 alpha/radius는 simulation age만으로 결정한다', () => {
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
      .toBeLessThanOrEqual(BARK_WAVE_CONE_DEGREES);
    expect(atStart).toMatchObject({ alpha: 1, rotation: 0 });
    expect(halfway.alpha).toBeCloseTo(0.5, 12);
    expect(halfway.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(halfway.radius).toBeGreaterThan(atStart.radius);
    expect(atEnd.alpha).toBe(0);
  });

  it.each([
    [-1, { x: 0, y: 0 }, { x: 1, y: 0 }],
    [Number.NaN, { x: 0, y: 0 }, { x: 1, y: 0 }],
    [0, { x: Number.POSITIVE_INFINITY, y: 0 }, { x: 1, y: 0 }],
    [0, { x: 0, y: 0 }, { x: Number.NaN, y: 0 }],
  ] as const)('invalid wave age/point를 거부한다', (ageMs, origin, target) => {
    expect(() => barkWaveVisualAt(ageMs, origin, target)).toThrow(RangeError);
  });

  it('attack 중에도 새 player 위치를 쓰고 frame 4..7 one-shot을 직접 설정한다', () => {
    const fake = createPlayerFakeScene();
    const view = new PlayerView(fake.scene as never, { x: 10, y: 20 });
    const sprite = fake.sprites.at(0)!;

    view.render({
      x: 55,
      y: 66,
      moving: true,
      worldAnimationMs: 999,
      barkElapsedMs: 125,
    });

    expect(lastPlayerCall(sprite, 'setPosition')).toEqual([55, 66]);
    expect(lastPlayerCall(sprite, 'setFrame')).toEqual([5]);
    expect(lastPlayerCall(sprite, 'setDepth')).toEqual([66]);
    expect(sprite.calls.has('on')).toBe(false);
    expect(sprite.calls.has('once')).toBe(false);
  });

  it('wave는 고정 cap pool에서만 acquire하고 simulation age로 release한다', () => {
    const fake = createPlayerFakeScene();
    const view = new PlayerView(fake.scene as never, { x: 10, y: 20 });
    const initial = view.effectPoolSnapshot();

    expect(fake.graphics).toHaveLength(BARK_WAVE_POOL_CAPACITY);
    expect(Array.from({ length: BARK_WAVE_POOL_CAPACITY }, (_, index) => (
      view.showBarkWave({ x: 10, y: 20 }, { x: 100 + index, y: 20 })
    )).every(Boolean)).toBe(true);
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

  it('reset과 shutdown은 active wave와 listener를 초기화하고 pool identity를 유지한다', () => {
    const fake = createPlayerFakeScene();
    const view = new PlayerView(fake.scene as never, { x: 10, y: 20 });
    const initial = view.effectPoolSnapshot();
    view.showBarkWave({ x: 10, y: 20 }, { x: 100, y: 20 });
    fake.sprites[0]!.listenerCount = 1;
    fake.graphics.at(-1)!.listenerCount = 1;

    view.resetCombatVisuals();
    expect(view.effectPoolSnapshot()).toEqual({ ...initial, active: 0, available: BARK_WAVE_POOL_CAPACITY });
    expect(fake.graphics.every((graphics) => lastPlayerCall(graphics, 'setVisible')?.at(0) === false))
      .toBe(true);

    view.showBarkWave({ x: 10, y: 20 }, { x: 100, y: 20 });
    view.destroy();
    expect(view.effectPoolSnapshot()).toEqual({ ...initial, active: 0, available: BARK_WAVE_POOL_CAPACITY });
    expect(fake.sprites[0]!.listenerCount).toBe(0);
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
} {
  const sprites: PlayerFakeGameObject[] = [];
  const graphics: PlayerFakeGameObject[] = [];
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
      },
    },
    sprites,
    graphics,
  };
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
