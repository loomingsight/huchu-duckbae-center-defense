import type { DamageAppliedEvent } from '../combat/CombatTypes';
import { reachedDuration } from '../constants';
import {
  DAMAGE_WORKLOAD_TOPOLOGY,
  EFFECT_WORKLOAD_TOPOLOGY,
  PROJECTILE_WORKLOAD_TOPOLOGY,
  type DamageWorkloadCounters,
  type EffectWorkloadCounters,
  type ProjectileLogicalWorkloadCounters,
  type ProjectileViewWorkloadCounters,
} from '../presentation/PresentationWorkloadTelemetry';

const DAMAGE_COUNT = 64;
const EFFECT_COUNT = 120;
const PROJECTILE_COUNT = 80;
const REFILL_MS = 250;

interface DamageProducer {
  show(event: DamageAppliedEvent): boolean;
  reset(): void;
  workloadCounters(): Readonly<DamageWorkloadCounters>;
}

interface EffectProducer {
  seedEffects(count: number): number;
  maintainEffects(count: number): number;
  releaseAll(): void;
  workloadCounters(): Readonly<EffectWorkloadCounters>;
}

export interface E2ePresentationStressPorts {
  readonly damageNumbers: DamageProducer;
  readonly effects: EffectProducer;
  readonly projectileLogic: Readonly<ProjectileLogicalWorkloadCounters>;
  readonly projectileView: Readonly<ProjectileViewWorkloadCounters>;
}

export interface E2ePresentationStressSnapshot {
  readonly generation: number;
  readonly armed: boolean;
  readonly observedFixedSteps: number;
  readonly effects: {
    readonly topology: typeof EFFECT_WORKLOAD_TOPOLOGY;
    readonly poolInstanceId: number;
    readonly allocatedRoots: number;
    readonly allocatedChildren: number;
    readonly graphicsAllocated: number;
    readonly graphicsVisible: number;
    readonly active: number;
    readonly visible: number;
    readonly minActive: number;
    readonly minVisible: number;
    readonly stepPasses: number;
    readonly activeActorVisits: number;
    readonly visibleDrawableVisits: number;
    readonly refillAccepted: number;
    readonly stateVersion: number;
  };
  readonly projectiles: {
    readonly topology: typeof PROJECTILE_WORKLOAD_TOPOLOGY;
    readonly logicalPoolInstanceId: number;
    readonly viewPoolInstanceId: number;
    readonly allocatedRoots: number;
    readonly allocatedChildren: number;
    readonly active: number;
    readonly visible: number;
    readonly minActive: number;
    readonly minVisible: number;
    readonly logicalStepPasses: number;
    readonly logicalActorVisits: number;
    readonly renderPasses: number;
    readonly visibleRootVisits: number;
    readonly seedAccepted: number;
    readonly refillAccepted: number;
    readonly stateVersion: number;
  };
  readonly damageNumbers: {
    readonly topology: typeof DAMAGE_WORKLOAD_TOPOLOGY;
    readonly poolInstanceId: number;
    readonly allocatedRoots: number;
    readonly allocatedChildren: number;
    readonly active: number;
    readonly visible: number;
    readonly minActive: number;
    readonly minVisible: number;
    readonly stepPasses: number;
    readonly activeActorVisits: number;
    readonly visibleDrawableVisits: number;
    readonly refillCycles: number;
    readonly refillAccepted: number;
    readonly stateVersion: number;
  };
}

interface CounterBaselines {
  readonly effectStepPasses: number;
  readonly effectActiveActorVisits: number;
  readonly effectVisibleDrawableVisits: number;
  readonly effectStateVersion: number;
  readonly projectileLogicalStepPasses: number;
  readonly projectileLogicalActorVisits: number;
  readonly projectileRenderPasses: number;
  readonly projectileVisibleRootVisits: number;
  readonly projectileStateVersion: number;
  readonly damageStepPasses: number;
  readonly damageActiveActorVisits: number;
  readonly damageVisibleDrawableVisits: number;
  readonly damageStateVersion: number;
}

const EMPTY_BASELINES: CounterBaselines = {
  effectStepPasses: 0,
  effectActiveActorVisits: 0,
  effectVisibleDrawableVisits: 0,
  effectStateVersion: 0,
  projectileLogicalStepPasses: 0,
  projectileLogicalActorVisits: 0,
  projectileRenderPasses: 0,
  projectileVisibleRootVisits: 0,
  projectileStateVersion: 0,
  damageStepPasses: 0,
  damageActiveActorVisits: 0,
  damageVisibleDrawableVisits: 0,
  damageStateVersion: 0,
};

