import { vi } from 'vitest';
import { FIXED_STEP_MS } from '../../src/game/constants';
import { E2eEnemySystem } from '../../src/game/debug/E2eEnemySystem';

describe('E2eEnemySystem held stress enemies', () => {
  it('held progress 보존은 full EnemySnapshot/ETA 생성 없이 내부 progress만 캡처한다', () => {
    const enemies = E2eEnemySystem.createDefault();
    const { enemyId } = enemies.spawnSeed({
      kind: 'offLeashGuardian',
      variant: 'male',
      pathId: 'P1',
      placement: { kind: 'pathProgress', value: 100 },
      heldForDebug: true,
    });
    const before = enemies.snapshots().find(({ id }) => id === enemyId)!;
    const snapshots = vi.spyOn(enemies, 'snapshots').mockImplementation(() => {
      throw new Error('held step requested full snapshots');
    });

    expect(() => enemies.step(FIXED_STEP_MS)).not.toThrow();
    expect(snapshots).not.toHaveBeenCalled();
    snapshots.mockRestore();

    const after = enemies.snapshots().find(({ id }) => id === enemyId)!;
    expect(after.pathProgress).toBe(before.pathProgress);
    expect(after.position).toEqual(before.position);
    expect(after.animationElapsedMs).toBeCloseTo(FIXED_STEP_MS, 12);
  });

  it('worldPoint seed는 실제 위치를, pathProgress seed는 경로 위치를 설정한다', () => {
    const enemies = E2eEnemySystem.createDefault();
    const world = enemies.spawnSeed({
      kind: 'poopGuardian',
      variant: 'female',
      pathId: 'P4',
      placement: { kind: 'worldPoint', x: 111, y: 444 },
    });
    const progress = enemies.spawnSeed({
      kind: 'offLeashGuardian',
      variant: 'male',
      pathId: 'P3',
      placement: { kind: 'pathProgress', value: 100 },
    });

    expect(enemies.snapshots().find(({ id }) => id === world.enemyId)?.position)
      .toEqual({ x: 111, y: 444 });
    expect(enemies.snapshots().find(({ id }) => id === progress.enemyId)?.position)
      .toEqual({ x: 270, y: 100 });
  });
});
