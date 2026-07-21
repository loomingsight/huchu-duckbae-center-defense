import { resolveDogTraderAsset } from '../assets/DogTraderDirectionalAssets';
import { TRADER_SIDE_BY_PATH } from '../data/pathDefinitions';
import type { EnemyState, PathId } from '../types/GameTypes';
import {
  resolveDirection8,
  type Direction8,
} from '../world/DirectionalFrameResolver';
import type { Point } from '../world/Geometry';
import type { CompositeEnemyRig } from './CompositeEnemyRig';
import { DEFAULT_PATH_POSE_SAMPLERS } from './DogTraderAttackGeometry';
import type { DogTraderRigTelemetry } from './DogTraderRigTelemetry';
import { EnemyMovementAnimationClock } from './EnemyActor';
import type { EnemySnapshot } from './EnemyTypes';

const TRUCK_BACK_PX = 70;
const TRUCK_SIDE_PX = 28;
const DAMPING_MS = 120;
const SHELTER_CENTER = Object.freeze({ x: 270, y: 480 });

export interface DogTraderTruckRenderInput {
  readonly target: Point;
  readonly rolling: boolean;
  readonly elapsedMs: number;
}

export interface DogTraderPartsPort {
  renderHuman(
    position: Point,
    direction: Direction8,
    state: EnemyState,
    elapsedMs: number,
  ): void;
  renderTruck(
    position: Point,
    direction: Direction8,
    input: DogTraderTruckRenderInput,
  ): void;
  flashHuman(durationMs: number): void;
  flashTruck(durationMs: number): void;
  recoilHuman(input: RecoilInput): void;
  recoilTruck(input: RecoilInput): void;
  beginHumanDeath(durationMs: 160): void;
  beginTruckDeath(durationMs: 160): void;
  resetHuman(): void;
  resetTruck(): void;
}

export interface RecoilInput {
  readonly direction: Point;
  readonly distancePx: number;
  readonly popScale: number;
  readonly durationMs: number;
}

export interface DogTraderRigSnapshot {
  readonly pathId: PathId;
  readonly parts: 2;
  readonly gameplayEntityCount: 1;
  readonly pathProgress: number;
  readonly human: Point;
  readonly truck: Point;
  readonly followDistance: number;
  readonly lateralDistance: number;
  readonly humanDirection: Direction8;
  readonly truckDirection: Direction8;
  readonly humanFlipX: boolean;
  readonly truckFlipX: boolean;
}

export class DogTraderRig implements CompositeEnemyRig {
  private current: DogTraderRigSnapshot | undefined;
  private truckPosition: Point = { x: 0, y: 0 };
  private humanDirection: Direction8 = 'south';
  private truckDirection: Direction8 = 'south';
  private needsSnap = true;
  private hasRendered = false;
  private registered = false;
  private deathStarted = false;
  private readonly movementAnimationClock = new EnemyMovementAnimationClock();

  constructor(
    private readonly visual: DogTraderPartsPort,
    private readonly telemetry?: DogTraderRigTelemetry,
  ) {}

