import { FIXED_STEP_MS } from '../../src/game/constants';
import {
  ProjectileActorPool,
  projectileImpactFrameAt,
  projectileVisualTransform,
} from '../../src/game/combat/ProjectileActorPool';
import { ProjectileSystem } from '../../src/game/combat/ProjectileSystem';
import { E2eGameSession as GameSession } from '../../src/game/debug/E2eGameSession';
import { CombatEffectPool } from '../../src/game/combat/CombatEffectPool';

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

it('큰 step과 분할 step은 보호소 원의 같은 최초 교차 좌표에서 hit한다', () => {
  const input = {
    id: 1,
    kind: 'poop' as const,
    from: { x: 270, y: 566 },
    to: { x: 270, y: 480 },
    speed: 220,
    damage: 3,
    lifeMs: 1200,
  };
  const whole = new ProjectileSystem(1);
  const split = new ProjectileSystem(1);
  whole.spawn(input);
  split.spawn(input);

  const wholeHit = whole.step(500).find(({ type }) => type === 'projectileHit');
  const splitHit = Array.from({ length: 30 }, () => split.step(FIXED_STEP_MS))
    .flat()
    .find(({ type }) => type === 'projectileHit');

  expect(wholeHit).toMatchObject({
    type: 'projectileHit',
    projectileId: 1,
    kind: 'poop',
    position: { x: 270, y: 518 },
  });
  expect(splitHit).toEqual(wholeHit);
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
    {
      type: 'projectileHit',
      projectileId: 1,
      kind: 'electric',
      position: { x: 100, y: 0 },
    },
    { type: 'shelterDamageRequested', projectileId: 1, damage: 18 },
  ]);
  expect(projectiles.step(1)).toEqual([]);
});

it('invalid step과 spawn number는 상태 변경 전에 거부한다', () => {
  for (const shelterRadius of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => new ProjectileSystem(1, shelterRadius)).toThrow(RangeError);
  }
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
  run.scenarioPortForE2e().suppressWaveSpawns();
  run.scenarioPortForE2e().spawnEnemy({
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
  expect(run.scenarioPortForE2e().projectilePoolTelemetry()).toMatchObject({ created: 80, active: 1 });

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

  const pool = run.scenarioPortForE2e().projectilePoolTelemetry();
  run.reset(2);
  expect(run.scenarioPortForE2e().projectilePoolTelemetry()).toEqual({ ...pool, active: 0, available: 80 });
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

it('ProjectileActorPool은 projectile actor 없이도 authoritative 위치에 독립 hit effect를 만든다', () => {
  const fake = createFakeProjectileScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const pool = new ProjectileActorPool(fake.scene as never, effects);
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
  expect(fake.graphics).toHaveLength(200);
  expect(initial).toMatchObject({ created: 80, active: 0, available: 80 });
  expect(pool.impactPoolSnapshot()).toMatchObject({ created: 120, active: 0, available: 120 });
  pool.showHit(1, 'poop', { x: 270, y: 518 });
  expect(pool.impactSnapshots()).toEqual([
    { projectileId: 1, kind: 'poop', x: 270, y: 518, frame: 0 },
  ]);
  expect(pool.snapshot()).toEqual(initial);
  expect(pool.activeEffectCount).toBe(1);
  pool.stepEffects(119);
  expect(pool.activeEffectCount).toBe(1);
  pool.stepEffects(1);
  expect(pool.activeEffectCount).toBe(0);
  expect(pool.impactPoolSnapshot()).toMatchObject({ active: 0, available: 120 });

  pool.render([{ ...projectile, id: 2, kind: 'electric' }]);
  pool.render([]);
  pool.showHit(2, 'electric', { x: 270, y: 518 });
  expect(pool.impactSnapshots()).toEqual([
    { projectileId: 2, kind: 'electric', x: 270, y: 518, frame: 0 },
  ]);
  pool.releaseAll();
  expect(pool.snapshot()).toEqual(initial);
  expect(pool.impactPoolSnapshot()).toMatchObject({ active: 0, available: 120 });
  expect(pool.impactSnapshots()).toEqual([]);
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
  readonly sprites: FakeObject[];
  readonly containers: FakeObject[];
} {
  const graphics: FakeObject[] = [];
  const sprites: FakeObject[] = [];
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
        sprite: () => create(sprites),
        container: () => create(containers),
      },
      tweens: {
        add: () => ({ stop: vi.fn() }),
      },
    },
    graphics,
    sprites,
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
