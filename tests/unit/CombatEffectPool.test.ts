import { FIXED_STEP_MS } from '../../src/game/constants';
import { AssetKeys } from '../../src/game/assets/AssetKeys';
import { impactShapeFrame } from '../../src/game/assets/CombatShapeAtlas';
import {
  BARK_WAVE_CONE_DEGREES,
  CombatEffectPool,
  SAFETY_REPORT_DURATION_MS,
  selectHuchuBodyAction,
} from '../../src/game/combat/CombatEffectPool';
import { E2eCombatEffectPool } from '../../src/game/debug/E2eCombatEffectPool';
import { ObjectPool } from '../../src/game/pooling/ObjectPool';

it('H6는 한 Blitter에 exact 120 invisible Bob을 만들고 impact-only cap에서 Graphics를 만들지 않는다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);

  expect(fake.blitterAdds).toEqual([[
    0, 0, AssetKeys.combatShapes, 'impact-poop-0',
  ]]);
  expect(fake.blitters).toHaveLength(1);
  expect(fake.blitters[0]!.calls.get('setDepth')).toEqual([[1001]]);
  expect(fake.blitters[0]!.calls.get('create')).toHaveLength(120);
  expect(fake.blitters[0]!.calls.get('create')?.every((args) => (
    args[0] === 0
    && args[1] === 0
    && args[2] === 'impact-poop-0'
    && args[3] === false
  ))).toBe(true);
  expect(fake.bobs).toHaveLength(120);
  expect(new Set(fake.bobs.map(({ object }) => object)).size).toBe(120);
  expect(fake.graphics).toEqual([]);
  expect(fake.sprites).toEqual([]);

  for (let index = 0; index < 120; index += 1) {
    expect(effects.showProjectileImpact(index, 'poop', { x: 270, y: 518 })).toBe(true);
  }

  expect(effects.snapshot()).toMatchObject({ created: 120, active: 120, available: 0 });
  expect(fake.graphics).toEqual([]);
  expect(fake.bobs.every((bob) => bob.calls.get('setVisible')?.at(-1)?.[0] === true)).toBe(true);
});

it('effect workload는 생성 topology를 O(1) stable scalar view로 노출한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  const counters = effects.workloadCounters();

  expect(effects.workloadCounters()).toBe(counters);
  expect(counters).toEqual({
    topology: 'effects/blitter-120-bobs+lazy-graphics@1',
    poolInstanceId: expect.any(Number),
    allocatedRoots: 1,
    allocatedChildren: 120,
    impactActive: 0,
    renderEligibleBobs: 0,
    graphicsAllocated: 0,
    graphicsVisible: 0,
    stepPasses: 0,
    activeActorVisits: 0,
    visibleDrawableVisits: 0,
    stateVersion: 0,
    activations: 0,
    releases: 0,
    rejected: 0,
  });
  expect(Object.values(counters).every((value) => (
    typeof value === 'number' || typeof value === 'string'
  ))).toBe(true);
});

it('effect workload poolInstanceId는 실제 ObjectPool snapshot identity와 같다', () => {
  new CombatEffectPool(createEffectScene().scene as never);
  new ObjectPool(1, () => ({}));
  const effects = new CombatEffectPool(createEffectScene().scene as never);

  expect(effects.workloadCounters().poolInstanceId).toBe(effects.snapshot().instanceId);
});

it('effect workload는 exact world bounds의 impact Bob만 render eligible로 센다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const points = [
    { x: 0, y: 0 },
    { x: 540, y: 960 },
    { x: -Number.EPSILON, y: 0 },
    { x: 540 + 1e-9, y: 960 },
  ] as const;

  points.forEach((point, index) => {
    expect(effects.showProjectileImpact(index, 'poop', point)).toBe(true);
  });

  expect(effects.workloadCounters()).toMatchObject({
    impactActive: 4,
    renderEligibleBobs: 2,
    activations: 4,
    releases: 0,
  });
  expect(fake.bobs.filter((bob) => (
    bob.calls.get('setVisible')?.at(-1)?.[0] === true
  ))).toHaveLength(2);

  effects.releaseAll();

  expect(effects.workloadCounters()).toMatchObject({
    impactActive: 0,
    renderEligibleBobs: 0,
    activations: 4,
    releases: 4,
  });
});

it('effect workload는 성공 step의 시작 visits와 impact phase/release version만 누적한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  expect(effects.showProjectileImpact(1, 'electric', { x: 270, y: 518 })).toBe(true);
  const activationVersion = effects.workloadCounters().stateVersion;

  effects.step(29);

  expect(effects.workloadCounters()).toMatchObject({
    stepPasses: 1,
    activeActorVisits: 1,
    visibleDrawableVisits: 1,
    stateVersion: activationVersion,
  });

  effects.step(1);
  const phaseVersion = effects.workloadCounters().stateVersion;

  expect(phaseVersion).toBeGreaterThan(activationVersion);
  expect(effects.workloadCounters()).toMatchObject({
    stepPasses: 2,
    activeActorVisits: 2,
    visibleDrawableVisits: 2,
    impactActive: 1,
    renderEligibleBobs: 1,
  });

  effects.step(89.999);
  effects.step(0.001);

  expect(effects.workloadCounters()).toMatchObject({
    stepPasses: 4,
    activeActorVisits: 4,
    visibleDrawableVisits: 4,
    impactActive: 0,
    renderEligibleBobs: 0,
    activations: 1,
    releases: 1,
  });
  expect(effects.workloadCounters().stateVersion).toBeGreaterThan(phaseVersion);
});

it('effect workload는 Graphics를 lazy root로 한 번만 세고 실제 visibility를 추적한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  const initialVersion = effects.workloadCounters().stateVersion;

  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);

  expect(effects.workloadCounters()).toMatchObject({
    allocatedRoots: 2,
    allocatedChildren: 120,
    graphicsAllocated: 1,
    graphicsVisible: 1,
    impactActive: 0,
    renderEligibleBobs: 0,
    activations: 1,
  });
  expect(effects.workloadCounters().stateVersion).toBeGreaterThan(initialVersion);

  effects.releaseAll();

  expect(effects.workloadCounters()).toMatchObject({
    allocatedRoots: 2,
    graphicsAllocated: 1,
    graphicsVisible: 0,
    releases: 1,
  });
  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  expect(effects.workloadCounters()).toMatchObject({
    allocatedRoots: 2,
    graphicsAllocated: 1,
    graphicsVisible: 1,
    activations: 2,
  });
});

