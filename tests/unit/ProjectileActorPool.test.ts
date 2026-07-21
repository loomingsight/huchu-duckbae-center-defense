import { AssetKeys } from '../../src/game/assets/AssetKeys';
import { projectileShapeFrame } from '../../src/game/assets/CombatShapeAtlas';
import {
  ProjectileActorPool,
  projectileVisualTransform,
} from '../../src/game/combat/ProjectileActorPool';
import type {
  ProjectileKind,
  ProjectileSnapshot,
} from '../../src/game/combat/ProjectileSystem';

it('preallocates 80 top-level Image actors and creates no projectile Sprite, Container, or Graphics', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);

  expect(pool.snapshot()).toMatchObject({ created: 80, active: 0, available: 80 });
  expect(fake.graphics).toEqual([]);
  expect(fake.images).toHaveLength(80);
  expect(fake.sprites).toEqual([]);
  expect(fake.containers).toEqual([]);
  expect(fake.imageAdds.every((args) => (
    args[0] === 0 && args[1] === 0 && args[2] === AssetKeys.combatShapes
  ))).toBe(true);
  expect(fake.images.every(({ calls }) => (
    calls.get('setOrigin')?.some((args) => args[0] === 0.5 && args[1] === 0.5)
  ))).toBe(true);
});

it('destroys every partially allocated Image when actor preallocation fails', () => {
  const fake = createProjectileScene({ failImageNumber: 3 });

  expect(() => new ProjectileActorPool(fake.scene as never, createEffectStub() as never))
    .toThrow('projectile image 3 creation failed');

  expect(fake.images).toHaveLength(2);
  expect(fake.images.map(({ calls }) => calls.get('destroy'))).toEqual([[[]], [[]]]);
});

it.each([
  ['poop', 'projectile-poop'],
  ['net', 'projectile-net'],
  ['electric', 'projectile-electric'],
] as const)('%s projectile uses the exact shared-atlas frame', (kind, expectedFrame) => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);

  pool.render([snapshot(11, kind, 140, 300)]);

  const actor = activeActorAt(fake, 140, 300);
  expect(projectileShapeFrame(kind)).toBe(expectedFrame);
  expect(actor.calls.get('setFrame')).toEqual([[expectedFrame]]);
  expect(actor.calls.get('setDepth')?.at(-1)).toEqual([301]);
  expect(actor.calls.get('setAlpha')?.at(-1)).toEqual([1]);
  expect(actor.calls.get('setActive')?.at(-1)).toEqual([true]);
  expect(actor.calls.get('setVisible')?.at(-1)).toEqual([true]);
});

it('does not repeat Image frame or liveness setters for an identical projectile render', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);

  pool.render([snapshot(3, 'poop', 270, 600)]);
  const actor = activeActorAt(fake, 270, 600);
  const livenessSetters = ['setAlpha', 'setActive', 'setVisible'] as const;
  const initialLivenessCounts = livenessSetters.map((method) => callCount(actor, method));
  pool.render([snapshot(3, 'poop', 270, 540)]);

  expect(actor.calls.get('setFrame')).toEqual([['projectile-poop']]);
  expect(actor.calls.get('setTexture')).toBeUndefined();
  expect(livenessSetters.map((method) => callCount(actor, method)))
    .toEqual(initialLivenessCounts);
  expect(actor.calls.get('setPosition')?.at(-1)).toEqual([270, 524]);
  expect(actor.calls.get('setAngle')?.at(-1)).toEqual([180]);

  pool.render([snapshot(3, 'net', 270, 520)]);
  expect(actor.calls.get('setFrame')).toEqual([
    ['projectile-poop'],
    ['projectile-net'],
  ]);
});

it('keeps the physical atlas frame cache across reset and same-kind actor reuse', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);

  pool.render([snapshot(31, 'poop', 270, 600)]);
  const actor = activeActorAt(fake, 270, 600);
  expect(actor.calls.get('setFrame')).toEqual([['projectile-poop']]);

  pool.render([]);
  pool.render([snapshot(32, 'poop', 270, 600)]);

  expect(activeActorAt(fake, 270, 600)).toBe(actor);
  expect(actor.calls.get('setFrame')).toEqual([['projectile-poop']]);
});

