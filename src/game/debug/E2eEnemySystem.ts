import { BALANCE } from '../data/balance';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import { EnemySystem } from '../enemies/EnemySystem';
import type { PathId } from '../types/GameTypes';
import { PathSystem } from '../world/PathSystem';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
import type { ScenarioEnemySeed } from './ScenarioSessionPort';

export class E2eEnemySystem extends EnemySystem {
  private readonly heldForDebug = new Set<number>();

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
    const path = this.paths[request.pathId];
    const pathProgress = seed.placement.kind === 'attackBoundary'
      ? path.firstProgressWithinCircle(
        { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
        BALANCE.shelter.hitRadius + BALANCE.enemies[request.kind].range,
      )
      : seed.placement.kind === 'pathProgress'
        ? seed.placement.value
        : path.closestProgressTo({ x: seed.placement.x, y: seed.placement.y });
    const enemyId = this.spawn(request);
    const enemy = this.enemies.get(enemyId)!;
    enemy.pathProgress = pathProgress;
    enemy.currentHp = currentHp;
    enemy.maxHp = maxHp;
    enemy.state = seed.state ?? 'moving';
    enemy.animationElapsedMs = 0;
    if (seed.heldForDebug) this.heldForDebug.add(enemyId);
    return { enemyId, request };
  }

  override step(stepMs: number): void {
    const held = new Map<number, number>();
    for (const id of this.heldForDebug) {
      const enemy = this.enemies.get(id);
      if (enemy !== undefined) held.set(id, enemy.pathProgress);
    }
    super.step(stepMs);
    for (const [id, pathProgress] of held) {
      const enemy = this.enemies.get(id);
      if (enemy !== undefined) enemy.pathProgress = pathProgress;
    }
  }

  override removeWithoutReward(enemyId: number): void {
    this.heldForDebug.delete(enemyId);
    super.removeWithoutReward(enemyId);
  }

  override clear(): void {
    this.heldForDebug.clear();
    super.clear();
  }
}

function validateSeed(seed: ScenarioEnemySeed): void {
  if (seed.placement.kind === 'worldPoint') {
    assertFinite(seed.placement.x, 'Seeded enemy x');
    assertFinite(seed.placement.y, 'Seeded enemy y');
  }
  if (seed.placement.kind === 'pathProgress') {
    assertFinite(seed.placement.value, 'Seeded enemy path progress');
  }
}

function assertHp(currentHp: number, maxHp: number): void {
  if (!Number.isFinite(currentHp) || !Number.isFinite(maxHp) || maxHp <= 0 || currentHp <= 0 || currentHp > maxHp) {
    throw new RangeError('Invalid seeded enemy HP');
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}