it('effect workload stateVersion은 성공한 Graphics render pass를 반영한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  const activationVersion = effects.workloadCounters().stateVersion;

  effects.step(0);

  expect(effects.workloadCounters()).toMatchObject({
    stepPasses: 1,
    activeActorVisits: 1,
    visibleDrawableVisits: 1,
  });
  expect(effects.workloadCounters().stateVersion).toBeGreaterThan(activationVersion);
});

it('H6 constructor는 57번째 Bob 생성 실패에서 partial Blitter를 destroy한다', () => {
  const fake = createEffectScene({ failBobNumber: 57 });

  expect(() => new CombatEffectPool(fake.scene as never)).toThrow('fake Bob 57 creation failed');

  expect(fake.blitters).toHaveLength(1);
  expect(fake.bobs).toHaveLength(56);
  expect(fake.blitters[0]!.calls.get('destroy')).toEqual([[]]);
});

it('H6 first lazy Graphics 실패는 slot과 partial object를 rollback하고 같은 actor를 retry한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const initial = effects.snapshot();
  const initialWorkload = { ...effects.workloadCounters() };
  fake.failGraphicsDepthOn(1);

  expect(() => effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 }))
    .toThrow('fake Graphics setDepth failed');

  expect(effects.snapshot()).toEqual(initial);
  expect(effects.effectSnapshots()).toEqual([]);
  expect(fake.graphics).toHaveLength(1);
  expect(fake.graphics[0]!.calls.get('destroy')).toEqual([[]]);
  expect(effects.workloadCounters()).toEqual({
    ...initialWorkload,
    rejected: 1,
  });

  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  expect(effects.effectSnapshots()).toEqual([
    expect.objectContaining({ actorId: 119, type: 'bark' }),
  ]);
  expect(fake.graphics).toHaveLength(2);
});

it('activation과 rollback setter가 모두 실패해도 effect slot은 회수된다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const initial = effects.snapshot();
  const activationError = new Error('fake activation render failed');
  const rollbackError = new Error('fake rollback reset failed');
  fake.failGraphicsOn(1, 'setPosition', 2, [activationError, rollbackError]);

  let thrown: unknown;
  try {
    effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(AggregateError);
  expect((thrown as AggregateError).errors).toEqual([activationError, rollbackError]);

  expect(effects.snapshot()).toEqual(initial);
  expect(effects.workloadCounters()).toMatchObject({
    graphicsAllocated: 1,
    graphicsVisible: 0,
    activations: 0,
    releases: 0,
    rejected: 1,
  });

  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  expect(effects.snapshot()).toMatchObject({ active: 1, available: 119 });
  expect(effects.workloadCounters()).toMatchObject({
    graphicsAllocated: 1,
    graphicsVisible: 1,
    activations: 1,
  });
});

it('release reset setter가 실패해도 active Set과 effect slot은 함께 회수된다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  const graphics = fake.graphics[0]!;
  graphics.failNext('setPosition');

  expect(() => effects.releaseAll()).toThrow('fake Graphics setPosition failed');

  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.snapshot()).toMatchObject({ active: 0, available: 120 });
  expect(effects.workloadCounters()).toMatchObject({
    graphicsAllocated: 1,
    graphicsVisible: 0,
    activations: 1,
    releases: 1,
  });

  graphics.calls.clear();
  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  expect(fake.graphics).toEqual([graphics]);
  expect(graphics.calls.get('setActive')).toEqual([[true]]);
  expect(graphics.calls.get('setVisible')).toEqual([[true]]);
  expect(effects.snapshot()).toMatchObject({ active: 1, available: 119 });
});

it('release의 late visibility 실패 뒤 재사용은 실제 Graphics active를 복구한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  const graphics = fake.graphics[0]!;
  graphics.failNext('setVisible');

  expect(() => effects.releaseAll()).toThrow('fake Graphics setVisible failed');
  expect(effects.snapshot()).toMatchObject({ active: 0, available: 120 });
  expect(effects.workloadCounters().graphicsVisible).toBe(0);
  graphics.calls.clear();

  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);

  expect(graphics.calls.get('setActive')).toEqual([[true]]);
  expect(graphics.calls.get('setVisible')).toEqual([[true]]);
  expect(effects.workloadCounters()).toMatchObject({
    graphicsAllocated: 1,
    graphicsVisible: 1,
    activations: 2,
    releases: 1,
  });
});

it('persistent visibility cleanup 실패 actor는 available slot에서 격리한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  const dirtyGraphics = fake.graphics[0]!;
  dirtyGraphics.failNext('setVisible', 2);

  expect(() => effects.releaseAll()).toThrow(AggregateError);

  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.snapshot()).toMatchObject({ active: 1, available: 119 });
  expect(effects.workloadCounters()).toMatchObject({
    graphicsAllocated: 1,
    graphicsVisible: 1,
    activations: 1,
    releases: 0,
  });
  dirtyGraphics.calls.clear();

  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);

  expect(fake.graphics).toHaveLength(2);
  expect(dirtyGraphics.calls.size).toBe(0);
  expect(effects.snapshot()).toMatchObject({ active: 2, available: 118 });
  expect(effects.workloadCounters()).toMatchObject({
    graphicsAllocated: 2,
    graphicsVisible: 2,
    activations: 2,
    releases: 0,
  });
});

it('releaseAll은 한 actor reset 실패 뒤에도 나머지 slot과 safety clock을 정리한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  expect(effects.startSafetyReport('safety:release-failure', { x: 270, y: 650 }, [
    { targetId: 1, position: { x: 200, y: 500 } },
    { targetId: 2, position: { x: 340, y: 500 } },
  ])).toBe(2);
  const secondActorId = effects.effectSnapshots()[1]!.actorId;
  fake.bobs[secondActorId]!.failNext(
    'setPosition',
    1,
    [new Error('fake safety Bob setPosition failed')],
  );

  expect(() => effects.releaseAll()).toThrow('fake safety Bob setPosition failed');

  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.activeSafetyClockCount()).toBe(0);
  expect(effects.snapshot()).toMatchObject({ active: 0, available: 120 });
  expect(effects.workloadCounters()).toMatchObject({
    graphicsAllocated: 0,
    graphicsVisible: 0,
    renderEligibleBobs: 0,
    activations: 2,
    releases: 2,
  });
});