export class E2ePresentationStressController {
  private readonly damageCounters: Readonly<DamageWorkloadCounters>;
  private readonly effectCounters: Readonly<EffectWorkloadCounters>;
  private generation = 0;
  private elapsedMs = 0;
  private castSequence = 0;
  private active = false;
  private armed = false;
  private observedFixedSteps = 0;
  private effectMinActive = 0;
  private effectMinVisible = 0;
  private effectRefillAccepted = 0;
  private projectileMinActive = 0;
  private projectileMinVisible = 0;
  private projectileSeedAccepted = 0;
  private projectileRefillAccepted = 0;
  private projectileSeedActivationBaseline = 0;
  private lastObservedProjectileRenderPass = 0;
  private damageMinActive = 0;
  private damageMinVisible = 0;
  private damageRefillCycles = 0;
  private damageRefillAccepted = 0;
  private baselines = EMPTY_BASELINES;

  constructor(private readonly ports: E2ePresentationStressPorts) {
    this.damageCounters = ports.damageNumbers.workloadCounters();
    this.effectCounters = ports.effects.workloadCounters();
  }

  start(): void {
    this.active = false;
    this.armed = false;
    const nextGeneration = this.generation + 1;
    this.resetProducers();
    let damageRefillAccepted = 0;
    try {
      assertAcceptedCount(this.ports.effects.seedEffects(EFFECT_COUNT), EFFECT_COUNT, 'Effect seed');
      damageRefillAccepted = this.produceDamageRefill(nextGeneration, this.castSequence);
    } catch (error) {
      this.failClosedAfterProducerError(error);
    }

    this.generation = nextGeneration;
    this.castSequence += 1;
    this.observedFixedSteps = 0;
    this.effectMinActive = 0;
    this.effectMinVisible = 0;
    this.effectRefillAccepted = 0;
    this.projectileMinActive = 0;
    this.projectileMinVisible = 0;
    this.projectileSeedAccepted = 0;
    this.projectileRefillAccepted = 0;
    this.projectileSeedActivationBaseline = this.ports.projectileLogic.activations;
    this.lastObservedProjectileRenderPass = this.ports.projectileView.renderPasses;
    this.damageMinActive = 0;
    this.damageMinVisible = 0;
    this.damageRefillCycles = 1;
    this.damageRefillAccepted = damageRefillAccepted;
    this.baselines = EMPTY_BASELINES;
    this.active = true;
  }

  arm(): void {
    if (!this.active) throw new Error('Presentation stress must be started before it is armed');
    if (this.armed) return;
    this.projectileSeedAccepted = assertAcceptedCount(
      counterDelta(
        this.ports.projectileLogic.activations,
        this.projectileSeedActivationBaseline,
      ),
      PROJECTILE_COUNT,
      'Projectile seed',
    );
    this.baselines = this.captureBaselines();
    this.lastObservedProjectileRenderPass = this.ports.projectileView.renderPasses;
    this.effectMinActive = this.effectCounters.impactActive;
    this.effectMinVisible = this.effectCounters.renderEligibleBobs;
    this.projectileMinActive = this.ports.projectileLogic.active;
    this.projectileMinVisible = this.ports.projectileView.visibleRoots;
    this.damageMinActive = this.damageCounters.active;
    this.damageMinVisible = this.damageCounters.renderEligibleTexts;
    this.armed = true;
  }

