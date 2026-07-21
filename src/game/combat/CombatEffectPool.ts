import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import {
  IMPACT_SHAPE_FRAME_SIZE,
  IMPACT_SHAPE_PHASES,
  SAFETY_REPORT_FRAME,
  SAFETY_REPORT_FRAME_HEIGHT,
  SAFETY_REPORT_FRAME_WIDTH,
  impactShapeFrame,
  type CombatShapeFrame,
  type ImpactShapePhase,
} from '../assets/CombatShapeAtlas';
import {
  FIXED_STEP_MS,
  reachedDuration,
  TIME_EPSILON_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../constants';
import { BALANCE } from '../data/balance';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import {
  EFFECT_WORKLOAD_TOPOLOGY,
  type EffectWorkloadCounters,
} from '../presentation/PresentationWorkloadTelemetry';
import type { SkillTargetSnapshot } from '../skills/SkillTypes';
import type { Point } from '../world/Geometry';
import { BARK_CONE_DEGREES, BARK_RANGE_LOGICAL } from './BarkRules';
import type { ProjectileKind } from './ProjectileSystem';

export const BARK_WAVE_DURATION_MS = 180;
export const BARK_WAVE_CONE_DEGREES = BARK_CONE_DEGREES;
export const AQUA_BEAM_DURATION_MS = 600;
export const SAFETY_REPORT_DURATION_MS = 300;
export const TAIL_EFFECT_DURATION_MS = 500;
export const TAIL_EFFECT_VISUAL_SCALE = 2.5;

const BARK_WAVE_START_RADIUS = 26;
const BARK_WAVE_END_RADIUS = BARK_RANGE_LOGICAL;
const IMPACT_FADE_MS = 120;
const IMPACT_FRAME_MS = IMPACT_FADE_MS / 4;
const AQUA_SPLASH_DURATION_MS = 180;
const DOOR_PUSH_DURATION_MS = 120;
const BREEDER_WARNING_DURATION_MS = 500;
const ELECTRIC_WAVE_DURATION_MS = 180;
const SNACK_FLY_DURATION_MS = 350;
const SAFETY_IMPACT_GRACE_MS = FIXED_STEP_MS + TIME_EPSILON_MS * 2;
const SAFETY_LABEL_OFFSET_Y = 125;
const SAFETY_LABEL_ENTRANCE_TRAVEL_Y = 30;
const IMPACT_ALPHA_BY_PHASE = [0.85, 0.65, 0.4, 0.2] as const;
const IMPACT_BOB_OFFSET = -IMPACT_SHAPE_FRAME_SIZE / 2;
const DEFAULT_IMPACT_FRAME = impactShapeFrame('poop', 0);

class MutableEffectWorkloadCounters implements EffectWorkloadCounters {
  readonly topology = EFFECT_WORKLOAD_TOPOLOGY;
  poolInstanceId = 0;
  allocatedRoots = 0;
  allocatedChildren = 0;
  impactActive = 0;
  renderEligibleBobs = 0;
  graphicsAllocated = 0;
  graphicsVisible = 0;
  stepPasses = 0;
  activeActorVisits = 0;
  visibleDrawableVisits = 0;
  stateVersion = 0;
  activations = 0;
  releases = 0;
  rejected = 0;
}

export type CombatEffectType =
  | 'projectileImpact'
  | 'bark'
  | 'tailArc'
  | 'tailDust'
  | 'aquaBeam'
  | 'aquaSplash'
  | 'safetyNotice'
  | 'safetyStamp'
  | 'doorPush'
  | 'breederWarning'
  | 'electricWave'
  | 'snackFly';

export interface ProjectileImpactSnapshot {
  readonly projectileId: number;
  readonly kind: ProjectileKind;
  readonly x: number;
  readonly y: number;
  readonly frame: number;
}

export interface CombatEffectSnapshot {
  readonly actorId: number;
  readonly type: CombatEffectType;
  readonly ageMs: number;
  readonly castId?: string;
  readonly projectileId?: number;
  readonly projectileKind?: ProjectileKind;
  readonly position?: Point;
  readonly origin?: Point;
  readonly target?: Point;
  readonly targetId?: number;
  readonly retargetCount?: number;
}

export interface BarkWaveVisual {
  readonly alpha: number;
  readonly radius: number;
  readonly rotation: number;
  readonly arcStart: number;
  readonly arcEnd: number;
}

export type EffectPayload =
  | {
    readonly type: 'projectileImpact';
    readonly projectileId: number;
    readonly projectileKind: ProjectileKind;
    readonly position: Point;
  }
  | { readonly type: 'bark'; readonly origin: Point; readonly target: Point }
  | { readonly type: 'tailArc' | 'tailDust'; readonly castId: string; readonly position: Point }
  | {
    readonly type: 'aquaBeam';
    readonly castId: string;
    readonly origin: Point;
    readonly targetId: number;
    readonly target: Point;
    readonly retargetCount: number;
  }
  | { readonly type: 'aquaSplash'; readonly castId: string; readonly targetId: number; readonly position: Point }
  | { readonly type: 'safetyNotice'; readonly castId: string; readonly targetId: number; readonly position: Point }
  | { readonly type: 'safetyStamp'; readonly castId: string; readonly targetId: number; readonly position: Point }
  | { readonly type: 'doorPush'; readonly castId: string; readonly origin: Point; readonly target: Point }
  | { readonly type: 'breederWarning' | 'electricWave'; readonly castId: string; readonly position: Point }
  | { readonly type: 'snackFly'; readonly castId: string; readonly origin: Point; readonly target: Point };

interface SafetyCastClock {
  ageMs: number;
}

interface SafetyTransitionCheckpoint {
  readonly payload: Extract<EffectPayload, { type: 'safetyNotice' }>;
  readonly elapsedMs: number;
}

interface CompletedSafetyTransition {
  readonly actor: CombatEffectActor;
  readonly checkpoint: SafetyTransitionCheckpoint;
}

export function projectileImpactFrameAt(elapsedMs: number): ImpactShapePhase {
  assertFiniteNonNegative(elapsedMs, 'Projectile impact elapsed time');
  const index = Math.min(3, Math.floor((elapsedMs + TIME_EPSILON_MS) / IMPACT_FRAME_MS));
  return IMPACT_SHAPE_PHASES[index]!;
}

export function barkWaveVisualAt(ageMs: number, origin: Point, target: Point): BarkWaveVisual {
  assertFiniteNonNegative(ageMs, 'Bark wave ageMs');
  assertPoint(origin, 'Bark wave origin');
  assertPoint(target, 'Bark wave target');
  const progress = Math.min(1, ageMs / BARK_WAVE_DURATION_MS);
  const halfCone = BARK_WAVE_CONE_DEGREES * Math.PI / 360;
  return {
    alpha: 1 - progress,
    radius: BARK_WAVE_START_RADIUS
      + (BARK_WAVE_END_RADIUS - BARK_WAVE_START_RADIUS) * progress,
    rotation: Math.atan2(target.y - origin.y, target.x - origin.x),
    arcStart: -halfCone,
    arcEnd: halfCone,
  };
}

export function selectHuchuBodyAction<T extends { readonly type: string; readonly skillId?: string }>(
  events: readonly T[],
): 'tailSwipe' | 'aquaBeam' | 'bark' | undefined {
  let selected: 'tailSwipe' | 'aquaBeam' | 'bark' | undefined;
  for (const event of events) {
    if (event.skillId === 'tailSwipe') return 'tailSwipe';
    if (event.skillId === 'aquaBeam') selected = 'aquaBeam';
    if (selected === undefined && (event.type === 'barkStarted' || event.type === 'barkImpact')) {
      selected = 'bark';
    }
  }
  return selected;
}

export class CombatEffectPool {
  private readonly pool: ObjectPool<CombatEffectActor>;
  private readonly active = new Set<CombatEffectActor>();
  private readonly safetyClocks = new Map<string, SafetyCastClock>();
  private readonly workload = new MutableEffectWorkloadCounters();

  constructor(scene: Phaser.Scene) {
    this.pool = createCombatEffectActors(scene, this.workload);
    this.workload.poolInstanceId = this.pool.snapshot().instanceId;
  }

  showProjectileImpact(projectileId: number, kind: ProjectileKind, position: Point): boolean {
    if (!Number.isSafeInteger(projectileId) || projectileId < 0) {
      throw new RangeError('Projectile impact id must be a non-negative safe integer');
    }
    assertPoint(position, 'Projectile impact position');
    return this.activate({
      type: 'projectileImpact',
      projectileId,
      projectileKind: kind,
      position: copyPoint(position),
    });
  }

  showBarkWave(origin: Point, target: Point): boolean {
    barkWaveVisualAt(0, origin, target);
    return this.activate({ type: 'bark', origin: copyPoint(origin), target: copyPoint(target) });
  }

  showTailImpact(castId: string, position: Point): number {
    assertCastId(castId);
    assertPoint(position, 'Tail impact position');
    if (this.pool.snapshot().available < 2) {
      this.workload.rejected += 2;
      return 0;
    }
    const arc = this.activateActor({ type: 'tailArc', castId, position: copyPoint(position) });
    if (arc === undefined) return 0;
    try {
      const dust = this.activateActor({ type: 'tailDust', castId, position: copyPoint(position) });
      if (dust !== undefined) return 2;
      this.release(arc);
      return 0;
    } catch (activationError) {
      try {
        this.release(arc);
      } catch (rollbackError) {
        throw new AggregateError(
          [activationError, rollbackError],
          'Tail effect activation and rollback both failed',
        );
      }
      throw activationError;
    }
  }

  startAquaBeam(castId: string, origin: Point, target: SkillTargetSnapshot): boolean {
    assertCastId(castId);
    assertPoint(origin, 'Aqua origin');
    assertTarget(target, 'Aqua target');
    return this.activate({
      type: 'aquaBeam',
      castId,
      origin: copyPoint(origin),
      targetId: target.targetId,
      target: copyPoint(target.position),
      retargetCount: 0,
    });
  }

  retargetAquaBeam(castId: string, target: SkillTargetSnapshot): boolean {
    assertCastId(castId);
    assertTarget(target, 'Aqua retarget');
    const beam = [...this.active].find((actor) => (
      actor.type === 'aquaBeam' && actor.castId === castId
    ));
    return beam?.retargetAqua(target) ?? false;
  }

  showAquaImpact(castId: string, targets: readonly SkillTargetSnapshot[]): number {
    return this.showTargetEffects('aquaSplash', castId, targets, 0);
  }

  startSafetyReport(
    castId: string,
    origin: Point,
    targets: readonly SkillTargetSnapshot[],
  ): number {
    assertCastId(castId);
    assertPoint(origin, 'Safety origin');
    targets.forEach((target) => assertTarget(target, 'Safety target'));
    const previousClock = this.safetyClocks.get(castId);
    try {
      const activated = this.showTargetEffects('safetyNotice', castId, targets, 0);
      if (activated > 0) this.safetyClocks.set(castId, { ageMs: 0 });
      return activated;
    } catch (error) {
      if (previousClock === undefined) this.safetyClocks.delete(castId);
      else this.safetyClocks.set(castId, previousClock);
      throw error;
    }
  }

  showSafetyImpact(castId: string, targets: readonly SkillTargetSnapshot[]): number {
    assertCastId(castId);
    const clock = this.safetyClocks.get(castId);
    if (clock === undefined) return 0;
    const targetsById = new Map<number, SkillTargetSnapshot>();
    for (const target of targets) {
      assertTarget(target, 'safetyStamp target');
      targetsById.set(target.targetId, target);
    }
    const completed: CompletedSafetyTransition[] = [];
    const unmatched: CombatEffectActor[] = [];
    try {
      for (const actor of [...this.active]) {
        if (actor.type !== 'safetyNotice' || actor.castId !== castId) continue;
        const target = actor.targetId === undefined ? undefined : targetsById.get(actor.targetId);
        if (target === undefined) {
          unmatched.push(actor);
          continue;
        }
        const checkpoint = actor.transitionSafetyStamp(target);
        if (checkpoint !== undefined) completed.push({ actor, checkpoint });
      }
    } catch (transitionError) {
      let rollbackFailed = false;
      let rollbackError: unknown;
      for (const { actor, checkpoint } of completed.reverse()) {
        try {
          actor.restoreSafetyNotice(checkpoint);
        } catch (error) {
          if (!rollbackFailed) rollbackError = error;
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        throw new AggregateError(
          [transitionError, rollbackError],
          'Safety transition and rollback both failed',
        );
      }
      throw transitionError;
    }
    try {
      this.releaseActors(unmatched.reverse());
    } finally {
      this.safetyClocks.delete(castId);
    }
    return completed.length;
  }

  showDoorPush(castId: string, origin: Point, target: Point): boolean {
    assertCastId(castId);
    assertPoint(origin, 'Door push origin');
    assertPoint(target, 'Door push target');
    return this.activate({ type: 'doorPush', castId, origin: copyPoint(origin), target: copyPoint(target) });
  }

  showBreederWarning(castId: string, position: Point): boolean {
    return this.showPositionEffect('breederWarning', castId, position);
  }

  showElectricWave(castId: string, position: Point): boolean {
    return this.showPositionEffect('electricWave', castId, position);
  }

  showSnackFly(castId: string, origin: Point, target: Point): boolean {
    assertCastId(castId);
    assertPoint(origin, 'Snack origin');
    assertPoint(target, 'Snack target');
    return this.activate({ type: 'snackFly', castId, origin: copyPoint(origin), target: copyPoint(target) });
  }

  step(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'Combat effect stepMs');
    const activeAtStart = this.active.size;
    const visibleAtStart = this.workload.renderEligibleBobs + this.workload.graphicsVisible;
    for (const clock of this.safetyClocks.values()) clock.ageMs += stepMs;
    for (const actor of [...this.active]) {
      if (actor.step(stepMs)) continue;
      this.release(actor);
    }
    for (const [castId, clock] of this.safetyClocks) {
      if (reachedDuration(
        clock.ageMs,
        SAFETY_REPORT_DURATION_MS + SAFETY_IMPACT_GRACE_MS,
      )) {
        this.safetyClocks.delete(castId);
      }
    }
    this.workload.stepPasses += 1;
    this.workload.activeActorVisits += activeAtStart;
    this.workload.visibleDrawableVisits += visibleAtStart;
  }

  releaseType(type: CombatEffectType): void {
    if (type !== 'safetyNotice') {
      this.releaseMatching(type);
      return;
    }
    const affectedCastIds = new Set<string>();
    for (const actor of this.active) {
      if (actor.type === 'safetyNotice' && actor.castId !== undefined) {
        affectedCastIds.add(actor.castId);
      }
    }
    try {
      this.releaseMatching(type);
    } finally {
      for (const castId of affectedCastIds) this.safetyClocks.delete(castId);
    }
  }

  releaseAll(): void {
    try {
      this.releaseMatching();
    } finally {
      this.safetyClocks.clear();
    }
  }

  snapshot(): PoolSnapshot {
    return this.pool.snapshot();
  }

  workloadCounters(): Readonly<EffectWorkloadCounters> {
    return this.workload;
  }

  effectSnapshots(): readonly CombatEffectSnapshot[] {
    return [...this.active].map((actor) => actor.snapshot());
  }

  projectileImpactSnapshots(): readonly ProjectileImpactSnapshot[] {
    return [...this.active]
      .filter((actor) => actor.type === 'projectileImpact')
      .map((actor) => actor.projectileImpactSnapshot())
      .sort((left, right) => left.projectileId - right.projectileId);
  }

  effectAges(type: CombatEffectType): readonly number[] {
    return [...this.active]
      .filter((actor) => actor.type === type)
      .map((actor) => actor.ageMs);
  }

  activeSafetyClockCount(): number {
    return this.safetyClocks.size;
  }

  protected activate(payload: EffectPayload, initialAgeMs = 0): boolean {
    return this.activateActor(payload, initialAgeMs) !== undefined;
  }

  private activateActor(
    payload: EffectPayload,
    initialAgeMs = 0,
  ): CombatEffectActor | undefined {
    assertFiniteNonNegative(initialAgeMs, 'Combat effect initialAgeMs');
    const actor = this.pool.acquire();
    if (actor === undefined) {
      this.workload.rejected += 1;
      return undefined;
    }
    try {
      actor.activate(payload, initialAgeMs);
      this.active.add(actor);
      this.workload.activations += 1;
      if (payload.type === 'projectileImpact') this.workload.impactActive += 1;
      return actor;
    } catch (activationError) {
      this.workload.rejected += 1;
      const rollback = this.resetForRelease(actor);
      if (rollback.safe) this.pool.release(actor);
      if (rollback.failed) {
        throw new AggregateError(
          [activationError, rollback.error],
          'Combat effect activation and rollback both failed',
        );
      }
      if (!rollback.safe) {
        throw new AggregateError(
          [activationError, new Error('Combat effect actor quarantined after activation rollback')],
          'Combat effect activation and rollback both failed',
        );
      }
      throw activationError;
    }
  }

  private showTargetEffects(
    type: Extract<CombatEffectType, 'aquaSplash' | 'safetyNotice' | 'safetyStamp'>,
    castId: string,
    targets: readonly SkillTargetSnapshot[],
    initialAgeMs: number,
  ): number {
    assertCastId(castId);
    const activatedActors: CombatEffectActor[] = [];
    try {
      for (const target of targets) {
        assertTarget(target, `${type} target`);
        const actor = this.activateActor({
          type,
          castId,
          targetId: target.targetId,
          position: copyPoint(target.position),
        }, initialAgeMs);
        if (actor !== undefined) activatedActors.push(actor);
      }
      return activatedActors.length;
    } catch (activationError) {
      try {
        this.releaseActors(activatedActors.reverse());
      } catch (rollbackError) {
        throw new AggregateError(
          [activationError, rollbackError],
          'Target effect activation and rollback both failed',
        );
      }
      throw activationError;
    }
  }

  private showPositionEffect(
    type: Extract<CombatEffectType, 'breederWarning' | 'electricWave'>,
    castId: string,
    position: Point,
  ): boolean {
    assertCastId(castId);
    assertPoint(position, `${type} position`);
    return this.activate({ type, castId, position: copyPoint(position) });
  }

  private releaseMatching(type?: CombatEffectType): void {
    this.releaseActors([...this.active].reverse(), type);
  }

  private releaseActors(
    actors: readonly CombatEffectActor[],
    type?: CombatEffectType,
  ): void {
    let firstError: unknown;
    for (const actor of actors) {
      if (type !== undefined && actor.type !== type) continue;
      try {
        this.release(actor);
      } catch (error) {
        if (firstError === undefined) firstError = error;
      }
    }
    if (firstError !== undefined) throw firstError;
  }

  private release(actor: CombatEffectActor): void {
    const type = actor.type;
    this.active.delete(actor);
    const reset = this.resetForRelease(actor);
    if (reset.safe && this.pool.release(actor)) {
      if (type === 'projectileImpact') this.workload.impactActive -= 1;
      this.workload.releases += 1;
    }
    if (reset.failed) throw reset.error;
    if (!reset.safe) throw new Error('Combat effect actor quarantined after incomplete reset');
  }

  private resetForRelease(actor: CombatEffectActor): {
    readonly failed: boolean;
    readonly error: unknown;
    readonly safe: boolean;
  } {
    let failed = false;
    let error: unknown;
    try {
      actor.reset();
    } catch (resetError) {
      failed = true;
      error = resetError;
    }
    if (failed && !actor.isResetSafeForReuse) {
      try {
        actor.reset();
      } catch (cleanupError) {
        error = new AggregateError(
          [error, cleanupError],
          'Combat effect reset and cleanup retry both failed',
        );
      }
    }
    return { failed, error, safe: actor.isResetSafeForReuse };
  }
}

function createCombatEffectActors(
  scene: Phaser.Scene,
  workload: MutableEffectWorkloadCounters,
): ObjectPool<CombatEffectActor> {
  let impactBlitter: Phaser.GameObjects.Blitter | undefined;
  try {
    impactBlitter = scene.add.blitter(0, 0, AssetKeys.combatShapes, DEFAULT_IMPACT_FRAME);
    impactBlitter.setDepth(1001);
    workload.allocatedRoots += 1;
    const bobs = Array.from({ length: BALANCE.caps.particles }, () => (
      impactBlitter!.create(0, 0, DEFAULT_IMPACT_FRAME, false)
    ));
    workload.allocatedChildren += bobs.length;
    let actorId = 0;
    return new ObjectPool(BALANCE.caps.particles, () => {
      const id = actorId;
      actorId += 1;
      return new CombatEffectActor(id, scene, bobs[id]!, workload);
    });
  } catch (error) {
    impactBlitter?.destroy();
    throw error;
  }
}

class CombatEffectActor {
  private graphicsObject: Phaser.GameObjects.Graphics | undefined;
  private graphicsDepth = 1001;
  private graphicsActive = false;
  private graphicsVisible = false;
  private bobFrame: CombatShapeFrame = DEFAULT_IMPACT_FRAME;
  private bobX = 0;
  private bobY = 0;
  private bobAlpha = 1;
  private bobVisible = false;
  private payload: EffectPayload | undefined;
  private elapsedMs = 0;

  constructor(
    readonly actorId: number,
    private readonly scene: Phaser.Scene,
    private readonly bob: Phaser.GameObjects.Bob,
    private readonly workload: MutableEffectWorkloadCounters,
  ) {}

  activate(payload: EffectPayload, initialAgeMs = 0): void {
    this.payload = copyPayload(payload);
    this.elapsedMs = initialAgeMs;
    this.render();
  }

  step(stepMs: number): boolean {
    this.elapsedMs += stepMs;
    if (reachedDuration(this.elapsedMs, this.durationMs)) return false;
    this.render();
    return true;
  }

  retargetAqua(target: SkillTargetSnapshot): boolean {
    const payload = this.requirePayload();
    if (payload.type !== 'aquaBeam' || payload.retargetCount >= 1) return false;
    this.payload = {
      ...payload,
      targetId: target.targetId,
      target: copyPoint(target.position),
      retargetCount: payload.retargetCount + 1,
    };
    this.render();
    return true;
  }

  transitionSafetyStamp(target: SkillTargetSnapshot): SafetyTransitionCheckpoint | undefined {
    const payload = this.requirePayload();
    if (payload.type !== 'safetyNotice' || payload.targetId !== target.targetId) return undefined;
    const checkpoint: SafetyTransitionCheckpoint = {
      payload: { ...payload, position: copyPoint(payload.position) },
      elapsedMs: this.elapsedMs,
    };
    this.payload = {
      type: 'safetyStamp',
      castId: payload.castId,
      targetId: payload.targetId,
      position: copyPoint(target.position),
    };
    this.elapsedMs = 0;
    try {
      this.render();
    } catch (transitionError) {
      try {
        this.restoreSafetyNotice(checkpoint);
      } catch (rollbackError) {
        throw new AggregateError(
          [transitionError, rollbackError],
          'Safety actor transition and rollback both failed',
        );
      }
      throw transitionError;
    }
    return checkpoint;
  }

  restoreSafetyNotice(checkpoint: SafetyTransitionCheckpoint): void {
    this.payload = {
      ...checkpoint.payload,
      position: copyPoint(checkpoint.payload.position),
    };
    this.elapsedMs = checkpoint.elapsedMs;
    this.render();
  }

  snapshot(): CombatEffectSnapshot {
    const payload = this.requirePayload();
    const base = { actorId: this.actorId, type: payload.type, ageMs: this.elapsedMs } as const;
    if (payload.type === 'projectileImpact') {
      return {
        ...base,
        projectileId: payload.projectileId,
        projectileKind: payload.projectileKind,
        position: copyPoint(payload.position),
      };
    }
    if (payload.type === 'bark') {
      return { ...base, origin: copyPoint(payload.origin), target: copyPoint(payload.target) };
    }
    if (payload.type === 'aquaBeam') {
      return {
        ...base,
        castId: payload.castId,
        origin: copyPoint(payload.origin),
        target: copyPoint(payload.target),
        targetId: payload.targetId,
        retargetCount: payload.retargetCount,
      };
    }
    if (payload.type === 'doorPush' || payload.type === 'snackFly') {
      return {
        ...base,
        castId: payload.castId,
        origin: copyPoint(payload.origin),
        target: copyPoint(payload.target),
      };
    }
    if (payload.type === 'aquaSplash' || payload.type === 'safetyNotice' || payload.type === 'safetyStamp') {
      return {
        ...base,
        castId: payload.castId,
        targetId: payload.targetId,
        position: copyPoint(payload.position),
      };
    }
    return { ...base, castId: payload.castId, position: copyPoint(payload.position) };
  }

  projectileImpactSnapshot(): ProjectileImpactSnapshot {
    const payload = this.requirePayload();
    if (payload.type !== 'projectileImpact') throw new Error('Combat effect is not a projectile impact');
    return {
      projectileId: payload.projectileId,
      kind: payload.projectileKind,
      x: payload.position.x,
      y: payload.position.y,
      frame: projectileImpactFrameAt(this.elapsedMs),
    };
  }

  reset(): void {
    this.payload = undefined;
    this.elapsedMs = 0;
    let resetFailed = false;
    let firstResetError: unknown;
    const attempt = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        if (!resetFailed) firstResetError = error;
        resetFailed = true;
      }
    };
    attempt(() => this.setBobFrame(DEFAULT_IMPACT_FRAME));
    attempt(() => this.setBobPosition(0, 0));
    attempt(() => this.setBobAlpha(1));
    attempt(() => this.setBobVisible(false));
    const graphics = this.graphicsObject;
    if (graphics !== undefined) {
      attempt(() => graphics.removeAllListeners());
      attempt(() => {
        graphics.clear();
        this.workload.stateVersion += 1;
      });
      attempt(() => {
        graphics.setPosition(0, 0);
        this.workload.stateVersion += 1;
      });
      attempt(() => {
        graphics.setRotation(0);
        this.workload.stateVersion += 1;
      });
      attempt(() => {
        graphics.setScale(1);
        this.workload.stateVersion += 1;
      });
      attempt(() => {
        graphics.setAlpha(1);
        this.workload.stateVersion += 1;
      });
      attempt(() => {
        graphics.setDepth(1001);
        this.graphicsDepth = 1001;
        this.workload.stateVersion += 1;
      });
      attempt(() => {
        graphics.setActive(false);
        this.graphicsActive = false;
        this.workload.stateVersion += 1;
      });
      attempt(() => {
        graphics.setVisible(false);
        if (this.graphicsVisible) this.workload.graphicsVisible -= 1;
        this.graphicsVisible = false;
        this.workload.stateVersion += 1;
      });
    }
    if (resetFailed) throw firstResetError;
  }

  get type(): CombatEffectType | undefined {
    return this.payload?.type;
  }

  get castId(): string | undefined {
    const payload = this.payload;
    return payload !== undefined && 'castId' in payload ? payload.castId : undefined;
  }

  get targetId(): number | undefined {
    const payload = this.payload;
    return payload !== undefined && 'targetId' in payload ? payload.targetId : undefined;
  }

  get ageMs(): number {
    return this.elapsedMs;
  }

  get isResetSafeForReuse(): boolean {
    return this.payload === undefined
      && !this.bobVisible
      && !this.graphicsActive
      && !this.graphicsVisible;
  }

  private get durationMs(): number {
    switch (this.requirePayload().type) {
      case 'projectileImpact': return IMPACT_FADE_MS;
      case 'bark': return BARK_WAVE_DURATION_MS;
      case 'tailArc':
      case 'tailDust': return TAIL_EFFECT_DURATION_MS;
      case 'aquaBeam': return AQUA_BEAM_DURATION_MS;
      case 'aquaSplash': return AQUA_SPLASH_DURATION_MS;
      case 'safetyNotice': return SAFETY_REPORT_DURATION_MS + SAFETY_IMPACT_GRACE_MS;
      case 'safetyStamp': return SAFETY_REPORT_DURATION_MS;
      case 'doorPush': return DOOR_PUSH_DURATION_MS;
      case 'breederWarning': return BREEDER_WARNING_DURATION_MS;
      case 'electricWave': return ELECTRIC_WAVE_DURATION_MS;
      case 'snackFly': return SNACK_FLY_DURATION_MS;
    }
  }

  private requirePayload(): EffectPayload {
    if (this.payload === undefined) throw new Error('Combat effect actor is inactive');
    return this.payload;
  }

  private render(): void {
    const payload = this.requirePayload();
    if (payload.type === 'projectileImpact') {
      this.renderProjectileImpact(payload);
      return;
    }
    if (payload.type === 'safetyNotice') {
      this.renderSafetyNotice(payload.position);
      return;
    }
    if (payload.type === 'safetyStamp') {
      this.renderSafetyStamp(payload.position);
      return;
    }
    const graphics = this.useGraphicsMode(1001);
    graphics.clear();
    switch (payload.type) {
      case 'bark': this.renderBark(payload); break;
      case 'tailArc': this.renderTailArc(payload.position); break;
      case 'tailDust': this.renderTailDust(payload.position); break;
      case 'aquaBeam': this.renderAquaBeam(payload); break;
      case 'aquaSplash': this.renderAquaSplash(payload.position); break;
      case 'doorPush': this.renderDoorPush(payload.origin, payload.target); break;
      case 'breederWarning': this.renderBreederWarning(payload.position); break;
      case 'electricWave': this.renderElectricWave(payload.position); break;
      case 'snackFly': this.renderSnackFly(payload.origin, payload.target); break;
    }
    this.workload.stateVersion += 1;
  }

  private renderProjectileImpact(payload: Extract<EffectPayload, { type: 'projectileImpact' }>): void {
    const inBounds = payload.position.x >= 0 && payload.position.x <= WORLD_WIDTH
      && payload.position.y >= 0 && payload.position.y <= WORLD_HEIGHT;
    const phase = projectileImpactFrameAt(this.elapsedMs);
    this.hideGraphics();
    this.setBobFrame(impactShapeFrame(payload.projectileKind, phase));
    this.setBobPosition(
      payload.position.x + IMPACT_BOB_OFFSET,
      payload.position.y + IMPACT_BOB_OFFSET,
    );
    this.setBobAlpha(IMPACT_ALPHA_BY_PHASE[phase]);
    this.setBobVisible(inBounds);
  }

  private renderBark(payload: Extract<EffectPayload, { type: 'bark' }>): void {
    const visual = barkWaveVisualAt(this.elapsedMs, payload.origin, payload.target);
    this.graphics
      .lineStyle(5, 0xffef9a, 1)
      .beginPath()
      .arc(0, 0, visual.radius, visual.arcStart, visual.arcEnd)
      .strokePath()
      .setPosition(payload.origin.x, payload.origin.y)
      .setRotation(visual.rotation)
      .setAlpha(visual.alpha);
  }

  private renderTailArc(position: Point): void {
    const progress = this.elapsedMs / TAIL_EFFECT_DURATION_MS;
    this.graphics.lineStyle(7, 0xffd66e, 1 - progress).strokeCircle(0, 0, 42 + progress * 18)
      .setPosition(position.x, position.y)
      .setScale(TAIL_EFFECT_VISUAL_SCALE);
  }

  private renderTailDust(position: Point): void {
    const progress = this.elapsedMs / TAIL_EFFECT_DURATION_MS;
    this.graphics.fillStyle(0xd2b178, 0.75 * (1 - progress));
    for (let index = 0; index < 6; index += 1) {
      const angle = index * Math.PI / 3;
      this.graphics.fillCircle(Math.cos(angle) * 35, Math.sin(angle) * 14, 4);
    }
    this.graphics.setPosition(position.x, position.y).setScale(TAIL_EFFECT_VISUAL_SCALE);
  }

  private renderAquaBeam(payload: Extract<EffectPayload, { type: 'aquaBeam' }>): void {
    const dx = payload.target.x - payload.origin.x;
    const dy = payload.target.y - payload.origin.y;
    const length = Math.hypot(dx, dy);
    const fade = 1 - Math.min(1, this.elapsedMs / AQUA_BEAM_DURATION_MS) * 0.35;
    this.graphics.fillStyle(0x54e4e6, 0.82 * fade).fillRoundedRect(0, -8, length, 16, 8)
      .setPosition(payload.origin.x, payload.origin.y)
      .setRotation(Math.atan2(dy, dx));
  }

  private renderAquaSplash(position: Point): void {
    const progress = this.elapsedMs / AQUA_SPLASH_DURATION_MS;
    this.graphics.lineStyle(5, 0x7ef6f2, 1 - progress).strokeCircle(0, 0, 8 + progress * 24)
      .setPosition(position.x, position.y);
  }

  private renderSafetyNotice(position: Point): void {
    const progress = Math.min(1, this.elapsedMs / SAFETY_REPORT_DURATION_MS);
    this.hideGraphics();
    this.setBobFrame(SAFETY_REPORT_FRAME);
    this.setBobPosition(
      position.x - SAFETY_REPORT_FRAME_WIDTH / 2,
      position.y
        - SAFETY_LABEL_OFFSET_Y
        - SAFETY_LABEL_ENTRANCE_TRAVEL_Y * (1 - progress)
        - SAFETY_REPORT_FRAME_HEIGHT / 2,
    );
    this.setBobAlpha(1);
    this.setBobVisible(true);
  }

  private renderSafetyStamp(position: Point): void {
    const progress = this.elapsedMs / SAFETY_REPORT_DURATION_MS;
    this.hideGraphics();
    this.setBobFrame(SAFETY_REPORT_FRAME);
    this.setBobPosition(
      position.x - SAFETY_REPORT_FRAME_WIDTH / 2,
      position.y - SAFETY_LABEL_OFFSET_Y - SAFETY_REPORT_FRAME_HEIGHT / 2,
    );
    this.setBobAlpha(1 - progress);
    this.setBobVisible(true);
  }

  private renderDoorPush(origin: Point, target: Point): void {
    const progress = this.elapsedMs / DOOR_PUSH_DURATION_MS;
    const x = origin.x + (target.x - origin.x) * progress;
    const y = origin.y + (target.y - origin.y) * progress;
    this.graphics.lineStyle(5, 0xf2ca45, 1 - progress).strokeRoundedRect(-16, -24, 32, 48, 4)
      .setPosition(x, y);
  }

  private renderBreederWarning(position: Point): void {
    const pulse = 0.45 + Math.sin(this.elapsedMs / 45) * 0.2;
    this.graphics.lineStyle(2, 0xf4d35e, pulse).strokeEllipse(0, 0, 72, 22)
      .setPosition(position.x, position.y);
  }

  private renderElectricWave(position: Point): void {
    const progress = this.elapsedMs / ELECTRIC_WAVE_DURATION_MS;
    this.graphics.lineStyle(4, 0x55f4ef, 1 - progress).strokeCircle(0, 0, 10 + progress * 32)
      .setPosition(position.x, position.y);
  }

  private renderSnackFly(origin: Point, target: Point): void {
    const progress = this.elapsedMs / SNACK_FLY_DURATION_MS;
    const eased = 1 - (1 - progress) ** 2;
    this.graphics.fillStyle(0xf3b43f, 1 - progress * 0.3).fillCircle(0, 0, 6)
      .setPosition(
        origin.x + (target.x - origin.x) * eased,
        origin.y + (target.y - origin.y) * eased - Math.sin(progress * Math.PI) * 24,
      );
  }

  private useGraphicsMode(depth: number): Phaser.GameObjects.Graphics {
    this.setBobVisible(false);
    const graphics = this.ensureGraphics();
    this.setGraphicsDepth(depth);
    this.setGraphicsActive(true);
    this.setGraphicsVisible(true);
    return graphics;
  }

  private ensureGraphics(): Phaser.GameObjects.Graphics {
    if (this.graphicsObject !== undefined) return this.graphicsObject;
    const graphics = this.scene.add.graphics();
    try {
      graphics
        .setDepth(1001)
        .setActive(false)
        .setVisible(false);
    } catch (error) {
      graphics.destroy();
      throw error;
    }
    this.graphicsObject = graphics;
    this.graphicsDepth = 1001;
    this.graphicsActive = false;
    this.graphicsVisible = false;
    this.workload.allocatedRoots += 1;
    this.workload.graphicsAllocated += 1;
    this.workload.stateVersion += 1;
    return graphics;
  }

  private get graphics(): Phaser.GameObjects.Graphics {
    if (this.graphicsObject === undefined) {
      throw new Error('Combat effect Graphics has not been initialized');
    }
    return this.graphicsObject;
  }

  private hideGraphics(): void {
    if (this.graphicsObject === undefined) return;
    this.setGraphicsActive(false);
    this.setGraphicsVisible(false);
  }

  private setGraphicsDepth(depth: number): void {
    if (this.graphicsDepth === depth) return;
    this.graphics.setDepth(depth);
    this.graphicsDepth = depth;
    this.workload.stateVersion += 1;
  }

  private setGraphicsActive(active: boolean): void {
    if (this.graphicsActive === active) return;
    this.graphics.setActive(active);
    this.graphicsActive = active;
    this.workload.stateVersion += 1;
  }

  private setGraphicsVisible(visible: boolean): void {
    if (this.graphicsVisible === visible) return;
    this.graphics.setVisible(visible);
    this.graphicsVisible = visible;
    this.workload.graphicsVisible += visible ? 1 : -1;
    this.workload.stateVersion += 1;
  }

  private setBobFrame(frame: CombatShapeFrame): void {
    if (this.bobFrame === frame) return;
    this.bob.setFrame(frame);
    this.bobFrame = frame;
    this.workload.stateVersion += 1;
  }

  private setBobPosition(x: number, y: number): void {
    if (this.bobX === x && this.bobY === y) return;
    this.bob.setPosition(x, y);
    this.bobX = x;
    this.bobY = y;
    this.workload.stateVersion += 1;
  }

  private setBobAlpha(alpha: number): void {
    if (this.bobAlpha === alpha) return;
    this.bob.setAlpha(alpha);
    this.bobAlpha = alpha;
    this.workload.stateVersion += 1;
  }

  private setBobVisible(visible: boolean): void {
    if (this.bobVisible === visible) return;
    this.bob.setVisible(visible);
    this.bobVisible = visible;
    this.workload.renderEligibleBobs += visible ? 1 : -1;
    this.workload.stateVersion += 1;
  }
}

