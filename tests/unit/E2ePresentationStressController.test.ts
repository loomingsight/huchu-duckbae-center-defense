import { expect, it, vi } from 'vitest';
import type { DamageAppliedEvent } from '../../src/game/combat/CombatTypes';
import { E2ePresentationStressController } from '../../src/game/debug/E2ePresentationStressController';
import {
  DAMAGE_WORKLOAD_TOPOLOGY,
  EFFECT_WORKLOAD_TOPOLOGY,
  PROJECTILE_WORKLOAD_TOPOLOGY,
  type DamageWorkloadCounters,
  type EffectWorkloadCounters,
  type ProjectileLogicalWorkloadCounters,
  type ProjectileViewWorkloadCounters,
} from '../../src/game/presentation/PresentationWorkloadTelemetry';

it('start/arm/reset은 generation을 보존하고 stable live counters를 한 번만 캡처한다', () => {
  const h = createHarness();
  const controller = createController(h);

  expect(h.effects.workloadCounters).toHaveBeenCalledOnce();
  expect(h.damageNumbers.workloadCounters).toHaveBeenCalledOnce();
  expect(controller.snapshot()).toBeNull();

  controller.start();
  expect(controller.snapshot()).toMatchObject({
    generation: 1,
    armed: false,
    observedFixedSteps: 0,
    effects: { refillAccepted: 0 },
    projectiles: { seedAccepted: 0, refillAccepted: 0 },
    damageNumbers: { refillCycles: 1, refillAccepted: 64 },
  });

  seedProjectiles(h, 80);
  controller.arm();
  expect(controller.snapshot()).toEqual({
    generation: 1,
    armed: true,
    observedFixedSteps: 0,
    effects: {
      topology: EFFECT_WORKLOAD_TOPOLOGY,
      poolInstanceId: 11,
      allocatedRoots: 1,
      allocatedChildren: 120,
      graphicsAllocated: 0,
      graphicsVisible: 0,
      active: 120,
      visible: 120,
      minActive: 120,
      minVisible: 120,
      stepPasses: 0,
      activeActorVisits: 0,
      visibleDrawableVisits: 0,
      refillAccepted: 0,
      stateVersion: 0,
    },
    projectiles: {
      topology: PROJECTILE_WORKLOAD_TOPOLOGY,
      logicalPoolInstanceId: 13,
      viewPoolInstanceId: 14,
      allocatedRoots: 80,
      allocatedChildren: 0,
      active: 80,
      visible: 80,
      minActive: 80,
      minVisible: 80,
      logicalStepPasses: 0,
      logicalActorVisits: 0,
      renderPasses: 0,
      visibleRootVisits: 0,
      seedAccepted: 80,
      refillAccepted: 0,
      stateVersion: 0,
    },
    damageNumbers: {
      topology: DAMAGE_WORKLOAD_TOPOLOGY,
      poolInstanceId: 12,
      allocatedRoots: 64,
      allocatedChildren: 0,
      active: 64,
      visible: 64,
      minActive: 64,
      minVisible: 64,
      stepPasses: 0,
      activeActorVisits: 0,
      visibleDrawableVisits: 0,
      refillCycles: 1,
      refillAccepted: 64,
      stateVersion: 0,
    },
  });

  controller.reset();
  expect(controller.snapshot()).toBeNull();
  controller.start();
  expect(controller.snapshot()?.generation).toBe(2);
  expect(h.effects.workloadCounters).toHaveBeenCalledOnce();
  expect(h.damageNumbers.workloadCounters).toHaveBeenCalledOnce();
});