it('releaseType safetyNotice는 실패해도 모든 제거 대상 cast clock을 정리한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const releaseError = new Error('fake safety notice release failed');
  expect(effects.startSafetyReport('safety:released', { x: 270, y: 650 }, [
    { targetId: 1, position: { x: 200, y: 500 } },
  ])).toBe(1);
  expect(effects.startSafetyReport('safety:also-released', { x: 270, y: 650 }, [
    { targetId: 2, position: { x: 340, y: 500 } },
  ])).toBe(1);
  const firstActorId = effects.effectSnapshots()[0]!.actorId;
  fake.bobs[firstActorId]!.failNext('setPosition', 1, [releaseError]);

  let thrown: unknown;
  try {
    effects.releaseType('safetyNotice');
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(releaseError);
  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.activeSafetyClockCount()).toBe(0);
  expect(effects.showSafetyImpact('safety:released', [])).toBe(0);
  expect(effects.showSafetyImpact('safety:also-released', [])).toBe(0);
});

it('H6 safety batch는 두 번째 shared Bob 실패 시 앞선 notice와 cast clock까지 rollback한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const initial = effects.snapshot();
  const targets = [
    { targetId: 1, position: { x: 120, y: 300 } },
    { targetId: 2, position: { x: 240, y: 400 } },
  ];
  const activationError = new Error('fake safety Bob frame failed');
  fake.bobs.at(-2)!.failNext('setFrame', 1, [activationError]);

  expect(() => effects.startSafetyReport('safety:atomic', { x: 270, y: 650 }, targets))
    .toThrow('fake safety Bob frame failed');

  expect(effects.snapshot()).toEqual(initial);
  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.activeSafetyClockCount()).toBe(0);

  expect(effects.startSafetyReport('safety:atomic', { x: 270, y: 650 }, targets)).toBe(2);
  expect(effects.effectSnapshots().map(({ type }) => type)).toEqual([
    'safetyNotice', 'safetyNotice',
  ]);
  expect(effects.activeSafetyClockCount()).toBe(1);
});

it('같은 safety cast 재시작 실패는 기존 clock age와 notice를 보존한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const restartError = new Error('fake safety restart failed');
  expect(effects.startSafetyReport('safety:restart', { x: 270, y: 650 }, [
    { targetId: 1, position: { x: 120, y: 300 } },
  ])).toBe(1);
  effects.step(100);
  fake.bobs.at(-2)!.failNext('setFrame', 1, [restartError]);

  let thrown: unknown;
  try {
    effects.startSafetyReport('safety:restart', { x: 270, y: 650 }, [
      { targetId: 2, position: { x: 240, y: 400 } },
    ]);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(restartError);
  expect(effects.effectSnapshots()).toEqual([
    expect.objectContaining({ targetId: 1, type: 'safetyNotice', ageMs: 100 }),
  ]);
  expect(effects.activeSafetyClockCount()).toBe(1);

  effects.step(SAFETY_REPORT_DURATION_MS + FIXED_STEP_MS - 100 + 0.001);
  expect(effects.activeSafetyClockCount()).toBe(0);
});

it('safety activation 0건은 새 clock을 만들거나 기존 clock age를 reset하지 않는다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  expect(effects.startSafetyReport('safety:empty', { x: 270, y: 650 }, [])).toBe(0);
  expect(effects.activeSafetyClockCount()).toBe(0);

  expect(effects.startSafetyReport('safety:existing', { x: 270, y: 650 }, [
    { targetId: 1, position: { x: 120, y: 300 } },
  ])).toBe(1);
  effects.step(100);

  expect(effects.startSafetyReport('safety:existing', { x: 270, y: 650 }, [])).toBe(0);
  expect(effects.activeSafetyClockCount()).toBe(1);
  effects.step(SAFETY_REPORT_DURATION_MS + FIXED_STEP_MS - 100 + 0.001);
  expect(effects.activeSafetyClockCount()).toBe(0);
});

it('같은 safety cast 재시작 성공은 새 clock을 0부터 시작하고 기존 notice는 독립 만료한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  expect(effects.startSafetyReport('safety:restart-success', { x: 270, y: 650 }, [
    { targetId: 1, position: { x: 120, y: 300 } },
  ])).toBe(1);
  effects.step(100);

  expect(effects.startSafetyReport('safety:restart-success', { x: 270, y: 650 }, [
    { targetId: 2, position: { x: 240, y: 400 } },
  ])).toBe(1);
  expect(effects.effectSnapshots().map(({ targetId, ageMs }) => ({ targetId, ageMs }))).toEqual([
    { targetId: 1, ageMs: 100 },
    { targetId: 2, ageMs: 0 },
  ]);

  effects.step(SAFETY_REPORT_DURATION_MS + FIXED_STEP_MS - 100 + 0.001);
  expect(effects.effectSnapshots()).toEqual([
    expect.objectContaining({ targetId: 2, type: 'safetyNotice' }),
  ]);
  expect(effects.activeSafetyClockCount()).toBe(1);

  effects.step(100);
  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.activeSafetyClockCount()).toBe(0);
});

it('H6 aqua target batch도 N번째 lazy Graphics 실패에서 이번 호출의 splash를 전부 rollback한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const initial = effects.snapshot();
  const targets = [
    { targetId: 1, position: { x: 120, y: 300 } },
    { targetId: 2, position: { x: 240, y: 400 } },
  ];
  fake.failGraphicsDepthOn(2);

  expect(() => effects.showAquaImpact('aqua:atomic', targets))
    .toThrow('fake Graphics setDepth failed');

  expect(effects.snapshot()).toEqual(initial);
  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.showAquaImpact('aqua:atomic', targets)).toBe(2);
});