it('applies each changed Image liveness value exactly once across reset and reuse', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);

  pool.render([snapshot(5, 'electric', 180, 300)]);
  const actor = activeActorAt(fake, 180, 300);
  const beforeReset = imageLivenessHistory(actor);

  pool.reset();

  expect(imageLivenessHistory(actor)).toEqual({
    alpha: [...beforeReset.alpha, [1]],
    active: [...beforeReset.active, [false]],
    visible: [...beforeReset.visible, [false]],
  });
  const afterReset = imageLivenessHistory(actor);

  pool.render([snapshot(6, 'net', 200, 320)]);

  expect(imageLivenessHistory(actor)).toEqual({
    alpha: afterReset.alpha,
    active: [...afterReset.active, [true]],
    visible: [...afterReset.visible, [true]],
  });
});

it('applies only projectile Image values that changed from the previous snapshot', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const initial = snapshot(4, 'net', 140, 300.25);

  pool.render([initial]);
  const actor = activeActorAt(fake, initial.x, initial.y);
  expect(actor.calls.get('setDepth')?.at(-1)).toEqual([301.25]);
  const guardedSetters = [
    'setTexture',
    'setFrame',
    'setOrigin',
    'setPosition',
    'setAngle',
    'setRotation',
    'setScale',
    'setDepth',
    'setAlpha',
    'setActive',
    'setVisible',
  ] as const;
  const initialCounts = guardedSetters.map((method) => callCount(actor, method));

  pool.render([initial]);

  expect(guardedSetters.map((method) => callCount(actor, method))).toEqual(initialCounts);

  pool.render([snapshot(4, 'net', 141, 300.25)]);

  const positionIndex = guardedSetters.indexOf('setPosition');
  expect(callCount(actor, 'setPosition')).toBe(initialCounts[positionIndex]! + 1);
  expect(guardedSetters.map((method) => callCount(actor, method))).toEqual(
    initialCounts.map((count, index) => index === positionIndex ? count + 1 : count),
  );
});

it('keeps trajectory math and reuses the same 80 actor identities after reset', () => {
  expect(projectileVisualTransform(
    'poop',
    { x: 270, y: 600 },
    { x: 270, y: 540 },
    { x: 270, y: 480 },
  )).toEqual({ offsetY: -16, angle: 180 });
  expect(projectileVisualTransform(
    'net',
    { x: 270, y: 600 },
    { x: 270, y: 540 },
    { x: 270, y: 480 },
  )).toEqual({ offsetY: 0, angle: 0 });

  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const identities = new Set(fake.images.map(({ object }) => object));
  pool.render(Array.from({ length: 80 }, (_, id) => snapshot(id, 'electric', id, id + 100)));
  expect(pool.snapshot()).toMatchObject({ created: 80, active: 80, available: 0 });

  pool.reset();
  pool.render([snapshot(999, 'net', 20, 30)]);

  expect(pool.snapshot()).toMatchObject({ created: 80, active: 1, available: 79 });
  expect(fake.graphics).toEqual([]);
  expect(fake.images).toHaveLength(80);
  expect(new Set(fake.images.map(({ object }) => object))).toEqual(identities);
});

it('rolls back a freshly acquired actor when its first render fails', () => {
  const fake = createProjectileScene({ failSetFrameOnce: true });
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const identities = new Set(fake.images.map(({ object }) => object));
  const counters = pool.workloadCounters();

  expect(() => pool.render([snapshot(41, 'poop', 140, 300)]))
    .toThrow('projectile render failed');

  expect(pool.snapshot()).toMatchObject({ created: 80, active: 0, available: 80 });
  expect(counters).toMatchObject({
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    renderPasses: 0,
    requestedVisits: 0,
    visibleRootVisits: 0,
    activations: 0,
    releases: 0,
    rejected: 1,
  });

  pool.render([snapshot(42, 'net', 160, 320)]);

  expect(pool.snapshot()).toMatchObject({ created: 80, active: 1, available: 79 });
  expect(counters).toMatchObject({
    active: 1,
    visibleRoots: 1,
    visibleLeaves: 1,
    renderPasses: 1,
    requestedVisits: 1,
    visibleRootVisits: 1,
    activations: 1,
    releases: 0,
    rejected: 1,
  });
  expect(fake.images).toHaveLength(80);
  expect(new Set(fake.images.map(({ object }) => object))).toEqual(identities);
});

