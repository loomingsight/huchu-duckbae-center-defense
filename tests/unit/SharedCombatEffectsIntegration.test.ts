import { CombatEffectPool } from '../../src/game/combat/CombatEffectPool';
import { ProjectileActorPool } from '../../src/game/combat/ProjectileActorPool';
import { PlayerView } from '../../src/game/player/PlayerView';

it('PlayerView bark와 ProjectileActorPool impact는 주입된 동일 120 pool identity/budget을 사용한다', () => {
  const fake = createSharedScene();
  const effects = new CombatEffectPool(fake.scene as never);
  const projectiles = new ProjectileActorPool(fake.scene as never, effects);
  const player = new PlayerView(fake.scene as never, { x: 10, y: 20 }, effects);

  expect(player.showBarkWave({ x: 10, y: 20 }, { x: 100, y: 20 })).toBe(true);
  projectiles.showHit(1, 'poop', { x: 270, y: 518 });

  expect(player.effectPoolSnapshot()).toEqual(effects.snapshot());
  expect(projectiles.impactPoolSnapshot()).toEqual(effects.snapshot());
  expect(effects.snapshot()).toMatchObject({ created: 120, active: 2, available: 118 });
  expect(effects.projectileImpactSnapshots()).toHaveLength(1);

  player.resetCombatVisuals();
  expect(effects.effectSnapshots().map(({ type }) => type)).toEqual(['projectileImpact']);
  projectiles.releaseAll();
  expect(effects.snapshot()).toMatchObject({ created: 120, active: 0, available: 120 });
});

function createSharedScene(): {
  readonly scene: object;
} {
  const create = (): object => {
    const object = new Proxy({}, {
      get: (_target, property) => {
        if (property === 'input') return null;
        return (..._args: unknown[]) => object;
      },
    });
    return object;
  };
  return {
    scene: {
      add: {
        graphics: create,
        sprite: create,
        container: create,
      },
    },
  };
}