it('target batch activation과 rollback이 모두 실패하면 root-first AggregateError를 보존한다', () => {
  const activationError = new Error('fake target activation failed');
  const rollbackError = new Error('fake target rollback failed');
  const fake = createEffectScene({
    beforeGraphicsCreation: (creationNumber, existing) => {
      if (creationNumber === 3) existing[1]!.failNext('setPosition', 1, [rollbackError]);
    },
  });
  const effects = new CombatEffectPool(fake.scene as never);
  fake.failGraphicsOn(3, 'setDepth', 1, [activationError]);

  let thrown: unknown;
  try {
    effects.showAquaImpact('aqua:rollback-failure', [
      { targetId: 1, position: { x: 120, y: 300 } },
      { targetId: 2, position: { x: 240, y: 400 } },
      { targetId: 3, position: { x: 360, y: 500 } },
    ]);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(AggregateError);
  expect((thrown as AggregateError).errors).toEqual([activationError, rollbackError]);

  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.snapshot()).toMatchObject({ active: 0, available: 120 });
  expect(effects.workloadCounters()).toMatchObject({
    graphicsAllocated: 2,
    graphicsVisible: 0,
    activations: 2,
    releases: 2,
    rejected: 1,
  });
});

it('H6 impact는 119.999ms까지 같은 Bob을 보이고 exact 120ms에 반환한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  effects.showProjectileImpact(1, 'electric', { x: 270, y: 518 });
  expect(fake.bobs).toHaveLength(120);
  const bob = fake.bobs.at(-1)!;

  effects.step(119.999);

  expect(effects.snapshot()).toMatchObject({ active: 1, available: 119 });
  expect(bob.calls.get('setVisible')?.at(-1)).toEqual([true]);
  expect(bob.calls.get('setFrame')?.at(-1)).toEqual(['impact-electric-3']);

  effects.step(0.001);

  expect(effects.snapshot()).toMatchObject({ active: 0, available: 120 });
  expect(bob.calls.get('setVisible')?.at(-1)).toEqual([false]);
});

it('H6 mixed 119 impact + 1 bark reset은 logical actor와 Bob identity를 그대로 재사용한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const bobIdentities = new Set(fake.bobs.map(({ object }) => object));
  const seedMixed = (): readonly number[] => {
    for (let index = 0; index < 119; index += 1) {
      expect(effects.showProjectileImpact(index, 'net', { x: 270, y: 518 })).toBe(true);
    }
    expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
    return effects.effectSnapshots().map(({ actorId }) => actorId);
  };
  const firstActorIds = seedMixed();

  expect(fake.graphics).toHaveLength(1);
  expect(effects.snapshot()).toMatchObject({ created: 120, active: 120, available: 0 });

  effects.releaseAll();

  expect(effects.snapshot()).toMatchObject({ created: 120, active: 0, available: 120 });
  expect(fake.bobs.every((bob) => bob.calls.get('setVisible')?.at(-1)?.[0] !== true)).toBe(true);
  expect(fake.graphics[0]!.calls.get('setVisible')?.at(-1)).toEqual([false]);

  expect(seedMixed()).toEqual(firstActorIds);
  expect(new Set(fake.bobs.map(({ object }) => object))).toEqual(bobIdentities);
  expect(fake.graphics).toHaveLength(1);
});

it('projectile/bark/aqua/safety가 created 120인 한 shared pool만 사용한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);

  expect(effects.showProjectileImpact(7, 'poop', { x: 270, y: 518 })).toBe(true);
  expect(effects.showBarkWave({ x: 10, y: 20 }, { x: 100, y: 20 })).toBe(true);
  expect(effects.startAquaBeam('aqua:1', { x: 10, y: 20 }, { targetId: 2, position: { x: 200, y: 20 } })).toBe(true);
  expect(effects.startSafetyReport('safety:1', { x: 270, y: 650 }, [
    { targetId: 4, position: { x: 270, y: 500 } },
  ])).toBe(1);

  expect(effects.snapshot()).toMatchObject({ created: 120, active: 4, available: 116 });
  expect(new Set(effects.effectSnapshots().map(({ type }) => type))).toEqual(new Set([
    'projectileImpact',
    'bark',
    'aquaBeam',
    'safetyNotice',
  ]));
  expect(fake.graphics).toHaveLength(2);
  expect(fake.sprites).toEqual([]);
  expect(fake.blitters).toHaveLength(1);
  expect(fake.bobs).toHaveLength(120);
});

it('전역 cap 이후 effect는 allocation/crash 없이 drop하고 reset 뒤 같은 actor identity를 재사용한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const accepted = Array.from({ length: 120 }, (_, index) => (
    effects.showBarkWave({ x: 0, y: 0 }, { x: index + 1, y: 0 })
  ));

  expect(accepted.every(Boolean)).toBe(true);
  expect(effects.startAquaBeam('overflow', { x: 0, y: 0 }, { targetId: 1, position: { x: 1, y: 0 } })).toBe(false);
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

it('stress workload는 120개 in-bounds impact의 정상 frame/geometry path와 같은 slot을 유지한다', () => {
  const fake = createEffectScene();
  const effects = new E2eCombatEffectPool(fake.scene as never);
  effects.seedEffects(120);
  const initialPool = effects.snapshot();
  const initialImpacts = effects.projectileImpactSnapshots();

  expect(initialImpacts).toHaveLength(120);
  expect(initialImpacts.every(({ x, y }) => x >= 0 && x <= 540 && y >= 0 && y <= 960)).toBe(true);
  expect(new Set(initialImpacts.map(({ frame }) => frame)).size).toBeGreaterThan(1);
  expect(fake.graphics).toEqual([]);
  expect(fake.sprites).toEqual([]);
  expect(fake.bobs.every(({ calls }) => {
    const frame = calls.get('setFrame')?.at(-1)?.[0];
    return frame === undefined || /^impact-poop-[0-3]$/.test(String(frame));
  })).toBe(true);

  for (let tick = 0; tick < 12; tick += 1) {
    effects.step(FIXED_STEP_MS);
    effects.maintainEffects(120);
  }

  expect(effects.snapshot()).toEqual(initialPool);
  expect(new Set(effects.projectileImpactSnapshots().map(({ x, y }) => `${x}:${y}`)).size)
    .toBe(120);
  expect(fake.graphics.reduce(
    (count, { calls }) => count + (calls.get('fillEllipse')?.length ?? 0),
    0,
  )).toBe(0);
});

