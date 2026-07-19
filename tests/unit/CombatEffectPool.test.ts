import { FIXED_STEP_MS } from '../../src/game/constants';
import {
  CombatEffectPool,
  deokbaeHowlFrameAt,
} from '../../src/game/combat/CombatEffectPool';
import type { SkillCastVisual } from '../../src/game/skills/SkillSystem';

const SCOLD_VISUAL: SkillCastVisual = {
  kind: 'scold',
  origin: { x: 10, y: 20 },
  direction: { x: 1, y: 0 },
  length: 115,
  angleDeg: 70,
  targetPositions: [{ targetId: 1, position: { x: 100, y: 20 } }],
};

const BEAM_VISUAL: SkillCastVisual = {
  kind: 'aquaBeam',
  origin: { x: 10, y: 20 },
  direction: { x: 1, y: 0 },
  length: 250,
  width: 22,
  targetPositions: [{ targetId: 2, position: { x: 200, y: 20 } }],
};

const HOWL_VISUAL: SkillCastVisual = {
  kind: 'deokbaeHowl',
  center: { x: 200, y: 300 },
  radius: 80,
  targetPositions: [{ targetId: 3, position: { x: 210, y: 300 } }],
};

const SAFETY_VISUAL: SkillCastVisual = {
  kind: 'safetyReport',
  origin: { x: 270, y: 650 },
  targetPosition: { x: 270, y: 500 },
  targetId: 4,
};

it('projectile impact+bark+네 skill visual이 created 120인 한 shared pool만 사용한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);

  expect(effects.showProjectileImpact(7, 'poop', { x: 270, y: 518 })).toBe(true);
  expect(effects.showBarkWave({ x: 10, y: 20 }, { x: 100, y: 20 })).toBe(true);
  expect(effects.showSkillCast(SCOLD_VISUAL)).toBe(true);
  expect(effects.showSkillCast(BEAM_VISUAL)).toBe(true);
  expect(effects.showSkillCast(HOWL_VISUAL)).toBe(true);
  expect(effects.showSkillCast(SAFETY_VISUAL)).toBe(true);

  expect(effects.snapshot()).toMatchObject({ created: 120, active: 6, available: 114 });
  expect(new Set(effects.effectSnapshots().map(({ type }) => type))).toEqual(new Set([
    'projectileImpact',
    'bark',
    'scold',
    'aquaBeam',
    'deokbaeHowl',
    'safetyReport',
  ]));
  expect(fake.graphics).toHaveLength(120);
  expect(fake.sprites).toHaveLength(120);
});

it('전역 cap 이후 effect는 allocation/crash 없이 drop하고 reset 뒤 같은 actor identity를 재사용한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const accepted = Array.from({ length: 120 }, (_, index) => (
    effects.showBarkWave({ x: 0, y: 0 }, { x: index + 1, y: 0 })
  ));

  expect(accepted.every(Boolean)).toBe(true);
  expect(effects.showSkillCast(BEAM_VISUAL)).toBe(false);
  expect(effects.snapshot()).toMatchObject({ created: 120, active: 120, available: 0 });
  const firstActorId = effects.effectSnapshots().at(0)!.actorId;
  const graphicsCreated = fake.graphics.length;
  const spritesCreated = fake.sprites.length;

  effects.releaseAll();
  expect(effects.snapshot()).toMatchObject({ created: 120, active: 0, available: 120 });
  expect(effects.showProjectileImpact(99, 'electric', { x: 1, y: 2 })).toBe(true);

  expect(effects.effectSnapshots()).toEqual([
    expect.objectContaining({
      actorId: firstActorId,
      type: 'projectileImpact',
      ageMs: 0,
      projectileId: 99,
    }),
  ]);
  expect(fake.graphics).toHaveLength(graphicsCreated);
  expect(fake.sprites).toHaveLength(spritesCreated);
});

it('Task 9 impact snapshot/frame과 split fixed-step age를 유지하고 120ms에 반환한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  effects.showProjectileImpact(1, 'poop', { x: 270, y: 518 });

  expect(effects.projectileImpactSnapshots()).toEqual([
    { projectileId: 1, kind: 'poop', x: 270, y: 518, frame: 0 },
  ]);
  for (let tick = 0; tick < 6; tick += 1) effects.step(FIXED_STEP_MS);
  expect(effects.projectileImpactSnapshots()).toEqual([
    { projectileId: 1, kind: 'poop', x: 270, y: 518, frame: 3 },
  ]);
  effects.step(FIXED_STEP_MS);
  expect(effects.projectileImpactSnapshots()).toHaveLength(1);
  effects.step(FIXED_STEP_MS);

  expect(effects.projectileImpactSnapshots()).toEqual([]);
  expect(effects.snapshot()).toMatchObject({ active: 0, available: 120 });
});

it('releaseType은 다른 effect identity/age를 건드리지 않는다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  effects.showProjectileImpact(1, 'net', { x: 1, y: 2 });
  effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 });
  effects.step(FIXED_STEP_MS);
  const barkBefore = effects.effectSnapshots().find(({ type }) => type === 'bark');

  effects.releaseType('projectileImpact');

  expect(effects.projectileImpactSnapshots()).toEqual([]);
  expect(effects.effectSnapshots()).toEqual([barkBefore]);
});

it('덕배 frames 4~7은 8fps one-shot이고 500ms 뒤 종료한다', () => {
  expect([0, 124.999, 125, 250, 375, 499.999, 500].map(deokbaeHowlFrameAt))
    .toEqual([4, 4, 5, 6, 7, 7, 7]);
});

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
  'invalid effect step %s는 state 변경 전에 fail-fast한다',
  (stepMs) => {
    const effects = new CombatEffectPool(createEffectScene().scene as never);
    effects.showSkillCast(SCOLD_VISUAL);
    const before = effects.effectSnapshots();

    expect(() => effects.step(stepMs)).toThrow(RangeError);
    expect(effects.effectSnapshots()).toEqual(before);
  },
);

interface FakeObject {
  readonly object: object;
  readonly calls: Map<string, unknown[][]>;
  listenerCount: number;
}

function createEffectScene(): {
  readonly scene: object;
  readonly graphics: FakeObject[];
  readonly sprites: FakeObject[];
} {
  const graphics: FakeObject[] = [];
  const sprites: FakeObject[] = [];
  const create = (collection: FakeObject[]): object => {
    const fake = createFakeObject();
    collection.push(fake);
    return fake.object;
  };
  return {
    scene: {
      add: {
        graphics: () => create(graphics),
        sprite: () => create(sprites),
      },
    },
    graphics,
    sprites,
  };
}

function createFakeObject(): FakeObject {
  const calls = new Map<string, unknown[][]>();
  const fake: FakeObject = { object: {}, calls, listenerCount: 0 };
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
