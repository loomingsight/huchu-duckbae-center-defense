import { FIXED_STEP_MS } from '../../src/game/constants';
import {
  ProjectileActorPool,
  projectileImpactFrameAt,
  projectileVisualTransform,
} from '../../src/game/combat/ProjectileActorPool';
import { ProjectileSystem } from '../../src/game/combat/ProjectileSystem';
import { GameSession } from '../../src/game/session/GameSession';

it('보호소 원에 닿을 때 피해를 한 번 적용하고 풀로 반환한다', () => {
  const projectiles = new ProjectileSystem(80);
  projectiles.spawn({
    id: 1,
    kind: 'poop',
    from: { x: 270, y: 566 },
    to: { x: 270, y: 480 },
    speed: 220,
    damage: 3,
    lifeMs: 1200,
  });

  const events = projectiles.step(500);

  expect(events.filter((event) => event.type === 'shelterDamageRequested')).toHaveLength(1);
  expect(projectiles.activeCount).toBe(0);
  expect(projectiles.step(500)).toEqual([]);
});

it('cap 이후 투사체는 새 객체 생성이나 crash 없이 drop event로 끝난다', () => {
  const projectiles = new ProjectileSystem(1);
  const input = {
    id: 1,
    kind: 'poop' as const,
    from: { x: 270, y: 566 },
    to: { x: 270, y: 480 },
    speed: 220,
    damage: 3,
    lifeMs: 1200,
  };
  projectiles.spawn(input);

  expect(projectiles.spawn({ ...input, id: 2 })).toEqual([
    { type: 'projectileDropped', projectileId: 2, kind: 'poop', reason: 'capacity' },
  ]);
  expect(projectiles.activeCount).toBe(1);
  expect(projectiles.poolSnapshot().created).toBe(1);
});

it('1200ms 만료도 한 번 반환되고 이후 step에서 다시 처리되지 않는다', () => {
  const projectiles = new ProjectileSystem(1, 0);
  projectiles.spawn({
    id: 1,
    kind: 'electric',
    from: { x: 0, y: 0 },
    to: { x: 1000, y: 0 },
    speed: 1,
    damage: 18,
    lifeMs: 1200,
  });

  expect(projectiles.step(1199)).toEqual([]);
  expect(projectiles.activeCount).toBe(1);
  expect(projectiles.step(1)).toEqual([]);
  expect(projectiles.activeCount).toBe(0);
  expect(projectiles.step(1)).toEqual([]);
  expect(projectiles.poolSnapshot()).toMatchObject({ active: 0, available: 1 });
});

it('한 step이 lifetime을 넘겨도 만료 뒤 경로의 늦은 충돌은 피해를 만들지 않는다', () => {
  const projectiles = new ProjectileSystem(1, 0);
  projectiles.spawn({
    id: 1,
    kind: 'net',
    from: { x: 0, y: 0 },
    to: { x: 1000, y: 0 },
    speed: 1000,
    damage: 14,
    lifeMs: 100,
  });

  expect(projectiles.step(1000)).toEqual([]);
  expect(projectiles.activeCount).toBe(0);
});

it('정확히 lifetime 경계에서 보호소 원에 닿으면 피해를 한 번 만든다', () => {
  const projectiles = new ProjectileSystem(1, 0);
  projectiles.spawn({
    id: 1,
    kind: 'electric',
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
    speed: 1000,
    damage: 18,
    lifeMs: 100,
  });

  expect(projectiles.step(1000)).toEqual([
    { type: 'projectileHit', projectileId: 1, kind: 'electric' },
    { type: 'shelterDamageRequested', projectileId: 1, damage: 18 },
  ]);
  expect(projectiles.step(1)).toEqual([]);
});

it('invalid step과 spawn number는 상태 변경 전에 거부한다', () => {
  const projectiles = new ProjectileSystem(1);
  const input = {
    id: 1,
    kind: 'poop' as const,
    from: { x: 270, y: 566 },
    to: { x: 270, y: 480 },
    speed: 220,
    damage: 3,
    lifeMs: 1200,
  };

  for (const stepMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => projectiles.step(stepMs)).toThrow(RangeError);
  }
  for (const invalid of [
    { ...input, speed: Number.NaN },
    { ...input, damage: Number.POSITIVE_INFINITY },
    { ...input, lifeMs: Number.NaN },
    { ...input, from: { x: Number.NaN, y: 566 } },
  ]) {
    expect(() => projectiles.spawn(invalid)).toThrow(RangeError);
  }
  expect(projectiles.activeCount).toBe(0);
});