it('stress refill은 total active가 아니라 impactActive 목표를 채우고 성공 수를 반환한다', () => {
  const effects = new E2eCombatEffectPool(createEffectScene().scene as never);
  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);

  expect(effects.maintainEffects(2)).toBe(2);
  expect(effects.snapshot()).toMatchObject({ active: 3, available: 117 });
  expect(effects.workloadCounters()).toMatchObject({
    impactActive: 2,
    graphicsVisible: 1,
    activations: 3,
  });

  effects.step(120);
  expect(effects.workloadCounters().impactActive).toBe(0);
  expect(effects.maintainEffects(2)).toBe(2);
  expect(effects.workloadCounters().impactActive).toBe(2);

  expect(effects.seedEffects(3)).toBe(3);
  expect(effects.snapshot()).toMatchObject({ active: 3, available: 117 });
  expect(effects.workloadCounters().impactActive).toBe(3);
});

it('stress refill은 mixed cap에서 실제 성공한 impact 수만 반환한다', () => {
  const effects = new E2eCombatEffectPool(createEffectScene().scene as never);
  for (let index = 0; index < 119; index += 1) {
    expect(effects.showBarkWave({ x: 0, y: 0 }, { x: index + 1, y: 0 })).toBe(true);
  }

  expect(effects.maintainEffects(2)).toBe(1);

  expect(effects.snapshot()).toMatchObject({ active: 120, available: 0 });
  expect(effects.workloadCounters()).toMatchObject({
    impactActive: 1,
    graphicsVisible: 119,
    activations: 120,
    rejected: 1,
  });
});

it('releaseType impact는 impact gauge만 내리고 non-impact Graphics를 보존한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  expect(effects.showProjectileImpact(1, 'poop', { x: 270, y: 518 })).toBe(true);
  expect(effects.showProjectileImpact(2, 'poop', { x: -1, y: -1 })).toBe(true);
  expect(effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);

  effects.releaseType('projectileImpact');

  expect(effects.workloadCounters()).toMatchObject({
    impactActive: 0,
    renderEligibleBobs: 0,
    graphicsVisible: 1,
    activations: 3,
    releases: 2,
  });
  expect(effects.snapshot()).toMatchObject({ active: 1, available: 119 });
});

it('impact Bob은 baked phase frame, alpha, 56px center offset을 정확히 적용한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);

  effects.showProjectileImpact(7, 'net', { x: 270, y: 518 });
  const bob = fake.bobs.at(-1)!;

  expect(impactShapeFrame('net', 0)).toBe('impact-net-0');
  expect(bob.calls.get('setFrame')?.at(-1)).toEqual(['impact-net-0']);
  expect(bob.calls.get('setPosition')?.at(-1)).toEqual([242, 490]);
  expect(bob.calls.get('setAlpha')?.at(-1)).toEqual([0.85]);
  expect(bob.calls.get('setVisible')?.at(-1)).toEqual([true]);
  expect(bob.calls.get('setScale')).toBeUndefined();
  expect(fake.blitters[0]!.calls.get('setDepth')).toEqual([[1001]]);
  expect(fake.graphics).toEqual([]);
  expect(fake.sprites).toEqual([]);

  effects.step(30);

  expect(bob.calls.get('setFrame')?.at(-1)).toEqual(['impact-net-1']);
  expect(bob.calls.get('setAlpha')?.at(-1)).toEqual([0.65]);
  effects.step(30);
  expect(bob.calls.get('setFrame')?.at(-1)).toEqual(['impact-net-2']);
  expect(bob.calls.get('setAlpha')?.at(-1)).toEqual([0.4]);
  effects.step(30);
  expect(bob.calls.get('setFrame')?.at(-1)).toEqual(['impact-net-3']);
  expect(bob.calls.get('setAlpha')?.at(-1)).toEqual([0.2]);
  expect(bob.calls.get('setFrame')).toHaveLength(4);
});

it('impact Bob은 같은 age/phase에서 변경 없는 state를 다시 적용하지 않는다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  effects.showProjectileImpact(7, 'net', { x: 270, y: 518 });
  const bob = fake.bobs.at(-1)!;
  const bobSetters = [
    'setFrame',
    'setPosition',
    'setAlpha',
    'setVisible',
  ] as const;
  const bobCounts = bobSetters.map((method) => callCount(bob, method));

  effects.step(0);

  expect(bobSetters.map((method) => callCount(bob, method))).toEqual(bobCounts);
  expect(fake.graphics).toEqual([]);
});

it('impact 뒤 같은 actor는 같은 shared Bob을 safety 신고 frame으로 재사용한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  effects.showProjectileImpact(5, 'electric', { x: 270, y: 518 });
  const bob = fake.bobs.at(-1)!;
  effects.releaseType('projectileImpact');

  effects.startSafetyReport('safety:reuse', { x: 270, y: 650 }, [
    { targetId: 1, position: { x: 270, y: 500 } },
  ]);

  expect(fake.graphics).toEqual([]);
  expect(fake.sprites).toEqual([]);
  expect(bob.calls.get('setFrame')?.at(-1)).toEqual(['safety-report']);
  expect(bob.calls.get('setVisible')?.at(-1)).toEqual([true]);
  const stateCounts = ['setFrame', 'setPosition', 'setAlpha', 'setVisible']
    .map((method) => callCount(bob, method));
  effects.step(0);
  expect(['setFrame', 'setPosition', 'setAlpha', 'setVisible'].map((method) => callCount(bob, method)))
    .toEqual(stateCounts);

  effects.releaseType('safetyNotice');
  expect(bob.calls.get('setFrame')?.at(-1)).toEqual(['impact-poop-0']);
  bob.calls.clear();
  effects.showProjectileImpact(6, 'poop', { x: 270, y: 518 });

  expect(fake.graphics).toEqual([]);
  expect(bob.calls.get('setFrame')).toBeUndefined();
  expect(bob.calls.get('setVisible')?.at(-1)).toEqual([true]);
  const bobVisibilityCount = callCount(bob, 'setVisible');
  effects.step(0);
  expect(callCount(bob, 'setVisible')).toBe(bobVisibilityCount);
});