it('reports stable O(1) view workload counters across guarded renders, reset, and reuse', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const counters = pool.workloadCounters();
  const poolInstanceId = pool.snapshot().instanceId;
  const identities = new Set(fake.images.map(({ object }) => object));

  expect(counters).toEqual({
    topology: 'projectiles/image@2',
    poolInstanceId,
    allocatedRoots: 80,
    allocatedChildren: 0,
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    renderPasses: 0,
    requestedVisits: 0,
    visibleRootVisits: 0,
    stateVersion: 0,
    activations: 0,
    releases: 0,
    rejected: 0,
  });
  expect(pool.workloadCounters()).toBe(counters);

  const input = snapshot(51, 'net', 140, 300);
  pool.render([input, input]);

  expect(counters).toMatchObject({
    active: 1,
    visibleRoots: 1,
    visibleLeaves: 1,
    renderPasses: 1,
    requestedVisits: 2,
    visibleRootVisits: 1,
    stateVersion: 5,
    activations: 1,
    releases: 0,
    rejected: 0,
  });

  pool.render([input]);

  expect(counters).toMatchObject({
    renderPasses: 2,
    requestedVisits: 3,
    visibleRootVisits: 2,
    stateVersion: 5,
  });

  pool.reset();

  expect(counters).toMatchObject({
    poolInstanceId,
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    stateVersion: 9,
    activations: 1,
    releases: 1,
  });
  expect(pool.workloadCounters()).toBe(counters);
  expect(pool.snapshot().instanceId).toBe(poolInstanceId);

  pool.render([snapshot(52, 'electric', 160, 320)]);

  expect(counters).toMatchObject({
    poolInstanceId,
    active: 1,
    visibleRoots: 1,
    visibleLeaves: 1,
    renderPasses: 3,
    requestedVisits: 4,
    visibleRootVisits: 3,
    stateVersion: 14,
    activations: 2,
    releases: 1,
  });
  expect(fake.images).toHaveLength(80);
  expect(new Set(fake.images.map(({ object }) => object))).toEqual(identities);

  pool.render([]);

  expect(counters).toMatchObject({
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    renderPasses: 4,
    requestedVisits: 4,
    visibleRootVisits: 3,
    stateVersion: 18,
    activations: 2,
    releases: 2,
  });
});

it('rejects over-capacity view work without committing a completed render pass', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const counters = pool.workloadCounters();
  const input = Array.from(
    { length: 81 },
    (_, id) => snapshot(id, 'net', id, id + 100),
  );

  expect(() => pool.render(input)).toThrow('Projectile actor pool exhausted');

  expect(pool.snapshot()).toMatchObject({ created: 80, active: 80, available: 0 });
  expect(counters).toMatchObject({
    active: 80,
    visibleRoots: 80,
    visibleLeaves: 80,
    renderPasses: 0,
    requestedVisits: 0,
    visibleRootVisits: 0,
    activations: 80,
    releases: 0,
    rejected: 1,
  });
});

it('rolls back partial Image visibility state when a newly acquired actor fails mid-render', () => {
  const fake = createProjectileScene({ failImageVisibleOnce: true });
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const counters = pool.workloadCounters();

  expect(() => pool.render([snapshot(61, 'net', 140, 300)]))
    .toThrow('projectile image visibility failed');

  expect(pool.snapshot()).toMatchObject({ active: 0, available: 80 });
  expect(counters).toMatchObject({
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    renderPasses: 0,
    requestedVisits: 0,
    visibleRootVisits: 0,
    stateVersion: 3,
    activations: 0,
    releases: 0,
    rejected: 1,
  });

  pool.render([snapshot(62, 'electric', 160, 320)]);

  expect(counters).toMatchObject({
    active: 1,
    visibleRoots: 1,
    visibleLeaves: 1,
    renderPasses: 1,
    requestedVisits: 1,
    visibleRootVisits: 1,
    stateVersion: 8,
    activations: 1,
    releases: 0,
    rejected: 1,
  });
});

