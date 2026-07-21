import { CompanionSystem } from '../../src/game/companions/CompanionSystem';
import { enemy } from './fixtures';

describe('CompanionSystem', () => {
  it('덕배는 대상 없이는 cadence를 소비하지 않고 250ms 판정 뒤 후추 위치에서 공격한다', () => {
    const companion = new CompanionSystem();

    expect(companion.step(5000, { player: { x: 270, y: 600 }, enemies: [] })).toEqual([]);
    expect(companion.step(0, {
      player: { x: 270, y: 600 },
      enemies: [enemy({ id: 9, position: { x: 270, y: 500 } })],
    }).at(0)).toMatchObject({
      type: 'companionAttackStarted', castId: 'deokbae:1', companion: 'deokbae', targetId: 9,
    });
    expect(companion.step(250, {
      player: { x: 280, y: 610 },
      enemies: [enemy({ id: 9, position: { x: 270, y: 500 } })],
    }).at(0)).toMatchObject({
      type: 'companionAttack', castId: 'deokbae:1', companion: 'deokbae',
      origin: { x: 280, y: 610 }, targetId: 9, targetPosition: { x: 270, y: 500 },
    });
    expect(companion.snapshot()).toEqual({
      companion: 'deokbae', active: true, cooldownRemainingMs: 750,
    });
  });

  it('locked target이 죽으면 impact 시점 위협 대상으로 한 번만 retarget한다', () => {
    const companion = new CompanionSystem();
    companion.step(0, {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, etaMs: 10, position: { x: 100, y: 0 } })],
    });

    expect(companion.step(250, {
      player: { x: 10, y: 20 },
      enemies: [
        enemy({ id: 1, state: 'dead', currentHp: 0, position: { x: 100, y: 0 } }),
        enemy({ id: 2, etaMs: 50, position: { x: 10, y: 120 } }),
        enemy({ id: 3, etaMs: 100, position: { x: 20, y: 20 } }),
      ],
    })).toEqual([{
      type: 'companionAttack', castId: 'deokbae:1', companion: 'deokbae',
      origin: { x: 10, y: 20 }, targetId: 2, targetPosition: { x: 10, y: 120 },
    }]);
  });

  it('1000ms cadence와 reset 뒤 cast sequence를 결정적으로 재현한다', () => {
    const companion = new CompanionSystem();
    const context = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 100, y: 0 } })],
    };

    companion.step(0, context);
    companion.step(250, context);
    expect(companion.step(749, context)).toEqual([]);
    expect(companion.step(1, context)).toEqual([{
      type: 'companionAttackStarted', castId: 'deokbae:2', companion: 'deokbae', targetId: 1,
    }]);

    companion.reset();
    expect(companion.snapshot()).toEqual({
      companion: 'deokbae', active: true, cooldownRemainingMs: 0,
    });
    expect(companion.step(0, context).at(0)).toMatchObject({ castId: 'deokbae:1' });
  });

  it('cooldown 중에는 다음 attack이 ready가 될 때까지 target ranking을 수행하지 않는다', () => {
    const companion = new CompanionSystem();
    const context = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 100, y: 0 } })],
    };
    companion.step(250, context);
    const unreadableEnemies = new Proxy([] as ReturnType<typeof enemy>[], {
      get: () => { throw new Error('cooldown enemies were read'); },
    });

    expect(() => companion.step(100, {
      player: context.player,
      enemies: unreadableEnemies,
    })).not.toThrow();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'invalid stepMs %s는 state 변경 전에 거부한다',
    (stepMs) => {
      const companion = new CompanionSystem();
      const before = companion.snapshot();

      expect(() => companion.step(stepMs, { player: { x: 0, y: 0 }, enemies: [] }))
        .toThrow(RangeError);
      expect(companion.snapshot()).toEqual(before);
    },
  );
});