  step(stepMs: number, projectileRefillAccepted = 0): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Presentation stress step must be finite and non-negative');
    }
    assertAcceptedCount(projectileRefillAccepted, PROJECTILE_COUNT, 'Projectile refill');
    if (!this.active || !this.armed) return;

    try {
      const effectRefillAccepted = assertAcceptedCount(
        this.ports.effects.maintainEffects(EFFECT_COUNT),
        EFFECT_COUNT,
        'Effect refill',
      );
      let nextElapsedMs = this.elapsedMs + stepMs;
      let nextCastSequence = this.castSequence;
      let damageRefillCycles = 0;
      let damageRefillAccepted = 0;
      while (reachedDuration(nextElapsedMs, REFILL_MS)) {
        nextElapsedMs = Math.max(0, nextElapsedMs - REFILL_MS);
        damageRefillAccepted += this.produceDamageRefill(
          this.generation,
          nextCastSequence,
        );
        nextCastSequence += 1;
        damageRefillCycles += 1;
      }

      this.observedFixedSteps += 1;
      this.projectileRefillAccepted += projectileRefillAccepted;
      this.effectRefillAccepted += effectRefillAccepted;
      this.damageRefillCycles += damageRefillCycles;
      this.damageRefillAccepted += damageRefillAccepted;
      this.elapsedMs = nextElapsedMs;
      this.castSequence = nextCastSequence;
      this.recordFixedStepMinimums(Math.max(
        0,
        this.ports.projectileLogic.active - projectileRefillAccepted,
      ));
    } catch (error) {
      this.failClosedAfterProducerError(error);
    }
  }

  observeProjectileRender(): void {
    if (!this.active || !this.armed) return;
    const renderPasses = this.ports.projectileView.renderPasses;
    if (renderPasses < this.lastObservedProjectileRenderPass) {
      throw new RangeError('Projectile render pass counter regressed');
    }
    if (renderPasses === this.lastObservedProjectileRenderPass) return;
    this.lastObservedProjectileRenderPass = renderPasses;
    this.recordProjectileRenderMinimum();
  }

  reset(): void {
    this.active = false;
    this.armed = false;
    this.resetProducers();
  }

  snapshot(): E2ePresentationStressSnapshot | null {
    if (!this.active) return null;
    const effect = this.effectCounters;
    const projectileLogic = this.ports.projectileLogic;
    const projectileView = this.ports.projectileView;
    const damage = this.damageCounters;
    const baselines = this.baselines;
    return {
      generation: this.generation,
      armed: this.armed,
      observedFixedSteps: this.observedFixedSteps,
      effects: {
        topology: effect.topology,
        poolInstanceId: effect.poolInstanceId,
        allocatedRoots: effect.allocatedRoots,
        allocatedChildren: effect.allocatedChildren,
        graphicsAllocated: effect.graphicsAllocated,
        graphicsVisible: effect.graphicsVisible,
        active: effect.impactActive,
        visible: effect.renderEligibleBobs,
        minActive: this.effectMinActive,
        minVisible: this.effectMinVisible,
        stepPasses: this.metricDelta(effect.stepPasses, baselines.effectStepPasses),
        activeActorVisits: this.metricDelta(
          effect.activeActorVisits,
          baselines.effectActiveActorVisits,
        ),
        visibleDrawableVisits: this.metricDelta(
          effect.visibleDrawableVisits,
          baselines.effectVisibleDrawableVisits,
        ),
        refillAccepted: this.effectRefillAccepted,
        stateVersion: this.metricDelta(effect.stateVersion, baselines.effectStateVersion),
      },
      projectiles: {
        topology: projectileView.topology,
        logicalPoolInstanceId: projectileLogic.poolInstanceId,
        viewPoolInstanceId: projectileView.poolInstanceId,
        allocatedRoots: projectileView.allocatedRoots,
        allocatedChildren: projectileView.allocatedChildren,
        active: projectileLogic.active,
        visible: projectileView.visibleRoots,
        minActive: this.projectileMinActive,
        minVisible: this.projectileMinVisible,
        logicalStepPasses: this.metricDelta(
          projectileLogic.logicalStepPasses,
          baselines.projectileLogicalStepPasses,
        ),
        logicalActorVisits: this.metricDelta(
          projectileLogic.logicalActorVisits,
          baselines.projectileLogicalActorVisits,
        ),
        renderPasses: this.metricDelta(
          projectileView.renderPasses,
          baselines.projectileRenderPasses,
        ),
        visibleRootVisits: this.metricDelta(
          projectileView.visibleRootVisits,
          baselines.projectileVisibleRootVisits,
        ),
        seedAccepted: this.projectileSeedAccepted,
        refillAccepted: this.projectileRefillAccepted,
        stateVersion: this.metricDelta(
          projectileView.stateVersion,
          baselines.projectileStateVersion,
        ),
      },
      damageNumbers: {
        topology: damage.topology,
        poolInstanceId: damage.poolInstanceId,
        allocatedRoots: damage.allocatedRoots,
        allocatedChildren: damage.allocatedChildren,
        active: damage.active,
        visible: damage.renderEligibleTexts,
        minActive: this.damageMinActive,
        minVisible: this.damageMinVisible,
        stepPasses: this.metricDelta(damage.stepPasses, baselines.damageStepPasses),
        activeActorVisits: this.metricDelta(
          damage.activeActorVisits,
          baselines.damageActiveActorVisits,
        ),
        visibleDrawableVisits: this.metricDelta(
          damage.visibleDrawableVisits,
          baselines.damageVisibleDrawableVisits,
        ),
        refillCycles: this.damageRefillCycles,
        refillAccepted: this.damageRefillAccepted,
        stateVersion: this.metricDelta(damage.stateVersion, baselines.damageStateVersion),
      },
    };
  }

  private metricDelta(current: number, baseline: number): number {
    return this.armed ? counterDelta(current, baseline) : 0;
  }

  private captureBaselines(): CounterBaselines {
    return {
      effectStepPasses: this.effectCounters.stepPasses,
      effectActiveActorVisits: this.effectCounters.activeActorVisits,
      effectVisibleDrawableVisits: this.effectCounters.visibleDrawableVisits,
      effectStateVersion: this.effectCounters.stateVersion,
      projectileLogicalStepPasses: this.ports.projectileLogic.logicalStepPasses,
      projectileLogicalActorVisits: this.ports.projectileLogic.logicalActorVisits,
      projectileRenderPasses: this.ports.projectileView.renderPasses,
      projectileVisibleRootVisits: this.ports.projectileView.visibleRootVisits,
      projectileStateVersion: this.ports.projectileView.stateVersion,
      damageStepPasses: this.damageCounters.stepPasses,
      damageActiveActorVisits: this.damageCounters.activeActorVisits,
      damageVisibleDrawableVisits: this.damageCounters.visibleDrawableVisits,
      damageStateVersion: this.damageCounters.stateVersion,
    };
  }

  private recordFixedStepMinimums(projectileActive = this.ports.projectileLogic.active): void {
    this.effectMinActive = Math.min(this.effectMinActive, this.effectCounters.impactActive);
    this.effectMinVisible = Math.min(
      this.effectMinVisible,
      this.effectCounters.renderEligibleBobs,
    );
    this.projectileMinActive = Math.min(
      this.projectileMinActive,
      projectileActive,
    );
    this.damageMinActive = Math.min(this.damageMinActive, this.damageCounters.active);
    this.damageMinVisible = Math.min(
      this.damageMinVisible,
      this.damageCounters.renderEligibleTexts,
    );
  }

  private recordProjectileRenderMinimum(): void {
    this.projectileMinVisible = Math.min(
      this.projectileMinVisible,
      this.ports.projectileView.visibleRoots,
    );
  }

  private produceDamageRefill(generation: number, cast: number): number {
    let accepted = 0;
    for (let index = 0; index < DAMAGE_COUNT; index += 1) {
      if (this.ports.damageNumbers.show({
        type: 'damageApplied',
        castId: `e2e-damage:${generation}:${cast}:${index}`,
        appliedAtStep: cast + 1,
        targetId: cast * DAMAGE_COUNT + index,
        amount: 1,
        effectiveAmount: 1,
        position: { x: 30 + index % 8 * 64, y: 100 + Math.floor(index / 8) * 80 },
        impactDirection: { x: 0, y: -1 },
        source: 'bark',
        strength: 'light',
        lethal: false,
      })) accepted += 1;
    }
    return accepted;
  }

  private resetProducers(): void {
    this.elapsedMs = 0;
    let failed = false;
    let failure: unknown;
    try {
      this.ports.damageNumbers.reset();
    } catch (error) {
      failed = true;
      failure = error;
    }
    try {
      this.ports.effects.releaseAll();
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    }
    if (failed) throw failure;
  }

  private failClosedAfterProducerError(error: unknown): never {
    this.active = false;
    this.armed = false;
    try {
      this.resetProducers();
    } catch {
      // The producer failure is the root cause; cleanup is best-effort here.
    }
    throw error;
  }
}

function counterDelta(current: number, baseline: number): number {
  if (current < baseline) throw new RangeError('Workload counter regressed below its generation baseline');
  return current - baseline;
}

function assertAcceptedCount(value: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${label} accepted count must be an integer from 0 to ${maximum}`);
  }
  return value;
}
