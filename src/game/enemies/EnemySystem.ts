import { TIME_EPSILON_MS } from '../constants';
import { BALANCE } from '../data/balance';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import type {
  EnemyKind,
  EnemyState,
  EnemyVariant,
  PathId,
} from '../types/GameTypes';
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
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
export type MutableEnemy = Omit<Mutable<EnemySnapshot>, 'position' | 'etaMs'> & {
  readonly speed: number;
  readonly snack: number;
  readonly attackRange: number;
  readonly attackProgress: number;
  readonly path: PathSystem;
};

interface MovementState {
  kind: EnemyKind;
  pathProgress: number;
  speed: number;
  attackProgress: number;
  moveSpeedMultiplier: number;
  slowRemainingMs: number;
  dashCooldownRemainingMs: number;
}

const DOG_TRADER_ENTRY_PROGRESS = -70;
const OFF_LEASH_DASH_DISTANCE = 64;
const OFF_LEASH_DASH_INTERVAL_MS = 4000;

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
  protected nextId = 0;

  constructor(paths: Readonly<Record<PathId, PathSystem>>) {
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
  }

  static createDefault(): EnemySystem {
    return new EnemySystem(Object.fromEntries(
      Object.entries(PATH_DEFINITIONS).map(([id, points]) => [id, new PathSystem(points)]),
    ) as Record<PathId, PathSystem>);
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
      assertFinite(input.initialProgress, 'Enemy initialProgress');
      const enemy = system.enemies.get(enemyId)!;
      enemy.pathProgress = Math.min(
        enemy.path.length,
        Math.max(minimumProgress(enemy.kind), input.initialProgress),
      );
    }
    return system;
  }

  spawn(request: EnemySpawnRequest): number {
    assertSpawnRequest(request);
    if (this.enemies.size >= BALANCE.caps.enemies) throw new Error('Enemy cap reached');

    const stats = BALANCE.enemies[request.kind];
    const path = this.paths[request.pathId];
    const attackProgress = path.firstProgressWithinCircle(
      { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
      BALANCE.shelter.hitRadius + stats.range,
    );
    const id = this.nextId;
    this.nextId += 1;
    this.enemies.set(id, {
      id,
      kind: request.kind,
      variant: request.variant,
      state: 'moving',
      pathId: request.pathId,
      pathProgress: minimumProgress(request.kind),
      currentHp: stats.hp,
      maxHp: stats.hp,
      spawnSequence: request.spawnSequence,
      isBoss: isBoss(request.kind),
      moveSpeedMultiplier: 1,
      slowRemainingMs: 0,
      dashCooldownRemainingMs: OFF_LEASH_DASH_INTERVAL_MS,
      animationElapsedMs: 0,
      speed: stats.speed,
      snack: stats.snack,
      attackRange: stats.range,
      path,
      attackProgress,
    });
    return id;
  }

  removeWithoutReward(enemyId: number): void {
    assertEnemyId(enemyId);
    this.enemies.delete(enemyId);
  }

  step(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'EnemySystem stepMs');
    if (stepMs === 0) return;

    for (const enemy of this.enemies.values()) {
      if (enemy.state !== 'moving') {
        enemy.animationElapsedMs += stepMs;
        continue;
      }
      this.advanceMoving(enemy, stepMs);
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

    enemy.pathProgress = Math.max(
      minimumProgress(enemy.kind),
      enemy.pathProgress - distance,
    );
    enemy.state = 'moving';
    enemy.animationElapsedMs = 0;
  }

  applyPathProgress(enemyId: number, nextPathProgress: number): void {
    assertEnemyId(enemyId);
    assertFiniteNonNegative(nextPathProgress, 'Enemy absolute path progress');
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return;

    enemy.pathProgress = Math.min(enemy.path.length, nextPathProgress);
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
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return { interruptedWindup: false };

    const interruptedWindup = enemy.state === 'windup';
    enemy.pathProgress = Math.max(
      minimumProgress(enemy.kind),
      enemy.pathProgress - effect.knockbackPx,
    );
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
      .map((enemy) => {
        return {
          id: enemy.id,
          kind: enemy.kind,
          variant: enemy.variant,
          state: enemy.state,
          pathId: enemy.pathId,
          pathProgress: enemy.pathProgress,
          position: enemy.path.positionAtExtended(enemy.pathProgress),
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
        };
      });
  }

  private advanceMoving(enemy: MovementState, stepMs: number): void {
    let remainingMs = stepMs;
    while (remainingMs > 0) {
      this.resolveMovementBoundaries(enemy);
      const slowBoundary = enemy.slowRemainingMs > 0
        ? enemy.slowRemainingMs
        : Number.POSITIVE_INFINITY;
      const dashBoundary = enemy.kind === 'offLeashGuardian'
        ? enemy.dashCooldownRemainingMs
        : Number.POSITIVE_INFINITY;
      const sliceMs = Math.min(remainingMs, slowBoundary, dashBoundary);
      enemy.pathProgress = Math.min(
        enemy.attackProgress,
        enemy.pathProgress + enemy.speed * enemy.moveSpeedMultiplier * sliceMs / 1000,
      );
      enemy.slowRemainingMs = Math.max(0, enemy.slowRemainingMs - sliceMs);
      enemy.dashCooldownRemainingMs = Math.max(0, enemy.dashCooldownRemainingMs - sliceMs);
      remainingMs = Math.max(0, remainingMs - sliceMs);
      this.resolveMovementBoundaries(enemy);
    }
  }

  private resolveMovementBoundaries(enemy: MovementState): void {
    if (enemy.slowRemainingMs <= TIME_EPSILON_MS) {
      enemy.slowRemainingMs = 0;
      enemy.moveSpeedMultiplier = 1;
    }
    if (enemy.dashCooldownRemainingMs > TIME_EPSILON_MS) return;

    enemy.dashCooldownRemainingMs = 0;
    if (enemy.kind !== 'offLeashGuardian') return;
    enemy.pathProgress = Math.min(
      enemy.attackProgress,
      enemy.pathProgress + OFF_LEASH_DASH_DISTANCE * enemy.moveSpeedMultiplier,
    );
    enemy.dashCooldownRemainingMs = OFF_LEASH_DASH_INTERVAL_MS;
  }

  private estimateEtaMs(enemy: MutableEnemy): number {
    if (enemy.pathProgress >= enemy.attackProgress) return 0;
    const estimate: MovementState = {
      kind: enemy.kind,
      pathProgress: enemy.pathProgress,
      speed: enemy.speed,
      attackProgress: enemy.attackProgress,
      moveSpeedMultiplier: enemy.moveSpeedMultiplier,
      slowRemainingMs: enemy.slowRemainingMs,
      dashCooldownRemainingMs: enemy.dashCooldownRemainingMs,
    };
    let elapsedMs = 0;
    while (estimate.pathProgress < estimate.attackProgress) {
      this.resolveMovementBoundaries(estimate);
      const remainingDistance = estimate.attackProgress - estimate.pathProgress;
      if (remainingDistance <= TIME_EPSILON_MS) {
        estimate.pathProgress = estimate.attackProgress;
        break;
      }
      const speedPerMs = estimate.speed * estimate.moveSpeedMultiplier / 1000;
      if (speedPerMs <= 0) return Number.POSITIVE_INFINITY;
      const untilArrivalMs = remainingDistance / speedPerMs;
      const untilSlowBoundaryMs = estimate.slowRemainingMs > 0
        ? estimate.slowRemainingMs
        : Number.POSITIVE_INFINITY;
      const untilDashBoundaryMs = estimate.kind === 'offLeashGuardian'
        ? estimate.dashCooldownRemainingMs
        : Number.POSITIVE_INFINITY;
      const sliceMs = Math.min(untilArrivalMs, untilSlowBoundaryMs, untilDashBoundaryMs);
      this.advanceMoving(estimate, sliceMs);
      elapsedMs += sliceMs;
    }
    return elapsedMs;
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
    this.nextId = 0;
  }
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

function isBoss(kind: EnemyKind): boolean {
  return kind === 'dogTrader' || kind === 'illegalBreeder';
}

function minimumProgress(kind: EnemyKind): number {
  return kind === 'dogTrader' ? DOG_TRADER_ENTRY_PROGRESS : 0;
}