function copyPayload(payload: EffectPayload): EffectPayload {
  switch (payload.type) {
    case 'projectileImpact': return { ...payload, position: copyPoint(payload.position) };
    case 'bark': return { ...payload, origin: copyPoint(payload.origin), target: copyPoint(payload.target) };
    case 'tailArc':
    case 'tailDust':
    case 'breederWarning':
    case 'electricWave': return { ...payload, position: copyPoint(payload.position) };
    case 'aquaBeam': return {
      ...payload,
      origin: copyPoint(payload.origin),
      target: copyPoint(payload.target),
    };
    case 'aquaSplash':
    case 'safetyNotice':
    case 'safetyStamp': return { ...payload, position: copyPoint(payload.position) };
    case 'doorPush':
    case 'snackFly': return {
      ...payload,
      origin: copyPoint(payload.origin),
      target: copyPoint(payload.target),
    };
  }
}

function copyPoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function assertTarget(target: SkillTargetSnapshot, label: string): void {
  if (!Number.isSafeInteger(target.targetId) || target.targetId < 0) {
    throw new RangeError(`${label} id must be a non-negative safe integer`);
  }
  assertPoint(target.position, `${label} position`);
}

function assertCastId(castId: string): void {
  if (castId.trim().length === 0) throw new RangeError('Effect castId must be non-empty');
}

function assertPoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}
