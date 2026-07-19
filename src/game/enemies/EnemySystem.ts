import { subtractDuration, TIME_EPSILON_MS } from '../constants';
import { BALANCE } from '../data/balance';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import type { ScenarioEnemySeed } from '../debug/ScenarioSessionPort';
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

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableEnemy = Omit<Mutable<EnemySnapshot>, 'position' | 'etaMs'> & {
  readonly speed: number;
  readonly snack: number;
  readonly attackRange: number;
  readonly attackProgress: number;
  readonly path: PathSystem;
};

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
const ENEMY_STATE_SET = new Set<string>(['moving', 'windup', 'holding', 'stunned', 'dead']);
const ENEMY_ATTACK_STATE_SET = new Set<string>(['moving', 'windup', 'holding']);

export class EnemySystem {
  private readonly enemies = new Map<number, MutableEnemy>();
  private readonly paths: Readonly<Record<PathId, PathSystem>>;
  private nextId = 0;

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

  static withSingleEnemy(input: { readonly kind: EnemyKind; readonly pathId: PathId }): EnemySystem {
    const system = EnemySystem.createDefault();
    system.spawn({
      atMs: 0,
      kind: input.kind,
      pathId: input.pathId,
      variant: 'male',
      spawnSequence: 0,
    });
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
      pathProgress: 0,
      currentHp: stats.hp,
      maxHp: stats.hp,
      spawnSequence: request.spawnSequence,
      isBoss: isBoss(request.kind),
      stunnedMs: 0,
      animationElapsedMs: 0,
      speed: stats.speed,
      snack: stats.snack,
      attackRange: stats.range,
      path,
      attackProgress,
    });
    return id;
  }

  spawnForScenario(seed: ScenarioEnemySeed): {
    readonly enemyId: number;
    readonly request: EnemySpawnRequest;
  } {
    const request: EnemySpawnRequest = {
      atMs: 0,
      kind: seed.kind,
      variant: seed.variant,
      pathId: seed.pathId,
      spawnSequence: this.nextId,
    };
    assertSpawnRequest(request);
    assertScenarioSeed(seed);

    const defaultHp = BALANCE.enemies[request.kind].hp;
    const maxHp = seed.maxHp ?? defaultHp;
    const currentHp = seed.currentHp ?? maxHp;
    assertScenarioHp(currentHp, maxHp);
    const state = seed.state ?? 'moving';
    const stunnedMs = seed.stunnedMs ?? 0;
    if (state === 'dead') throw new RangeError('Scenario enemy state must be active');
    if (state === 'stunned' ? stunnedMs <= 0 : stunnedMs !== 0) {
      throw new RangeError('Scenario enemy stun state is inconsistent');
    }

    const path = this.paths[request.pathId];
    const pathProgress = seed.placement.kind === 'attackBoundary'
      ? path.firstProgressWithinCircle(
        { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
        BALANCE.shelter.hitRadius + BALANCE.enemies[request.kind].range,
      )
      : path.closestProgressTo({ x: seed.placement.x, y: seed.placement.y });

    const enemyId = this.spawn(request);
    const enemy = this.enemies.get(enemyId)!;
    enemy.pathProgress = pathProgress;
    enemy.currentHp = currentHp;
    enemy.maxHp = maxHp;
    enemy.state = state;
    enemy.stunnedMs = stunnedMs;
    enemy.animationElapsedMs = 0;
    return { enemyId, request };
  }

  removeWithoutReward(enemyId: number): void {
    assertEnemyId(enemyId);
    this.enemies.delete(enemyId);
  }

  step(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'EnemySystem stepMs');
    if (stepMs === 0) return;

    for (const enemy of this.enemies.values()) {
      let activeStepMs = stepMs;
      if (enemy.state === 'stunned') {
        const frozenMs = Math.min(enemy.stunnedMs, activeStepMs);
        enemy.stunnedMs = subtractDuration(enemy.stunnedMs, frozenMs);
        activeStepMs = Math.max(0, activeStepMs - frozenMs);
        if (enemy.stunnedMs > 0) continue;
        enemy.state = 'moving';
        enemy.animationElapsedMs = 0;
        if (activeStepMs <= TIME_EPSILON_MS) continue;
      }
      if (enemy.state !== 'moving') {
        enemy.animationElapsedMs += activeStepMs;
        continue;
      }
      enemy.pathProgress = Math.min(
        enemy.attackProgress,
        enemy.pathProgress + enemy.speed * activeStepMs / 1000,
      );
      enemy.animationElapsedMs += activeStepMs;
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
    enemy.stunnedMs = 0;
    if (!preserveAttackElapsed) enemy.animationElapsedMs = animationElapsedMs ?? 0;
  }

  knockBack(enemyId: number, distance: number): void {
    assertEnemyId(enemyId);
    assertFiniteNonNegative(distance, 'Enemy knockback distance');
    if (distance === 0) return;
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return;

    enemy.pathProgress = enemy.path.knockBack(enemy.pathProgress, distance);
    enemy.state = 'moving';
    enemy.stunnedMs = 0;
    enemy.animationElapsedMs = 0;
  }

  applyPathProgress(enemyId: number, nextPathProgress: number): void {
    assertEnemyId(enemyId);
    assertFiniteNonNegative(nextPathProgress, 'Enemy absolute path progress');
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return;

    enemy.pathProgress = Math.min(enemy.path.length, nextPathProgress);
    enemy.state = 'moving';
    enemy.stunnedMs = 0;
    enemy.animationElapsedMs = 0;
  }

  stun(enemyId: number, durationMs: number): void {
    assertEnemyId(enemyId);
    assertFiniteNonNegative(durationMs, 'Enemy stun durationMs');
    if (durationMs === 0) return;
    const enemy = this.enemies.get(enemyId);
    if (enemy === undefined) return;

    enemy.state = 'stunned';
    enemy.stunnedMs = durationMs;
    enemy.animationElapsedMs = 0;
  }

  snapshots(): readonly EnemySnapshot[] {
    return [...this.enemies.values()]
      .sort((left, right) => left.spawnSequence - right.spawnSequence || left.id - right.id)
      .map((enemy) => {
        const movingEtaMs = Math.max(0, enemy.attackProgress - enemy.pathProgress)
          / enemy.speed * 1000;
        return {
          id: enemy.id,
          kind: enemy.kind,
          variant: enemy.variant,
          state: enemy.state,
          pathId: enemy.pathId,
          pathProgress: enemy.pathProgress,
          position: enemy.path.positionAt(enemy.pathProgress),
          etaMs: enemy.state === 'windup' || enemy.state === 'holding'
            ? 0
            : movingEtaMs + (enemy.state === 'stunned' ? enemy.stunnedMs : 0),
          currentHp: enemy.currentHp,
          maxHp: enemy.maxHp,
          spawnSequence: enemy.spawnSequence,
          isBoss: enemy.isBoss,
          stunnedMs: enemy.stunnedMs,
          animationElapsedMs: enemy.animationElapsedMs,
        };
      });
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

function assertScenarioSeed(seed: ScenarioEnemySeed): void {
  if (seed.placement.kind === 'worldPoint') {
    assertFinite(seed.placement.x, 'Scenario enemy x');
    assertFinite(seed.placement.y, 'Scenario enemy y');
  } else if (seed.placement.kind !== 'attackBoundary') {
    const unknownPlacement = seed.placement as { readonly kind: unknown };
    throw new RangeError(`Unknown scenario placement ${String(unknownPlacement.kind)}`);
  }
  if (seed.state !== undefined && !ENEMY_STATE_SET.has(seed.state)) {
    throw new RangeError(`Unknown enemy state ${String(seed.state)}`);
  }
  if (seed.stunnedMs !== undefined) {
    assertFiniteNonNegative(seed.stunnedMs, 'Scenario enemy stunnedMs');
  }
}

function assertScenarioHp(currentHp: number, maxHp: number): void {
  if (
    !Number.isFinite(currentHp)
    || !Number.isFinite(maxHp)
    || maxHp <= 0
    || currentHp <= 0
    || currentHp > maxHp
  ) {
    throw new RangeError('Invalid scenario enemy HP');
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