it('safety notice→stamp는 같은 actor와 같은 Bob에서 위치만 전환한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const target = { targetId: 1, position: { x: 270, y: 500 } };
  effects.startSafetyReport('safety:mode', { x: 270, y: 650 }, [target]);
  const actorId = effects.effectSnapshots()[0]!.actorId;
  const bob = fake.bobs[actorId]!;
  bob.calls.clear();

  expect(effects.showSafetyImpact('safety:mode', [target])).toBe(1);

  expect(effects.effectSnapshots()).toEqual([
    expect.objectContaining({ actorId, type: 'safetyStamp' }),
  ]);
  expect(fake.graphics).toEqual([]);
  expect(fake.sprites).toEqual([]);
  expect(bob.calls.get('setPosition')).toEqual([[230, 347]]);
  expect(bob.calls.get('setFrame')).toBeUndefined();
  expect(bob.calls.get('setVisible')).toBeUndefined();
  effects.step(0);
  expect(bob.calls.get('setPosition')).toEqual([[230, 347]]);
});

it('safety transition render 실패는 모든 notice와 clock을 복구해 재시도할 수 있다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const targets = [
    { targetId: 1, position: { x: 200, y: 500 } },
    { targetId: 2, position: { x: 340, y: 500 } },
  ];
  expect(effects.startSafetyReport('safety:transition-rollback', { x: 270, y: 650 }, targets))
    .toBe(2);
  effects.step(100);
  const transitionError = new Error('fake safety stamp render failed');
  const secondActorId = effects.effectSnapshots()[1]!.actorId;
  fake.bobs[secondActorId]!.failNext('setPosition', 1, [transitionError]);

  let thrown: unknown;
  try {
    effects.showSafetyImpact('safety:transition-rollback', targets);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBe(transitionError);

  expect(effects.effectSnapshots().map(({ targetId, type, ageMs }) => ({ targetId, type, ageMs })))
    .toEqual([
      { targetId: 1, type: 'safetyNotice', ageMs: 100 },
      { targetId: 2, type: 'safetyNotice', ageMs: 100 },
    ]);
  expect(effects.activeSafetyClockCount()).toBe(1);
  expect(effects.snapshot()).toMatchObject({ active: 2, available: 118 });
  expect(effects.workloadCounters().renderEligibleBobs).toBe(2);

  expect(effects.showSafetyImpact('safety:transition-rollback', targets)).toBe(2);
  expect(effects.effectSnapshots().map(({ type, ageMs }) => ({ type, ageMs }))).toEqual([
    { type: 'safetyStamp', ageMs: 0 },
    { type: 'safetyStamp', ageMs: 0 },
  ]);
  expect(effects.activeSafetyClockCount()).toBe(0);
});

it('unmatched release 실패는 성공한 safety stamp와 clock commit을 되돌리지 않는다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const targets = [
    { targetId: 1, position: { x: 100, y: 300 } },
    { targetId: 2, position: { x: 200, y: 300 } },
    { targetId: 3, position: { x: 300, y: 300 } },
  ];
  const liveTarget = { targetId: 1, position: { x: 110, y: 310 } };
  expect(effects.startSafetyReport(
    'safety:unmatched-release',
    { x: 270, y: 650 },
    targets,
  )).toBe(3);
  const stampActorId = effects.effectSnapshots()[0]!.actorId;
  const releaseError = new Error('fake unmatched release failed');
  const unmatchedActorId = effects.effectSnapshots()[2]!.actorId;
  fake.bobs[unmatchedActorId]!.failNext('setPosition', 1, [releaseError]);

  let thrown: unknown;
  try {
    effects.showSafetyImpact('safety:unmatched-release', [liveTarget]);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(releaseError);
  expect(effects.effectSnapshots()).toEqual([
    {
      actorId: stampActorId,
      type: 'safetyStamp',
      ageMs: 0,
      castId: 'safety:unmatched-release',
      targetId: 1,
      position: { x: 110, y: 310 },
    },
  ]);
  expect(effects.snapshot()).toMatchObject({ active: 1, available: 119 });
  expect(effects.activeSafetyClockCount()).toBe(0);
  expect(effects.workloadCounters()).toMatchObject({
    graphicsVisible: 0,
    renderEligibleBobs: 1,
    activations: 3,
    releases: 2,
  });
  expect(effects.showSafetyImpact('safety:unmatched-release', [liveTarget])).toBe(0);
});

it.each([
  ['poop', 'impact-poop-0'],
  ['net', 'impact-net-0'],
  ['electric', 'impact-electric-0'],
] as const)('%s impact uses its exact shared-atlas frame', (kind, expectedFrame) => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);

  effects.showProjectileImpact(9, kind, { x: 270, y: 518 });

  expect(impactShapeFrame(kind, 0)).toBe(expectedFrame);
  const bobFrame = fake.bobs.at(-1)!.calls.get('setFrame')?.at(-1)?.[0]
    ?? fake.blitters[0]!.calls.get('create')?.at(-1)?.[2];
  expect(bobFrame).toBe(expectedFrame);
});

it('safety notice는 종이 Graphics 없이 적 라벨 위에 주황색 신고 frame을 표시한다', () => {
  const fake = createEffectScene();
  const effects = new CombatEffectPool(fake.scene as never);
  effects.showProjectileImpact(5, 'electric', { x: 270, y: 518 });
  const bob = fake.bobs.at(-1)!;
  effects.releaseType('projectileImpact');

  effects.startSafetyReport('safety:reuse', { x: 270, y: 650 }, [
    { targetId: 1, position: { x: 270, y: 500 } },
  ]);

  expect(fake.sprites).toEqual([]);
  expect(fake.graphics).toEqual([]);
  expect(bob.calls.get('setFrame')?.at(-1)).toEqual(['safety-report']);
  expect(bob.calls.get('setPosition')?.at(-1)).toEqual([230, 317]);
  expect(bob.calls.get('setVisible')?.at(-1)).toEqual([true]);
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

it('bark wave는 정확히 120도이다', () => {
  expect(BARK_WAVE_CONE_DEGREES).toBe(120);
});

it('aqua는 600ms 동안 한 번만 retarget하고 impact에서 splash한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  effects.startAquaBeam('aqua:1', { x: 10, y: 20 }, { targetId: 1, position: { x: 50, y: 20 } });

  expect(effects.retargetAquaBeam('aqua:1', { targetId: 2, position: { x: 70, y: 40 } })).toBe(true);
  expect(effects.retargetAquaBeam('aqua:1', { targetId: 3, position: { x: 90, y: 60 } })).toBe(false);
  expect(effects.showAquaImpact('aqua:1', [{ targetId: 2, position: { x: 70, y: 40 } }])).toBe(1);
  expect(effects.effectSnapshots()).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'aquaBeam', castId: 'aqua:1', retargetCount: 1, target: { x: 70, y: 40 } }),
    expect.objectContaining({ type: 'aquaSplash', castId: 'aqua:1' }),
  ]));

  effects.step(599);
  expect(effects.effectSnapshots().some(({ type }) => type === 'aquaBeam')).toBe(true);
  effects.step(1);
  expect(effects.effectSnapshots().some(({ type }) => type === 'aquaBeam')).toBe(false);
});