it('한 fixed/render pass에서만 target 아래였어도 min은 복구 뒤까지 sticky하다', () => {
  const h = createHarness({ effectMaintainAccepted: [0] });
  const controller = createController(h);
  controller.start();
  seedProjectiles(h, 80);
  controller.arm();

  Object.assign(h.effectCounters, {
    impactActive: 117,
    renderEligibleBobs: 116,
    stepPasses: h.effectCounters.stepPasses + 1,
    activeActorVisits: h.effectCounters.activeActorVisits + 117,
    visibleDrawableVisits: h.effectCounters.visibleDrawableVisits + 116,
    stateVersion: h.effectCounters.stateVersion + 1,
  });
  Object.assign(h.projectileLogicalCounters, {
    active: 80,
    logicalStepPasses: h.projectileLogicalCounters.logicalStepPasses + 1,
    logicalActorVisits: h.projectileLogicalCounters.logicalActorVisits + 78,
    activations: h.projectileLogicalCounters.activations + 2,
  });
  Object.assign(h.damageCounters, {
    active: 62,
    renderEligibleTexts: 61,
    stepPasses: h.damageCounters.stepPasses + 1,
    activeActorVisits: h.damageCounters.activeActorVisits + 62,
    visibleDrawableVisits: h.damageCounters.visibleDrawableVisits + 61,
    stateVersion: h.damageCounters.stateVersion + 1,
  });
  controller.step(0, 2);

  Object.assign(h.projectileViewCounters, {
    active: 80,
    visibleRoots: 77,
    visibleLeaves: 77,
    renderPasses: h.projectileViewCounters.renderPasses + 1,
    requestedVisits: h.projectileViewCounters.requestedVisits + 80,
    visibleRootVisits: h.projectileViewCounters.visibleRootVisits + 77,
    stateVersion: h.projectileViewCounters.stateVersion + 1,
  });
  controller.observeProjectileRender();

  Object.assign(h.effectCounters, {
    impactActive: 120,
    renderEligibleBobs: 120,
    stepPasses: h.effectCounters.stepPasses + 1,
    activeActorVisits: h.effectCounters.activeActorVisits + 120,
    visibleDrawableVisits: h.effectCounters.visibleDrawableVisits + 120,
    stateVersion: h.effectCounters.stateVersion + 1,
  });
  Object.assign(h.projectileLogicalCounters, {
    active: 80,
    logicalStepPasses: h.projectileLogicalCounters.logicalStepPasses + 1,
    logicalActorVisits: h.projectileLogicalCounters.logicalActorVisits + 80,
  });
  Object.assign(h.damageCounters, {
    active: 64,
    renderEligibleTexts: 64,
    stepPasses: h.damageCounters.stepPasses + 1,
    activeActorVisits: h.damageCounters.activeActorVisits + 64,
    visibleDrawableVisits: h.damageCounters.visibleDrawableVisits + 64,
    stateVersion: h.damageCounters.stateVersion + 1,
  });
  controller.step(0);
  Object.assign(h.projectileViewCounters, {
    visibleRoots: 80,
    visibleLeaves: 80,
    renderPasses: h.projectileViewCounters.renderPasses + 1,
    requestedVisits: h.projectileViewCounters.requestedVisits + 80,
    visibleRootVisits: h.projectileViewCounters.visibleRootVisits + 80,
    stateVersion: h.projectileViewCounters.stateVersion + 1,
  });
  controller.observeProjectileRender();

  expect(controller.snapshot()).toMatchObject({
    observedFixedSteps: 2,
    effects: {
      minActive: 117,
      minVisible: 116,
      stepPasses: 2,
      activeActorVisits: 237,
      visibleDrawableVisits: 236,
      stateVersion: 2,
    },
    projectiles: {
      minActive: 78,
      minVisible: 77,
      logicalStepPasses: 2,
      logicalActorVisits: 158,
      renderPasses: 2,
      visibleRootVisits: 157,
      refillAccepted: 2,
      stateVersion: 2,
    },
    damageNumbers: {
      minActive: 62,
      minVisible: 61,
      stepPasses: 2,
      activeActorVisits: 126,
      visibleDrawableVisits: 125,
      stateVersion: 2,
    },
  });
});

it('fixed-step minimum은 effect refill까지 끝난 transaction 경계에서 기록한다', () => {
  const h = createHarness({ effectMaintainAccepted: [4] });
  const controller = createController(h);
  controller.start();
  seedProjectiles(h, 80);
  controller.arm();

  h.effectCounters.impactActive = 116;
  h.effectCounters.renderEligibleBobs = 116;
  controller.step(0);

  expect(controller.snapshot()?.effects).toMatchObject({
    active: 120,
    visible: 120,
    minActive: 120,
    minVisible: 120,
    refillAccepted: 4,
  });
});

it('effect snapshot은 impact/Bob gauge를 Graphics gauge와 섞지 않는다', () => {
  const h = createHarness();
  const controller = createController(h);
  controller.start();
  seedProjectiles(h, 80);
  Object.assign(h.effectCounters, {
    impactActive: 119,
    renderEligibleBobs: 118,
    graphicsVisible: 1,
  });
  controller.arm();

  expect(controller.snapshot()?.effects).toMatchObject({
    active: 119,
    visible: 118,
    graphicsVisible: 1,
    minActive: 119,
    minVisible: 118,
  });
});