it('preserves fresh render and rollback failures root-first while releasing a reset-safe slot', () => {
  const renderFailure = new Error('projectile image render failed');
  const rollbackFailure = new Error('projectile image rollback failed');
  const fake = createProjectileScene({ imageVisibleFailure: renderFailure });
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const counters = pool.workloadCounters();
  const poolInstanceId = pool.snapshot().instanceId;
  fake.failImageResetStepWith('setVisible', rollbackFailure);

  const thrown = captureThrown(() => pool.render([snapshot(63, 'net', 140, 300)]));

  expect(thrown).toBeInstanceOf(AggregateError);
  expect((thrown as AggregateError).errors[0]).toBe(renderFailure);
  expect((thrown as AggregateError).errors[1]).toBe(rollbackFailure);
  expect((thrown as AggregateError).message)
    .toBe('Projectile actor render and rollback both failed');
  expect(pool.snapshot()).toMatchObject({
    instanceId: poolInstanceId,
    active: 0,
    available: 80,
  });
  expect(counters).toMatchObject({
    poolInstanceId,
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    renderPasses: 0,
    requestedVisits: 0,
    visibleRootVisits: 0,
    activations: 0,
    releases: 0,
    rejected: 1,
  });

  pool.render([snapshot(64, 'electric', 160, 320)]);

  expect(pool.snapshot()).toMatchObject({
    instanceId: poolInstanceId,
    active: 1,
    available: 79,
  });
  expect(counters).toMatchObject({
    active: 1,
    visibleRoots: 1,
    visibleLeaves: 1,
    renderPasses: 1,
    requestedVisits: 1,
    visibleRootVisits: 1,
    activations: 1,
    releases: 0,
    rejected: 1,
  });
});

it('one-time Image visibility reset failure retries cleanup and releases the actor slot', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const counters = pool.workloadCounters();
  const resetFailure = new Error('projectile reset visibility failed');
  pool.render([snapshot(71, 'poop', 140, 300)]);
  fake.failImageResetStepWith('setVisible', resetFailure);

  const thrown = captureThrown(() => pool.render([]));

  expect(thrown).toBe(resetFailure);
  expect(pool.snapshot()).toMatchObject({ active: 0, available: 80 });
  expect(counters).toMatchObject({
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    renderPasses: 1,
    requestedVisits: 1,
    visibleRootVisits: 1,
    activations: 1,
    releases: 1,
  });

  pool.render([snapshot(72, 'net', 160, 320)]);

  expect(pool.snapshot()).toMatchObject({ active: 1, available: 79 });
  expect(counters).toMatchObject({
    active: 1,
    visibleRoots: 1,
    visibleLeaves: 1,
    renderPasses: 2,
    requestedVisits: 2,
    visibleRootVisits: 2,
    activations: 2,
    releases: 1,
  });
});

it('early Image reset failure still attempts late visibility cleanup and preserves its identity', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const counters = pool.workloadCounters();
  const actor = (() => {
    pool.render([snapshot(73, 'poop', 140, 300)]);
    return activeActorAt(fake, 140, 300);
  })();
  const earlyFailure = new Error('projectile removeAllListeners failed');
  fake.failImageResetStepWith('removeAllListeners', earlyFailure);

  const thrown = captureThrown(() => pool.reset());

  expect(thrown).toBe(earlyFailure);
  expect(fake.pendingImageResetFailures()).toBe(0);
  expect(pool.snapshot()).toMatchObject({ active: 0, available: 80 });
  expect(counters).toMatchObject({
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    activations: 1,
    releases: 1,
  });
  expect(actor.calls.get('setVisible')?.at(-1)).toEqual([false]);
});