it.each([
  ['exact 300ms', SAFETY_REPORT_DURATION_MS],
  ['one fixed-step overshoot', SAFETY_REPORT_DURATION_MS + FIXED_STEP_MS],
] as const)('safety는 GameScene의 step→impact %s 순서에서 같은 actor를 notice→stamp로 전환한다', (
  _boundary,
  elapsedMs,
) => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  const initialPool = effects.snapshot();
  const startedTargets = [
    { targetId: 1, position: { x: 10, y: 20 } },
    { targetId: 2, position: { x: 30, y: 40 } },
    { targetId: 3, position: { x: 50, y: 60 } },
  ];
  const liveTargets = [
    { targetId: 1, position: { x: 12, y: 22 } },
    { targetId: 2, position: { x: 34, y: 44 } },
  ];
  expect(effects.startSafetyReport('safety:1', { x: 0, y: 0 }, startedTargets)).toBe(3);
  const noticeIds = new Map(effects.effectSnapshots().map(({ targetId, actorId }) => [targetId, actorId]));

  effects.step(elapsedMs);
  expect(effects.showSafetyImpact('safety:1', liveTargets)).toBe(2);

  const stamps = effects.effectSnapshots().filter(({ castId }) => castId === 'safety:1');
  expect(stamps).toEqual([
    expect.objectContaining({
      actorId: noticeIds.get(1),
      targetId: 1,
      type: 'safetyStamp',
      position: { x: 12, y: 22 },
      ageMs: 0,
    }),
    expect.objectContaining({
      actorId: noticeIds.get(2),
      targetId: 2,
      type: 'safetyStamp',
      position: { x: 34, y: 44 },
      ageMs: 0,
    }),
  ]);
  expect(stamps.some(({ targetId }) => targetId === 3)).toBe(false);
  expect(effects.snapshot()).toMatchObject({
    instanceId: initialPool.instanceId,
    created: 120,
    active: 2,
    available: 118,
  });
  expect(effects.activeSafetyClockCount()).toBe(0);
  const transitioned = effects.effectSnapshots();
  expect(effects.showSafetyImpact('safety:1', liveTargets)).toBe(0);
  expect(effects.effectSnapshots()).toEqual(transitioned);

  effects.step(SAFETY_REPORT_DURATION_MS - 1);
  expect(effects.effectSnapshots().map(({ ageMs, type }) => ({ ageMs, type }))).toEqual([
    { ageMs: SAFETY_REPORT_DURATION_MS - 1, type: 'safetyStamp' },
    { ageMs: SAFETY_REPORT_DURATION_MS - 1, type: 'safetyStamp' },
  ]);
  effects.step(1);
  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.snapshot()).toEqual(initialPool);
});

it('safety impact는 global cap이 가득 차도 새 stamp actor를 만들지 않는다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  const targets = [
    { targetId: 1, position: { x: 10, y: 20 } },
    { targetId: 2, position: { x: 30, y: 40 } },
  ];
  effects.startSafetyReport('safety:cap', { x: 0, y: 0 }, targets);
  const noticeIds = effects.effectSnapshots().map(({ actorId }) => actorId);
  for (let index = 0; index < 118; index += 1) {
    expect(effects.showBreederWarning(`warning:${index}`, { x: index, y: 100 })).toBe(true);
  }
  expect(effects.snapshot()).toMatchObject({ created: 120, active: 120, available: 0 });

  effects.step(SAFETY_REPORT_DURATION_MS);
  expect(effects.showSafetyImpact('safety:cap', targets)).toBe(2);

  const stamps = effects.effectSnapshots().filter(({ castId }) => castId === 'safety:cap');
  expect(stamps.map(({ actorId }) => actorId)).toEqual(noticeIds);
  expect(stamps.every(({ type, ageMs }) => type === 'safetyStamp' && ageMs === 0)).toBe(true);
  expect(effects.snapshot()).toMatchObject({ created: 120, active: 120, available: 0 });
});

it('safety impact가 오지 않으면 bounded grace 뒤 notice와 cast clock을 모두 반환한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  const initialPool = effects.snapshot();
  effects.startSafetyReport('safety:missing', { x: 0, y: 0 }, [
    { targetId: 1, position: { x: 10, y: 20 } },
    { targetId: 2, position: { x: 30, y: 40 } },
  ]);

  effects.step(SAFETY_REPORT_DURATION_MS + FIXED_STEP_MS * 2);

  expect(effects.effectSnapshots()).toEqual([]);
  expect(effects.activeSafetyClockCount()).toBe(0);
  expect(effects.snapshot()).toEqual(initialPool);
});

it('enemy attack readable VFX와 snack fly는 공용 pool을 사용한다', () => {
  const effects = new CombatEffectPool(createEffectScene().scene as never);
  effects.showDoorPush('offleash:1', { x: 10, y: 20 }, { x: 270, y: 480 });
  effects.showBreederWarning('breeder:1', { x: 50, y: 60 });
  effects.showElectricWave('electric:1', { x: 270, y: 480 });
  effects.showSnackFly('reward:1', { x: 100, y: 120 }, { x: 30, y: 900 });

  expect(effects.effectSnapshots().map(({ type }) => type)).toEqual([
    'doorPush', 'breederWarning', 'electricWave', 'snackFly',
  ]);
});

it('같은 step의 body action은 tail > aqua > bark 우선순위만 선택한다', () => {
  expect(selectHuchuBodyAction([
    { type: 'barkImpact', castId: 'bark:1', origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, targetIds: [] },
    { type: 'skillImpact', castId: 'aqua:1', skillId: 'aquaBeam', origin: { x: 0, y: 0 }, targets: [] },
    { type: 'skillImpact', castId: 'tail:1', skillId: 'tailSwipe', origin: { x: 0, y: 0 }, targets: [] },
  ])).toBe('tailSwipe');
});