it('GameSession은 projectile hit command만 보호소 피해로 한 번 소비하고 reset에서 pool을 재사용한다', () => {
  const run = GameSession.create({ seed: 1 });
  run.suppressWaveSpawnsForScenario();
  run.spawnEnemyForScenario({
    kind: 'poopGuardian',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'attackBoundary' },
  });

  const releaseEvents = Array.from(
    { length: 15 },
    () => run.step(FIXED_STEP_MS, { x: 0, y: 0 }),
  ).flat();
  expect(releaseEvents.filter(({ type }) => type === 'projectileSpawned')).toHaveLength(1);
  expect(run.snapshot()).toMatchObject({
    shelterHp: 100,
    activeProjectileCount: 1,
    projectiles: [{ id: 0, kind: 'poop', speed: 220, lifeMs: 1200 }],
  });
  expect(run.projectilePoolTelemetry()).toMatchObject({ created: 80, active: 1 });

  const hitEvents = Array.from(
    { length: 30 },
    () => run.step(FIXED_STEP_MS, { x: 0, y: 0 }),
  ).flat();
  expect(hitEvents.filter(({ type }) => type === 'projectileHit')).toHaveLength(1);
  expect(hitEvents.filter(({ type }) => type === 'shelterDamaged')).toHaveLength(1);
  expect(run.snapshot()).toMatchObject({
    shelterHp: 97,
    activeProjectileCount: 0,
    projectiles: [],
  });

  const pool = run.projectilePoolTelemetry();
  run.reset(2);
  expect(run.projectilePoolTelemetry()).toEqual({ ...pool, active: 0, available: 80 });
  expect(run.snapshot()).toMatchObject({ shelterHp: 100, projectiles: [] });
});

it('poop view만 world hit 위치와 분리된 포물선 offset·회전을 사용한다', () => {
  const start = { x: 270, y: 566 };
  const halfway = { x: 270, y: 523 };
  const target = { x: 270, y: 480 };

  expect(projectileVisualTransform('poop', start, halfway, target)).toMatchObject({
    offsetY: -16,
    angle: 180,
  });
  expect(projectileVisualTransform('net', start, halfway, target)).toEqual({
    offsetY: 0,
    angle: 0,
  });
  expect(projectileVisualTransform('electric', start, halfway, target)).toEqual({
    offsetY: 0,
    angle: 0,
  });
});

it('hit effect는 fixed-step 4 frame 뒤 종료한다', () => {
  expect([0, 30, 60, 90].map(projectileImpactFrameAt)).toEqual([0, 1, 2, 3]);
});

it('ProjectileActorPool은 80개를 시작 시 선할당하고 hit·expiry snapshot 부재를 모두 반환한다', () => {
  const fake = createFakeProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never);
  const initial = pool.snapshot();
  const projectile = {
    id: 1,
    kind: 'poop' as const,
    x: 270,
    y: 566,
    speed: 220,
    damage: 3,
    lifeMs: 1200,
  };

  expect(fake.containers).toHaveLength(80);
  expect(initial).toMatchObject({ created: 80, active: 0, available: 80 });
  pool.render([projectile]);
  expect(pool.snapshot()).toEqual({ ...initial, active: 1, available: 79 });
  pool.showHit(1, 'poop');
  pool.render([]);
  expect(pool.snapshot()).toEqual(initial);
  expect(pool.activeEffectCount).toBe(1);
  pool.stepEffects(119);
  expect(pool.activeEffectCount).toBe(1);
  pool.stepEffects(1);
  expect(pool.activeEffectCount).toBe(0);

  pool.render([{ ...projectile, id: 2, kind: 'electric' }]);
  pool.render([]);
  expect(pool.snapshot()).toEqual(initial);
  expect(fake.graphics.every((graphic) => graphic.listenerCount === 0)).toBe(true);
});

interface FakeObject {
  readonly object: object;
  readonly calls: Map<string, unknown[][]>;
  listenerCount: number;
}

function createFakeProjectileScene(): {
  readonly scene: object;
  readonly graphics: FakeObject[];
  readonly containers: FakeObject[];
} {
  const graphics: FakeObject[] = [];
  const containers: FakeObject[] = [];
  const create = (collection: FakeObject[]) => {
    const fake = createFakeObject();
    collection.push(fake);
    return fake.object;
  };
  return {
    scene: {
      add: {
        graphics: () => create(graphics),
        container: () => create(containers),
      },
      tweens: {
        add: () => ({ stop: vi.fn() }),
      },
    },
    graphics,
    containers,
  };
}

function createFakeObject(): FakeObject {
  const calls = new Map<string, unknown[][]>();
  const fake: FakeObject = { object: {}, calls, listenerCount: 0 };
  const target = {};
  const object = new Proxy(target, {
    get: (_current, property) => (...args: unknown[]) => {
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
