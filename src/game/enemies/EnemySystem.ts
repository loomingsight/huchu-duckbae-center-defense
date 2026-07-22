import {
  TIME_EPSILON_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../constants';
import { BALANCE } from '../data/balance';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import type {
  EnemyKind,
  EnemyState,
  EnemyVariant,
  PathId,
} from '../types/GameTypes';
import type { Point } from '../world/Geometry';
import { MovementTrail } from '../world/MovementTrail';
import {
  NAV_CELL_SIZE,
  NavigationField,
  type NavigationFieldSnapshot,
} from '../world/NavigationField';
import { PathSystem } from '../world/PathSystem';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
import type { EnemySnapshot } from './EnemyTypes';

export type EnemyLifecycleEvent =
  | { readonly type: 'enemyDied'; readonly enemyId: number }
  | { readonly type: 'snackEarned'; readonly enemyId: number; readonly amount: number };

export type EnemyAttackState = Extract<EnemyState, 'moving' | 'windup' | 'holding'>;

export interface TailEffect {
  readonly knockbackPx: number;
  readonly multiplier: number;
  readonly durationMs: number;
  readonly direction?: Point;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
export type MutableEnemy = Omit<
  Mutable<EnemySnapshot>,
  'position' | 'heading' | 'trailingPose' | 'etaMs'
> & {
  position: Point;
  heading: Point;
  readonly trail: MovementTrail;
  readonly speed: number;
  readonly snack: number;
  readonly attackRange: number;
  readonly path: PathSystem;
};

const OFF_LEASH_CONTINUOUS_BONUS_SPEED = 64 / 4;
const TRAIL_CAPACITY_PX = 140;
const TRAILING_POSE_DISTANCE_PX = 70;
const LEGACY_CENTER_TARGET = Object.freeze({ x: 270, y: 480 });
const MOVEMENT_EPSILON = 1e-9;
const MAX_INTEGRATION_STEPS = 1024;

const PATH_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
const PATH_ID_SET = new Set<string>(PATH_IDS);
const ENEMY_KINDS = [
  'poopGuardian',
  'offLeashGuardian',
  'dogTrader',
  'illegalBreeder',
] as const;
const ENEMY_KIND_SET = new Set<string>(ENEMY_KINDS);
const ENEMY_VARIANT_SET = new Set<string>(['male', 'female']);
const ENEMY_ATTACK_STATE_SET = new Set<string>(['moving', 'windup', 'holding']);

export class EnemySystem {
  protected readonly enemies = new Map<number, MutableEnemy>();
  protected readonly paths: Readonly<Record<PathId, PathSystem>>;
  protected readonly navigation: NavigationField;
  protected nextId = 0;

  constructor(
    paths: Readonly<Record<PathId, PathSystem>>,
    navigation = NavigationField.createDefault(),
  ) {
    const pathKeys = Object.keys(paths);
    const unknownPath = pathKeys.find((pathId) => !PATH_ID_SET.has(pathId));
    if (unknownPath !== undefined) {
      throw new RangeError(`Unknown enemy path ${unknownPath}`);
    }
    for (const pathId of PATH_IDS) {
      if (!Object.hasOwn(paths, pathId) || !(paths[pathId] instanceof PathSystem)) {
        throw new RangeError(`Missing enemy path ${pathId}`);
      }
    }
    this.paths = Object.fromEntries(PATH_IDS.map((pathId) => [pathId, paths[pathId]])) as Record<
      PathId,
      PathSystem
    >;
    this.navigation = navigation;
  }

  static createDefault(): EnemySystem {
    return new EnemySystem(defaultPaths());
  }

  static withSingleEnemy(input: {
    readonly kind: EnemyKind;
    readonly pathId: PathId;
    readonly initialProgress?: number;
  }): EnemySystem {
    const system = EnemySystem.createDefault();
    const enemyId = system.spawn({
      atMs: 0,
      kind: input.kind,
      pathId: input.pathId,
      variant: 'male',
      spawnSequence: 0,
    });
    if (input.initialProgress !== undefined) {
      system.applyPathProgress(enemyId, input.initialProgress);
    }
    system.navigation.step(0, LEGACY_CENTER_TARGET);
    return system;
  }

  static withEnemies(count: number): EnemySystem {
    if (!Number.isSafeInteger(count) || count < 0 || count > BALANCE.caps.enemies) {
      throw new RangeError('Enemy fixture count is out of range');
    }
    const system = EnemySystem.createDefault();
    for (let index = 0; index < count; index += 1) {
      system.spawn({
        atMs: 0,
        kind: 'poopGuardian',
        pathId: PATH_IDS[index % PATH_IDS.length]!,
        variant: index % 2 === 0 ? 'male' : 'female',
        spawnSequence: index,
      });
    }
    return system;
  }

  spawn(request: EnemySpawnRequest): number {
    assertSpawnRequest(request);
    if (this.enemies.size >= BALANCE.caps.enemies) throw new Error('Enemy cap reached');

    const stats = BALANCE.enemies[request.kind];
    const path = this.paths[request.pathId];
    const position = path.positionAt(0);
    const heading = normalizedOrFallback(
      difference(position, path.positionAt(Math.min(path.length, 1))),
      { x: 0, y: 1 },
    );
    const trail = new MovementTrail(TRAIL_CAPACITY_PX);
    trail.reset(position, heading);
    const id = this.nextId;
    this.nextId += 1;
    this.enemies.set(id, {
      id,
      kind: request.kind,
      variant: request.variant,
      state: 'moving',
      pathId: request.pathId,
      pathProgress: 0,
      position,
      heading,
      currentHp: stats.hp,
      maxHp: stats.hp,
      spawnSequence: request.spawnSequence,
      isBoss: isBoss(request.kind),
      moveSpeedMultiplier: 1,
      slowRemainingMs: 0,
      dashCooldownRemainingMs: 0,
      animationElapsedMs: 0,
      speed: stats.speed,
      snack: stats.snack,
      attackRange: stats.range,
      path,
      trail,
    });
    return id;
  }

  removeWithoutReward(enemyId: number): void {
    assertEnemyId(enemyId);
    this.enemies.delete(enemyId);
  }

  step(stepMs: number, target: Point = LEGACY_CENTER_TARGET): void {
    assertFiniteNonNegative(stepMs, 'EnemySystem stepMs');
    assertPoint(target, 'EnemySystem target');
    this.navigation.step(stepMs, target);

    for (const enemy of this.enemies.values()) {
      if (enemy.state === 'moving') {
        this.advanceMoving(enemy, stepMs);
      } else {
        enemy.heading = normalizedOrFallback(
          difference(enemy.position, target),
          enemy.heading,
        );
      }
      enemy.animationElapsedMs += stepMs;
    }
  }

  damage(enemyId: number, amount: number): readonly EnemyLifecycleEvent[] {
    assertEnemyId(enemyId);
    assertFinite(amount, 'Enemy damage');
    if (amount <= 0) return [];
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined || enemy.state === 'dead') return [];

    enemy.currentHp = Math.max(0, enemy.currentHp - amount);
    if (enemy.currentHp > 0) return [];
    enemy.state = 'dead';
    this.enemies.delete(enemyId);
    return [
      { type: 'enemyDied', enemyId },
      { type: 'snackEarned', enemyId, amount: enemy.snack },
    ];
  }

  setState(enemyId: number, state: EnemyAttackState, animationElapsedMs?: number): void {
    assertEnemyId(enemyId);
    if (!ENEMY_ATTACK_STATE_SET.has(state)) {
      throw new RangeError(`Unknown enemy attack state ${String(state)}`);
    }
    if (animationElapsedMs !== undefined) {
      assertFiniteNonNegative(animationElapsedMs, 'Enemy animationElapsedMs');
    }
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return;

    const preserveAttackElapsed = animationElapsedMs === undefined
      && enemy.state === 'windup'
      && state === 'holding';
    enemy.state = state;
    if (!preserveAttackElapsed) enemy.animationElapsedMs = animationElapsedMs ?? 0;
  }

  knockBack(enemyId: number, distance: number): void {
    assertEnemyId(enemyId);
    assertFiniteNonNegative(distance, 'Enemy knockback distance');
    if (distance === 0) return;
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return;

    this.moveBehind(enemy, distance);
    enemy.state = 'moving';
    enemy.animationElapsedMs = 0;
  }

  applyPathProgress(enemyId: number, nextPathProgress: number): void {
    assertEnemyId(enemyId);
    assertFiniteNonNegative(nextPathProgress, 'Enemy absolute path progress');
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return;

    const progress = Math.min(enemy.path.length, nextPathProgress);
    const position = enemy.path.positionAt(progress);
    const nextPosition = enemy.path.positionAt(Math.min(enemy.path.length, progress + 1));
    enemy.position = position;
    enemy.heading = normalizedOrFallback(difference(position, nextPosition), enemy.heading);
    enemy.pathProgress = progress;
    enemy.trail.reset(position, enemy.heading);
    enemy.state = 'moving';
    enemy.animationElapsedMs = 0;
  }

  applyWorldPosition(enemyId: number, position: Point): void {
    assertEnemyId(enemyId);
    assertPoint(position, 'Enemy world position');
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return;
    enemy.position = clampWorld(position);
    enemy.heading = normalizedOrFallback(
      this.navigation.directionFrom(enemy.position),
      enemy.heading,
    );
    enemy.trail.reset(enemy.position, enemy.heading);
    enemy.state = 'moving';
    enemy.animationElapsedMs = 0;
  }

  applyTailEffect(enemyId: number, effect: TailEffect): { readonly interruptedWindup: boolean } {
    assertEnemyId(enemyId);
    assertFiniteNonNegative(effect.knockbackPx, 'Tail knockbackPx');
    assertFiniteNonNegative(effect.durationMs, 'Tail durationMs');
    if (!Number.isFinite(effect.multiplier) || effect.multiplier <= 0) {
      throw new RangeError('Tail multiplier must be finite and positive');
    }
    if (effect.direction !== undefined) assertPoint(effect.direction, 'Tail direction');
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return { interruptedWindup: false };

    const interruptedWindup = enemy.state === 'windup';
    if (effect.knockbackPx > 0) {
      if (effect.direction === undefined) {
        this.moveBehind(enemy, effect.knockbackPx);
      } else {
        const direction = normalizedOrFallback(effect.direction, { x: 0, y: -1 });
        enemy.position = clampWorld({
          x: enemy.position.x + direction.x * effect.knockbackPx,
          y: enemy.position.y + direction.y * effect.knockbackPx,
        });
        enemy.heading = normalizedOrFallback(
          this.navigation.directionFrom(enemy.position),
          enemy.heading,
        );
        enemy.trail.reset(enemy.position, enemy.heading);
      }
    }
    enemy.moveSpeedMultiplier = effect.durationMs > 0 ? effect.multiplier : 1;
    enemy.slowRemainingMs = Math.max(enemy.slowRemainingMs, effect.durationMs);
    if (interruptedWindup) {
      enemy.state = 'moving';
      enemy.animationElapsedMs = 0;
    }
    return { interruptedWindup };
  }

  snapshots(): readonly EnemySnapshot[] {
    return [...this.enemies.values()]
      .sort((left, right) => left.spawnSequence - right.spawnSequence || left.id - right.id)
      .map((enemy) => ({
        id: enemy.id,
        kind: enemy.kind,
        variant: enemy.variant,
        state: enemy.state,
        pathId: enemy.pathId,
        pathProgress: enemy.pathProgress,
        position: { ...enemy.position },
        heading: { ...enemy.heading },
        trailingPose: enemy.trail.sampleBehind(TRAILING_POSE_DISTANCE_PX),
        etaMs: enemy.state === 'windup' || enemy.state === 'holding'
          ? 0
          : this.estimateEtaMs(enemy),
        currentHp: enemy.currentHp,
        maxHp: enemy.maxHp,
        spawnSequence: enemy.spawnSequence,
        isBoss: enemy.isBoss,
        moveSpeedMultiplier: enemy.moveSpeedMultiplier,
        slowRemainingMs: enemy.slowRemainingMs,
        dashCooldownRemainingMs: enemy.dashCooldownRemainingMs,
        animationElapsedMs: enemy.animationElapsedMs,
      }));
  }

  navigationSnapshot(): NavigationFieldSnapshot {
    return this.navigation.snapshot();
  }

  get activeCount(): number {
    return this.enemies.size;
  }

  has(enemyId: number): boolean {
    assertEnemyId(enemyId);
    return this.enemies.has(enemyId);
  }

  clear(): void {
    this.enemies.clear();
    this.navigation.reset();
    this.nextId = 0;
  }

  private advanceMoving(enemy: MutableEnemy, stepMs: number): void {
    let remainingMs = stepMs;
    let integrationSteps = 0;
    while (remainingMs > TIME_EPSILON_MS) {
      integrationSteps += 1;
      if (integrationSteps > MAX_INTEGRATION_STEPS) {
        throw new Error('Enemy movement integration exceeded its deterministic bound');
      }
      this.resolveMovementBoundaries(enemy);
      const speedPerMs = movementSpeed(enemy) * enemy.moveSpeedMultiplier / 1000;
      if (!Number.isFinite(speedPerMs) || speedPerMs <= 0) {
        throw new Error('Invalid internal enemy movement speed');
      }
      const remainingDistance = this.navigation.distanceFrom(enemy.position);
      if (!Number.isFinite(remainingDistance) || remainingDistance <= MOVEMENT_EPSILON) {
        this.advanceTimers(enemy, remainingMs);
        return;
      }
      const slowBoundary = enemy.slowRemainingMs > 0
        ? enemy.slowRemainingMs
        : Number.POSITIVE_INFINITY;
      const navigationBoundary = remainingDistance / speedPerMs;
      const cellBoundary = (NAV_CELL_SIZE / 2) / speedPerMs;
      const sliceMs = Math.min(
        remainingMs,
        slowBoundary,
        navigationBoundary,
        cellBoundary,
      );
      const direction = this.navigation.directionFrom(enemy.position);
      const directionLength = Math.hypot(direction.x, direction.y);
      if (directionLength <= MOVEMENT_EPSILON || sliceMs <= TIME_EPSILON_MS) {
        this.advanceTimers(enemy, remainingMs);
        return;
      }
      const plannedDistance = Math.min(remainingDistance, speedPerMs * sliceMs);
      const nextPosition = canonicalPoint(clampWorld({
        x: enemy.position.x + direction.x * plannedDistance,
        y: enemy.position.y + direction.y * plannedDistance,
      }));
      const actualDistance = Math.hypot(
        nextPosition.x - enemy.position.x,
        nextPosition.y - enemy.position.y,
      );
      if (actualDistance <= MOVEMENT_EPSILON) {
        this.advanceTimers(enemy, remainingMs);
        return;
      }
      enemy.position = nextPosition;
      enemy.heading = { ...direction };
      enemy.pathProgress = canonicalNumber(enemy.pathProgress + actualDistance);
      enemy.trail.push(enemy.position, enemy.heading);
      this.advanceTimers(enemy, sliceMs);
      remainingMs = Math.max(0, remainingMs - sliceMs);
    }
    this.resolveMovementBoundaries(enemy);
  }

  private advanceTimers(enemy: MutableEnemy, stepMs: number): void {
    enemy.slowRemainingMs = Math.max(0, enemy.slowRemainingMs - stepMs);
    this.resolveMovementBoundaries(enemy);
  }

  private resolveMovementBoundaries(enemy: MutableEnemy): void {
    if (enemy.slowRemainingMs <= TIME_EPSILON_MS) {
      enemy.slowRemainingMs = 0;
      enemy.moveSpeedMultiplier = 1;
    }
    enemy.dashCooldownRemainingMs = 0;
  }

  private estimateEtaMs(enemy: MutableEnemy): number {
    const distance = this.navigation.distanceFrom(enemy.position);
    if (!Number.isFinite(distance)) return Number.POSITIVE_INFINITY;
    if (distance <= MOVEMENT_EPSILON) return 0;
    const baseSpeed = movementSpeed(enemy);
    if (enemy.slowRemainingMs <= TIME_EPSILON_MS || enemy.moveSpeedMultiplier === 1) {
      return distance / baseSpeed * 1000;
    }
    const slowedSpeed = baseSpeed * enemy.moveSpeedMultiplier;
    const slowedDistance = slowedSpeed * enemy.slowRemainingMs / 1000;
    if (distance <= slowedDistance) return distance / slowedSpeed * 1000;
    return enemy.slowRemainingMs + (distance - slowedDistance) / baseSpeed * 1000;
  }

  private moveBehind(enemy: MutableEnemy, distance: number): void {
    const pose = enemy.trail.sampleBehind(distance);
    enemy.position = clampWorld(pose.position);
    enemy.heading = { ...pose.heading };
    enemy.pathProgress = Math.max(0, enemy.pathProgress - distance);
    enemy.trail.reset(enemy.position, enemy.heading);
  }
}

function defaultPaths(): Record<PathId, PathSystem> {
  return Object.fromEntries(
    Object.entries(PATH_DEFINITIONS).map(([id, points]) => [id, new PathSystem(points)]),
  ) as Record<PathId, PathSystem>;
}

function assertSpawnRequest(request: EnemySpawnRequest): void {
  assertFiniteNonNegative(request.atMs, 'Enemy spawn atMs');
  if (!Number.isSafeInteger(request.spawnSequence) || request.spawnSequence < 0) {
    throw new RangeError('Enemy spawnSequence must be a non-negative safe integer');
  }
  if (!ENEMY_KIND_SET.has(request.kind)) {
    throw new RangeError(`Unknown enemy kind ${String(request.kind)}`);
  }
  if (!ENEMY_VARIANT_SET.has(request.variant)) {
    throw new RangeError(`Unknown enemy variant ${String(request.variant)}`);
  }
  if (!PATH_ID_SET.has(request.pathId)) {
    throw new RangeError(`Unknown enemy path ${String(request.pathId)}`);
  }
}

function assertEnemyId(enemyId: number): void {
  if (!Number.isSafeInteger(enemyId) || enemyId < 0) {
    throw new RangeError('Enemy id must be a non-negative safe integer');
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
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

function isBoss(kind: EnemyKind): boolean {
  return kind === 'dogTrader' || kind === 'illegalBreeder';
}

function movementSpeed(enemy: Pick<MutableEnemy, 'kind' | 'speed'>): number {
  return enemy.speed + (enemy.kind === 'offLeashGuardian'
    ? OFF_LEASH_CONTINUOUS_BONUS_SPEED
    : 0);
}

function difference(from: Point, to: Point): Point {
  return { x: to.x - from.x, y: to.y - from.y };
}

function normalizedOrFallback(vector: Point, fallback: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  return length <= MOVEMENT_EPSILON
    ? { ...fallback }
    : { x: vector.x / length, y: vector.y / length };
}

function clampWorld(position: Point): Point {
  return {
    x: Math.max(0, Math.min(WORLD_WIDTH, position.x)),
    y: Math.max(0, Math.min(WORLD_HEIGHT, position.y)),
  };
}

function canonicalPoint(position: Point): Point {
  return { x: canonicalNumber(position.x), y: canonicalNumber(position.y) };
}

function canonicalNumber(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}