it('퇴역 skill visual 문자열은 production source에 남지 않는다', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(
    new URL('../../src/game/combat/CombatEffectPool.ts', import.meta.url), 'utf8',
  ));

  expect(source).not.toContain('scold');
  expect(source).not.toContain('deokbaeHowl');
});

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
  'invalid effect step %s는 state 변경 전에 fail-fast한다',
  (stepMs) => {
    const effects = new CombatEffectPool(createEffectScene().scene as never);
    effects.showBarkWave({ x: 0, y: 0 }, { x: 1, y: 0 });
    const before = effects.effectSnapshots();

    expect(() => effects.step(stepMs)).toThrow(RangeError);
    expect(effects.effectSnapshots()).toEqual(before);
  },
);

interface FakeObject {
  readonly object: object;
  readonly calls: Map<string, unknown[][]>;
  readonly failNext: (method: string, times?: number, errors?: readonly Error[]) => void;
  listenerCount: number;
}

interface FakeFailure {
  readonly method: string;
  readonly error: Error;
  readonly times?: number;
  readonly errors?: readonly Error[];
}

interface EffectSceneOptions {
  readonly failBobNumber?: number;
  readonly beforeGraphicsCreation?: (
    creationNumber: number,
    existing: readonly FakeObject[],
  ) => void;
}

function createEffectScene(options: EffectSceneOptions = {}): {
  readonly scene: object;
  readonly graphics: FakeObject[];
  readonly sprites: FakeObject[];
  readonly blitters: FakeObject[];
  readonly bobs: FakeObject[];
  readonly blitterAdds: unknown[][];
  readonly failGraphicsDepthOn: (futureCreationNumber: number) => void;
  readonly failGraphicsOn: (
    futureCreationNumber: number,
    method: string,
    times?: number,
    errors?: readonly Error[],
  ) => void;
} {
  const graphics: FakeObject[] = [];
  const sprites: FakeObject[] = [];
  const blitters: FakeObject[] = [];
  const bobs: FakeObject[] = [];
  const blitterAdds: unknown[][] = [];
  let graphicsFailure: {
    countdown: number;
    readonly method: string;
    readonly times: number;
    readonly errors?: readonly Error[];
  } | undefined;
  const create = (
    collection: FakeObject[],
    failure?: FakeFailure,
  ): object => {
    const fake = createFakeObject(failure);
    collection.push(fake);
    return fake.object;
  };
  const createBlitter = (): object => {
    const fake = createFakeBlitter(bobs, options.failBobNumber);
    blitters.push(fake);
    return fake.object;
  };
  return {
    scene: {
      add: {
        graphics: () => {
          options.beforeGraphicsCreation?.(graphics.length + 1, graphics);
          let failure: FakeFailure | undefined;
          if (graphicsFailure !== undefined) {
            graphicsFailure.countdown -= 1;
            if (graphicsFailure.countdown === 0) {
              const { method, times, errors } = graphicsFailure;
              graphicsFailure = undefined;
              failure = {
                method,
                error: new Error(`fake Graphics ${method} failed`),
                times,
                errors,
              };
            }
          }
          return create(graphics, failure);
        },
        sprite: () => create(sprites),
        blitter: (...args: unknown[]) => {
          blitterAdds.push(args);
          return createBlitter();
        },
      },
    },
    graphics,
    sprites,
    blitters,
    bobs,
    blitterAdds,
    failGraphicsDepthOn: (futureCreationNumber) => {
      graphicsFailure = {
        countdown: futureCreationNumber,
        method: 'setDepth',
        times: 1,
      };
    },
    failGraphicsOn: (futureCreationNumber, method, times = 1, errors) => {
      graphicsFailure = { countdown: futureCreationNumber, method, times, errors };
    },
  };
}

function createFakeObject(
  failure?: FakeFailure,
): FakeObject {
  const calls = new Map<string, unknown[][]>();
  let injectedFailure: {
    readonly method: string;
    remaining: number;
    readonly errors?: readonly Error[];
    errorIndex: number;
  } | undefined;
  const fake: FakeObject = {
    object: {},
    calls,
    listenerCount: 0,
    failNext: (method, times = 1, errors) => {
      injectedFailure = { method, remaining: times, errors, errorIndex: 0 };
    },
  };
  let remainingFailures = failure?.times ?? 1;
  let failureIndex = 0;
  const object = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const name = String(property);
      const history = calls.get(name) ?? [];
      history.push(args);
      calls.set(name, history);
      if (injectedFailure?.method === name && injectedFailure.remaining > 0) {
        injectedFailure.remaining -= 1;
        const error = injectedFailure.errors?.[injectedFailure.errorIndex]
          ?? new Error(`fake Graphics ${name} failed`);
        injectedFailure.errorIndex += 1;
        throw error;
      }
      if (remainingFailures > 0 && failure?.method === name) {
        remainingFailures -= 1;
        const error = failure.errors?.[failureIndex] ?? failure.error;
        failureIndex += 1;
        throw error;
      }
      if (name === 'removeAllListeners') fake.listenerCount = 0;
      return object;
    },
  });
  Object.defineProperty(fake, 'object', { value: object });
  return fake;
}

function createFakeBlitter(bobs: FakeObject[], failBobNumber?: number): FakeObject {
  const calls = new Map<string, unknown[][]>();
  const fake: FakeObject = {
    object: {},
    calls,
    listenerCount: 0,
    failNext: () => undefined,
  };
  let createCount = 0;
  const object = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const name = String(property);
      const history = calls.get(name) ?? [];
      history.push(args);
      calls.set(name, history);
      if (name === 'create') {
        createCount += 1;
        if (createCount === failBobNumber) {
          throw new Error(`fake Bob ${createCount} creation failed`);
        }
        const bob = createFakeObject();
        bobs.push(bob);
        return bob.object;
      }
      return object;
    },
  });
  Object.defineProperty(fake, 'object', { value: object });
  return fake;
}

function callCount(fake: FakeObject, method: string): number {
  return fake.calls.get(method)?.length ?? 0;
}