it('projectile refill은 80까지 수락하고 범위 밖 입력은 snapshot을 변경하지 않는다', () => {
  const h = createHarness();
  const controller = createController(h);
  controller.start();
  seedProjectiles(h, 80);
  controller.arm();

  controller.step(0, 80);
  expect(controller.snapshot()?.projectiles).toMatchObject({
    minActive: 0,
    refillAccepted: 80,
  });
  const beforeRejectedInputs = controller.snapshot();

  for (const invalid of [81, -1, 1.5, Number.NaN]) {
    expect(() => controller.step(0, invalid)).toThrow(
      'Projectile refill accepted count must be an integer from 0 to 80',
    );
    expect(controller.snapshot()).toEqual(beforeRejectedInputs);
  }
});

it('producer가 실제 수락한 seed/refill만 generation lane에 합산한다', () => {
  const h = createHarness({
    effectSeedAccepted: 119,
    effectMaintainAccepted: [3],
    damageAcceptedPerCycle: [60, 61],
  });
  const controller = createController(h);

  controller.start();
  seedProjectiles(h, 79);
  controller.arm();
  h.effectCounters.impactActive = 116;
  h.effectCounters.renderEligibleBobs = 116;
  h.projectileLogicalCounters.activations += 2;
  h.projectileLogicalCounters.active = 80;
  controller.step(250, 2);

  expect(h.effects.seedEffects).toHaveBeenCalledWith(120);
  expect(h.effects.maintainEffects).toHaveBeenCalledWith(120);
  expect(h.damageNumbers.show).toHaveBeenCalledTimes(128);
  expect(controller.snapshot()).toMatchObject({
    effects: { refillAccepted: 3 },
    projectiles: { seedAccepted: 79, refillAccepted: 2 },
    damageNumbers: { refillCycles: 2, refillAccepted: 121 },
  });
});

it('60Hz fixed steps는 부동소수 누적 오차 없이 exact 250ms damage refill을 수행한다', () => {
  const h = createHarness();
  const controller = createController(h);
  controller.start();
  seedProjectiles(h, 80);
  controller.arm();

  for (let tick = 0; tick < 15; tick += 1) controller.step(1000 / 60);
  expect(controller.snapshot()?.damageNumbers).toMatchObject({
    refillCycles: 2,
    refillAccepted: 128,
  });

  for (let tick = 15; tick < 1_800; tick += 1) controller.step(1000 / 60);
  expect(controller.snapshot()?.damageNumbers).toMatchObject({
    refillCycles: 121,
    refillAccepted: 7_744,
  });
});

it('재시작 generation은 누적 producer counters를 새 baseline으로 rebase한다', () => {
  const h = createHarness();
  const controller = createController(h);
  controller.start();
  seedProjectiles(h, 80);
  controller.arm();

  Object.assign(h.effectCounters, {
    stepPasses: 7,
    activeActorVisits: 840,
    visibleDrawableVisits: 840,
    stateVersion: h.effectCounters.stateVersion + 7,
  });
  Object.assign(h.projectileLogicalCounters, {
    logicalStepPasses: 7,
    logicalActorVisits: 560,
  });
  Object.assign(h.projectileViewCounters, {
    renderPasses: 5,
    visibleRootVisits: 400,
    stateVersion: h.projectileViewCounters.stateVersion + 5,
  });
  Object.assign(h.damageCounters, {
    stepPasses: 7,
    activeActorVisits: 448,
    visibleDrawableVisits: 448,
    stateVersion: h.damageCounters.stateVersion + 7,
  });

  controller.reset();
  Object.assign(h.projectileLogicalCounters, { active: 0 });
  Object.assign(h.projectileViewCounters, {
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
  });
  controller.start();
  seedProjectiles(h, 80);
  controller.arm();

  expect(controller.snapshot()).toMatchObject({
    generation: 2,
    observedFixedSteps: 0,
    effects: {
      minActive: 120,
      minVisible: 120,
      stepPasses: 0,
      activeActorVisits: 0,
      visibleDrawableVisits: 0,
      refillAccepted: 0,
      stateVersion: 0,
    },
    projectiles: {
      minActive: 80,
      minVisible: 80,
      logicalStepPasses: 0,
      logicalActorVisits: 0,
      renderPasses: 0,
      visibleRootVisits: 0,
      seedAccepted: 80,
      refillAccepted: 0,
      stateVersion: 0,
    },
    damageNumbers: {
      minActive: 64,
      minVisible: 64,
      stepPasses: 0,
      activeActorVisits: 0,
      visibleDrawableVisits: 0,
      refillCycles: 1,
      refillAccepted: 64,
      stateVersion: 0,
    },
  });
});