  render(snapshot: EnemySnapshot, deltaMs: number): void {
    if (snapshot.kind !== 'dogTrader') {
      throw new RangeError('DogTraderRig requires a dogTrader snapshot');
    }
    assertFiniteNonNegative(deltaMs, 'Dog trader render deltaMs');
    if (!Number.isFinite(snapshot.pathProgress)) {
      throw new RangeError('Dog trader pathProgress must be finite');
    }

    const sampler = DEFAULT_PATH_POSE_SAMPLERS[snapshot.pathId];
    const humanPose = sampler.sampleExtended(snapshot.pathProgress);
    const behindPose = sampler.sampleExtended(snapshot.pathProgress - TRUCK_BACK_PX);
    const side = TRADER_SIDE_BY_PATH[snapshot.pathId];
    const truckTarget = {
      x: behindPose.position.x + behindPose.normal.x * side * TRUCK_SIDE_PX,
      y: behindPose.position.y + behindPose.normal.y * side * TRUCK_SIDE_PX,
    };

    const firstPose = !this.hasRendered || this.needsSnap;
    if (firstPose) {
      this.truckPosition = { ...truckTarget };
    } else if (snapshot.state === 'moving') {
      const alpha = 1 - Math.exp(-deltaMs / DAMPING_MS);
      this.truckPosition = {
        x: this.truckPosition.x + (truckTarget.x - this.truckPosition.x) * alpha,
        y: this.truckPosition.y + (truckTarget.y - this.truckPosition.y) * alpha,
      };
    }

    const humanHeading = snapshot.state === 'moving'
      ? humanPose.headingRad
      : Math.atan2(
        SHELTER_CENTER.y - humanPose.position.y,
        SHELTER_CENTER.x - humanPose.position.x,
      );
    this.humanDirection = resolveDirection8(
      humanHeading,
      snapshot.state === 'moving' && this.hasRendered ? this.humanDirection : undefined,
    );
    if (snapshot.state === 'moving' || !this.hasRendered) {
      this.truckDirection = resolveDirection8(
        behindPose.headingRad,
        this.hasRendered ? this.truckDirection : undefined,
      );
    }

    const effectiveAnimationElapsedMs = this.movementAnimationClock.elapsedFor(snapshot);

    this.visual.renderHuman(
      humanPose.position,
      this.humanDirection,
      snapshot.state,
      effectiveAnimationElapsedMs,
    );
    this.visual.renderTruck(this.truckPosition, this.truckDirection, {
      target: truckTarget,
      rolling: snapshot.state === 'moving',
      elapsedMs: effectiveAnimationElapsedMs,
    });

    const humanAction = snapshot.state === 'moving' ? 'walk' : 'attack';
    this.current = {
      pathId: snapshot.pathId,
      parts: 2,
      gameplayEntityCount: 1,
      pathProgress: snapshot.pathProgress,
      human: { ...humanPose.position },
      truck: { ...this.truckPosition },
      followDistance: TRUCK_BACK_PX,
      lateralDistance: side * TRUCK_SIDE_PX,
      humanDirection: this.humanDirection,
      truckDirection: this.truckDirection,
      humanFlipX: resolveDogTraderAsset(humanAction, this.humanDirection).flipX,
      truckFlipX: resolveDogTraderAsset('truckRoll', this.truckDirection).flipX,
    };
    this.hasRendered = true;
    this.needsSnap = false;
    this.deathStarted = false;
    if (!this.registered) {
      this.telemetry?.register(this);
      this.registered = true;
    }
  }

  snapNextPose(): void {
    this.needsSnap = true;
  }

  humanAnchor(): Point {
    return this.current === undefined ? { x: 0, y: 0 } : { ...this.current.human };
  }

  getFeedbackAnchor(): Point {
    return this.humanAnchor();
  }

  snapshot(): DogTraderRigSnapshot {
    if (this.current === undefined) throw new Error('Dog trader rig has not rendered');
    return {
      ...this.current,
      human: { ...this.current.human },
      truck: { ...this.current.truck },
    };
  }

  flash(durationMs: number): void {
    assertFiniteNonNegative(durationMs, 'Dog trader flash durationMs');
    this.visual.flashHuman(durationMs);
    this.visual.flashTruck(durationMs);
    this.telemetry?.recordSharedFeedback(this);
  }

  recoil(input: RecoilInput): void {
    assertPoint(input.direction, 'Dog trader recoil direction');
    assertFiniteNonNegative(input.distancePx, 'Dog trader recoil distancePx');
    assertFiniteNonNegative(input.durationMs, 'Dog trader recoil durationMs');
    if (!Number.isFinite(input.popScale) || input.popScale <= 0) {
      throw new RangeError('Dog trader recoil popScale must be finite and positive');
    }
    const copy = { ...input, direction: { ...input.direction } };
    this.visual.recoilHuman(copy);
    this.visual.recoilTruck(copy);
    this.telemetry?.recordSharedFeedback(this);
  }

  beginDeath(durationMs: 160): void {
    if (durationMs !== 160) {
      throw new RangeError('Dog trader death presentation must last 160ms');
    }
    if (this.deathStarted) return;
    this.deathStarted = true;
    this.visual.beginHumanDeath(durationMs);
    this.visual.beginTruckDeath(durationMs);
  }

  reset(): void {
    this.visual.resetHuman();
    this.visual.resetTruck();
    if (this.registered) this.telemetry?.recordRelease(this);
    this.current = undefined;
    this.truckPosition = { x: 0, y: 0 };
    this.humanDirection = 'south';
    this.truckDirection = 'south';
    this.needsSnap = true;
    this.hasRendered = false;
    this.registered = false;
    this.deathStarted = false;
    this.movementAnimationClock.reset();
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}

function assertPoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}