it('persistent Image visibility cleanup failure quarantines the dirty slot', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const counters = pool.workloadCounters();
  const firstVisibilityFailure = new Error('projectile image visibility reset failed');
  const retryVisibilityFailure = new Error('projectile image visibility retry failed');
  pool.render([snapshot(74, 'net', 140, 300)]);
  const dirtyActor = activeActorAt(fake, 140, 300);
  fake.failImageResetStepWith(
    'setVisible',
    firstVisibilityFailure,
    retryVisibilityFailure,
  );

  const thrown = captureThrown(() => pool.reset());

  expect(thrown).toBeInstanceOf(AggregateError);
  expect((thrown as AggregateError).errors).toEqual([
    firstVisibilityFailure,
    retryVisibilityFailure,
  ]);
  expect(fake.pendingImageResetFailures()).toBe(0);
  expect(pool.snapshot()).toMatchObject({ active: 1, available: 79 });
  expect(counters).toMatchObject({
    active: 0,
    visibleRoots: 1,
    visibleLeaves: 1,
    activations: 1,
    releases: 0,
  });

  const dirtyCallCount = [...dirtyActor.calls.values()]
    .reduce((total, calls) => total + calls.length, 0);
  pool.render([snapshot(76, 'electric', 160, 320)]);

  expect(pool.snapshot()).toMatchObject({ active: 2, available: 78 });
  expect(counters).toMatchObject({
    active: 1,
    visibleRoots: 2,
    visibleLeaves: 2,
    activations: 2,
    releases: 0,
  });
  expect([...dirtyActor.calls.values()].reduce((total, calls) => total + calls.length, 0))
    .toBe(dirtyCallCount);
});

it('simultaneous early and late reset failures retry cleanup and preserve the first identity', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const counters = pool.workloadCounters();
  const earlyFailure = new Error('projectile early reset failed');
  const imageVisibilityFailure = new Error('projectile image reset failed');
  pool.render([snapshot(75, 'electric', 140, 300)]);
  fake.failImageResetStepWith('removeAllListeners', earlyFailure);
  fake.failImageResetStepWith('setVisible', imageVisibilityFailure);

  const thrown = captureThrown(() => pool.reset());

  expect(thrown).toBe(earlyFailure);
  expect(fake.pendingImageResetFailures()).toBe(0);
  expect(pool.snapshot()).toMatchObject({ active: 0, available: 80 });
  expect(counters).toMatchObject({
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    activations: 1,
    releases: 1,
  });
});

it('reset attempts every actor release and preserves the first reset error identity', () => {
  const fake = createProjectileScene();
  const pool = new ProjectileActorPool(fake.scene as never, createEffectStub() as never);
  const counters = pool.workloadCounters();
  const firstFailure = new Error('first projectile reset failed');
  const secondFailure = new Error('second projectile reset failed');
  pool.render([
    snapshot(81, 'net', 140, 300),
    snapshot(82, 'electric', 160, 320),
  ]);
  fake.failImageResetStepWith('removeAllListeners', firstFailure, secondFailure);

  const thrown = captureThrown(() => pool.reset());

  expect(thrown).toBe(firstFailure);
  expect(fake.pendingImageResetFailures()).toBe(0);
  expect(pool.snapshot()).toMatchObject({ active: 0, available: 80 });
  expect(counters).toMatchObject({
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    activations: 2,
    releases: 2,
  });
});

function snapshot(
  id: number,
  kind: ProjectileKind,
  x: number,
  y: number,
): ProjectileSnapshot {
  return { id, kind, x, y, speed: 220, damage: 3, lifeMs: 1200 };
}

interface FakeObject {
  readonly object: object;
  readonly calls: Map<string, unknown[][]>;
}

