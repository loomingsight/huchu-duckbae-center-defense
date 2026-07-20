import { BALANCE } from '../data/balance';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import { EnemySystem } from '../enemies/EnemySystem';
import type { PathId } from '../types/GameTypes';
import { PathSystem } from '../world/PathSystem';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
import type { ScenarioEnemySeed } from './ScenarioSessionPort';

const ENEMY_STATE_SET = new Set<string>(['moving', 'windup', 'holding', 'stunned', 'dead']);

export class E2eEnemySystem extends EnemySystem {
  static override createDefault(): E2eEnemySystem {
    return new E2eEnemySystem(Object.fromEntries(
      Object.entries(PATH_DEFINITIONS).map(([id, points]) => [id, new PathSystem(points)]),
    ) as Record<PathId, PathSystem>);
  }

  spawnSeed(seed: ScenarioEnemySeed): {
    readonly enemyId: number;
    readonly request: EnemySpawnRequest;
  } {
    validateSeed(seed);
    const request: EnemySpawnRequest = {
      atMs: 0,
      kind: seed.kind,
      variant: seed.variant,
      pathId: seed.pathId,
      spawnSequence: this.nextId,
    };
    const defaultHp = BALANCE.enemies[request.kind].hp;
    const maxHp = seed.maxHp ?? defaultHp;
    const currentHp = seed.currentHp ?? maxHp;
    assertHp(currentHp, maxHp);
    const state = seed.state ?? 'moving';
    const stunnedMs = seed.stunnedMs ?? 0;
    if (state === 'dead') throw new RangeError('Seeded enemy state must be active');
    if (state === 'stunned' ? stunnedMs <= 0 : stunnedMs !== 0) {
      throw new RangeError('Seeded enemy stun state is inconsistent');
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

  spawnForScenario(seed: ScenarioEnemySeed): {
    readonly enemyId: number;
    readonly request: EnemySpawnRequest;
  } {
    return this.spawnSeed(seed);
  }
}

function validateSeed(seed: ScenarioEnemySeed): void {
  if (seed.placement.kind === 'worldPoint') {
    assertFinite(seed.placement.x, 'Seeded enemy x');
    assertFinite(seed.placement.y, 'Seeded enemy y');
  }
  if (seed.state !== undefined && !ENEMY_STATE_SET.has(seed.state)) {
    throw new RangeError(`Unknown enemy state ${String(seed.state)}`);
  }
  if (seed.stunnedMs !== undefined) assertFiniteNonNegative(seed.stunnedMs, 'Seeded enemy stun');
}

function assertHp(currentHp: number, maxHp: number): void {
  if (
    !Number.isFinite(currentHp)
    || !Number.isFinite(maxHp)
    || maxHp <= 0
    || currentHp <= 0
    || currentHp > maxHp
  ) {
    throw new RangeError('Invalid seeded enemy HP');
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