it('generation 중 누적 workload counter 역행을 정상 delta 0으로 숨기지 않는다', () => {
  const h = createHarness();
  const controller = createController(h);
  controller.start();
  seedProjectiles(h, 80);
  h.effectCounters.stepPasses = 5;
  h.projectileViewCounters.renderPasses = 5;
  controller.arm();

  h.effectCounters.stepPasses = 4;
  expect(() => controller.snapshot()).toThrow(RangeError);

  h.effectCounters.stepPasses = 5;
  h.projectileViewCounters.renderPasses = 4;
  expect(() => controller.observeProjectileRender()).toThrow(RangeError);
});

it('producer가 live counters를 변경한 뒤 실패하면 stress를 reset하고 원 오류를 보존한다', () => {
  const h = createHarness();
  const controller = createController(h);
  h.effects.seedEffects.mockReturnValueOnce(121);

  expect(() => controller.start()).toThrow('Effect seed accepted count');
  expect(controller.snapshot()).toBeNull();

  controller.start();
  seedProjectiles(h, 80);
  controller.arm();
  expect(controller.snapshot()?.generation).toBe(1);
  const producerFailure = new Error('Effect producer failed after partial mutation');
  h.effects.maintainEffects.mockImplementationOnce(() => {
    h.effectCounters.impactActive = 119;
    h.effectCounters.renderEligibleBobs = 119;
    h.effectCounters.activations += 1;
    h.effectCounters.stateVersion += 1;
    throw producerFailure;
  });

  expect(() => controller.step(250, 2)).toThrow(producerFailure);
  expect(controller.snapshot()).toBeNull();
  expect(h.damageNumbers.reset).toHaveBeenCalledTimes(4);
  expect(h.effects.releaseAll).toHaveBeenCalledTimes(4);

  h.effects.releaseAll.mockImplementationOnce(() => {
    throw new Error('Effect cleanup failed');
  });
  expect(() => controller.reset()).toThrow('Effect cleanup failed');
  expect(controller.snapshot()).toBeNull();
});

it('start producer가 일부 live 상태를 만든 뒤 실패해도 producer를 정리한다', () => {
  const h = createHarness();
  const controller = createController(h);
  const producerFailure = new Error('Effect seed failed after partial mutation');
  h.effects.seedEffects.mockImplementationOnce(() => {
    h.effectCounters.impactActive = 37;
    h.effectCounters.renderEligibleBobs = 37;
    h.effectCounters.activations += 37;
    h.effectCounters.stateVersion += 1;
    throw producerFailure;
  });

  expect(() => controller.start()).toThrow(producerFailure);
  expect(controller.snapshot()).toBeNull();
  expect(h.damageNumbers.reset).toHaveBeenCalledTimes(2);
  expect(h.effects.releaseAll).toHaveBeenCalledTimes(2);
  expect(h.effectCounters).toMatchObject({
    impactActive: 0,
    renderEligibleBobs: 0,
  });
  expect(h.damageCounters).toMatchObject({
    active: 0,
    renderEligibleTexts: 0,
  });
});

it('초기 damage refill이 일부 수락 뒤 실패해도 effect와 damage를 함께 정리한다', () => {
  const h = createHarness();
  const controller = createController(h);
  const producerFailure = new Error('Damage seed failed after partial mutation');
  let accepted = 0;
  h.damageNumbers.show.mockImplementation(() => {
    if (accepted === 5) throw producerFailure;
    accepted += 1;
    h.damageCounters.activations += 1;
    h.damageCounters.active += 1;
    h.damageCounters.renderEligibleTexts += 1;
    h.damageCounters.stateVersion += 1;
    return true;
  });

  expect(() => controller.start()).toThrow(producerFailure);
  expect(controller.snapshot()).toBeNull();
  expect(h.effects.releaseAll).toHaveBeenCalledTimes(2);
  expect(h.damageNumbers.reset).toHaveBeenCalledTimes(2);
  expect(h.effectCounters).toMatchObject({ impactActive: 0, renderEligibleBobs: 0 });
  expect(h.damageCounters).toMatchObject({ active: 0, renderEligibleTexts: 0 });
});

interface HarnessOptions {
  readonly effectSeedAccepted?: number;
  readonly effectMaintainAccepted?: readonly number[];
  readonly damageAcceptedPerCycle?: readonly number[];
}