function createProjectileScene(options: {
  readonly failSetFrameOnce?: boolean;
  readonly failImageVisibleOnce?: boolean;
  readonly imageVisibleFailure?: Error;
  readonly failImageNumber?: number;
} = {}): {
  readonly scene: object;
  readonly graphics: FakeObject[];
  readonly images: FakeObject[];
  readonly sprites: FakeObject[];
  readonly containers: FakeObject[];
  readonly imageAdds: unknown[][];
  readonly failImageResetStepWith: (
    method: string,
    ...failures: readonly Error[]
  ) => void;
  readonly pendingImageResetFailures: () => number;
} {
  const graphics: FakeObject[] = [];
  const images: FakeObject[] = [];
  const sprites: FakeObject[] = [];
  const containers: FakeObject[] = [];
  const imageAdds: unknown[][] = [];
  let imageCreationNumber = 0;
  let remainingFrameFailures = options.failSetFrameOnce === true ? 1 : 0;
  let remainingImageVisibleFailures = (
    options.failImageVisibleOnce === true
    || options.imageVisibleFailure !== undefined
  ) ? 1 : 0;
  const imageResetFailures = new Map<string, Error[]>();
  return {
    scene: {
      add: {
        graphics: (..._args: unknown[]) => {
          const fake = createFakeObject();
          graphics.push(fake);
          return fake.object;
        },
        image: (...args: unknown[]) => {
          imageCreationNumber += 1;
          if (imageCreationNumber === options.failImageNumber) {
            throw new Error(`projectile image ${imageCreationNumber} creation failed`);
          }
          imageAdds.push(args);
          const fake = createFakeObject((method) => {
            if (method !== 'setFrame' || remainingFrameFailures === 0) return;
            remainingFrameFailures -= 1;
            throw new Error('projectile render failed');
          }, (method, methodArgs) => {
            if (
              method === 'setVisible'
              && methodArgs[0] === true
              && remainingImageVisibleFailures > 0
            ) {
              remainingImageVisibleFailures -= 1;
              throw options.imageVisibleFailure
                ?? new Error('projectile image visibility failed');
            }
            const failures = imageResetFailures.get(method);
            if (failures === undefined || failures.length === 0) return;
            throw failures.shift();
          });
          images.push(fake);
          return fake.object;
        },
        sprite: (..._args: unknown[]) => {
          const fake = createFakeObject();
          sprites.push(fake);
          return fake.object;
        },
        container: (..._args: unknown[]) => {
          const fake = createFakeObject();
          containers.push(fake);
          return fake.object;
        },
      },
    },
    graphics,
    images,
    sprites,
    containers,
    imageAdds,
    failImageResetStepWith: (method, ...failures) => {
      const queued = imageResetFailures.get(method) ?? [];
      queued.push(...failures);
      imageResetFailures.set(method, queued);
    },
    pendingImageResetFailures: () => [...imageResetFailures.values()]
      .reduce((total, failures) => total + failures.length, 0),
  };
}

function captureThrown(operation: () => void): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to throw');
}

function createFakeObject(
  beforeCall?: (method: string, args: unknown[]) => void,
  failCall?: (method: string, args: unknown[]) => void,
): FakeObject {
  const calls = new Map<string, unknown[][]>();
  const object = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const name = String(property);
      beforeCall?.(name, args);
      failCall?.(name, args);
      const history = calls.get(name) ?? [];
      history.push(args);
      calls.set(name, history);
      return object;
    },
  });
  return { object, calls };
}

function callCount(fake: FakeObject, method: string): number {
  return fake.calls.get(method)?.length ?? 0;
}

function imageLivenessHistory(fake: FakeObject): {
  readonly alpha: unknown[][];
  readonly active: unknown[][];
  readonly visible: unknown[][];
} {
  return {
    alpha: [...(fake.calls.get('setAlpha') ?? [])],
    active: [...(fake.calls.get('setActive') ?? [])],
    visible: [...(fake.calls.get('setVisible') ?? [])],
  };
}

function activeActorAt(
  fake: ReturnType<typeof createProjectileScene>,
  x: number,
  y: number,
): FakeObject {
  const actor = fake.images.find(({ calls }) => (
    calls.get('setPosition')?.some((args) => (
      args[0] === x && typeof args[1] === 'number' && args[1] <= y
    ))
  ));
  if (actor === undefined) throw new Error(`No active actor at ${x}:${y}`);
  return actor;
}

function createEffectStub(): object {
  return {
    showProjectileImpact: () => true,
    projectileImpactSnapshots: () => [],
    snapshot: () => ({ instanceId: 1, created: 120, active: 0, available: 120 }),
    effectAges: () => [],
    releaseType: () => undefined,
    step: () => undefined,
  };
}