function createHarness(options: HarnessOptions = {}) {
  const effectCounters: EffectWorkloadCounters = {
    topology: EFFECT_WORKLOAD_TOPOLOGY,
    poolInstanceId: 11,
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
  };
  const damageCounters: DamageWorkloadCounters = {
    topology: DAMAGE_WORKLOAD_TOPOLOGY,
    poolInstanceId: 12,
    allocatedRoots: 64,
    allocatedChildren: 0,
    active: 0,
    renderEligibleTexts: 0,
    stepPasses: 0,
    activeActorVisits: 0,
    visibleDrawableVisits: 0,
    stateVersion: 0,
    activations: 0,
    merges: 0,
    evictions: 0,
    expirations: 0,
    rejected: 0,
  };
  const projectileLogicalCounters: ProjectileLogicalWorkloadCounters = {
    poolInstanceId: 13,
    active: 0,
    logicalStepPasses: 0,
    logicalActorVisits: 0,
    activations: 0,
    releases: 0,
    rejected: 0,
  };
  const projectileViewCounters: ProjectileViewWorkloadCounters = {
    topology: PROJECTILE_WORKLOAD_TOPOLOGY,
    poolInstanceId: 14,
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
  };
  const effectMaintainAccepted = [...(options.effectMaintainAccepted ?? [])];
  let damageAttempt = 0;
  const damageAcceptedPerCycle = options.damageAcceptedPerCycle ?? [64];
  const effects = {
    seedEffects: vi.fn((requested: number) => {
      const accepted = Math.min(requested, options.effectSeedAccepted ?? requested);
      effectCounters.activations += accepted;
      effectCounters.impactActive = accepted;
      effectCounters.renderEligibleBobs = accepted;
      effectCounters.stateVersion += 1;
      return accepted;
    }),
    maintainEffects: vi.fn((requested: number) => {
      const missing = Math.max(0, requested - effectCounters.impactActive);
      const accepted = Math.min(missing, effectMaintainAccepted.shift() ?? missing);
      effectCounters.activations += accepted;
      effectCounters.impactActive += accepted;
      effectCounters.renderEligibleBobs += accepted;
      if (accepted > 0) effectCounters.stateVersion += 1;
      return accepted;
    }),
    releaseAll: vi.fn(() => {
      effectCounters.releases += effectCounters.impactActive;
      effectCounters.impactActive = 0;
      effectCounters.renderEligibleBobs = 0;
      effectCounters.graphicsVisible = 0;
      effectCounters.stateVersion += 1;
    }),
    workloadCounters: vi.fn(() => effectCounters as Readonly<EffectWorkloadCounters>),
  };
  const damageNumbers = {
    show: vi.fn((_event: DamageAppliedEvent) => {
      const cycle = Math.floor(damageAttempt / 64);
      const acceptedInCycle = damageAcceptedPerCycle[cycle] ?? damageAcceptedPerCycle.at(-1) ?? 0;
      const accepted = damageAttempt % 64 < acceptedInCycle;
      damageAttempt += 1;
      if (!accepted) {
        damageCounters.rejected += 1;
        return false;
      }
      damageCounters.activations += 1;
      damageCounters.active = Math.min(64, damageCounters.active + 1);
      damageCounters.renderEligibleTexts = damageCounters.active;
      damageCounters.stateVersion += 1;
      return true;
    }),
    reset: vi.fn(() => {
      damageCounters.active = 0;
      damageCounters.renderEligibleTexts = 0;
      damageCounters.stateVersion += 1;
    }),
    workloadCounters: vi.fn(() => damageCounters as Readonly<DamageWorkloadCounters>),
  };
  return {
    damageCounters,
    damageNumbers,
    effectCounters,
    effects,
    projectileLogicalCounters,
    projectileViewCounters,
  };
}

function createController(h: ReturnType<typeof createHarness>): E2ePresentationStressController {
  return new E2ePresentationStressController({
    damageNumbers: h.damageNumbers,
    effects: h.effects,
    projectileLogic: h.projectileLogicalCounters,
    projectileView: h.projectileViewCounters,
  });
}

function seedProjectiles(h: ReturnType<typeof createHarness>, accepted: number): void {
  h.projectileLogicalCounters.activations += accepted;
  h.projectileLogicalCounters.active = accepted;
  h.projectileViewCounters.activations += accepted;
  h.projectileViewCounters.active = accepted;
  h.projectileViewCounters.visibleRoots = accepted;
  h.projectileViewCounters.visibleLeaves = accepted;
}
