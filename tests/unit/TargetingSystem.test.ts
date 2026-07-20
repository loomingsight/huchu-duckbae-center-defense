import {
  inCone,
  rankHighestHpTargets,
  rankThreatTargets,
  selectThreatTarget,
} from '../../src/game/combat/TargetingSystem';
import { enemy } from './fixtures';

describe('TargetingSystem', () => {
  it('ETA -> attacking -> boss -> distance -> spawnSequence 순으로 위협 대상을 정렬한다', () => {
    const origin = { x: 0, y: 0 };
    const candidates = [
      enemy({ id: 6, etaMs: 500, position: { x: 20, y: 0 }, spawnSequence: 1 }),
      enemy({ id: 3, etaMs: 500, state: 'moving', isBoss: true, position: { x: 100, y: 0 } }),
      enemy({ id: 5, etaMs: 500, position: { x: 20, y: 0 }, spawnSequence: 0 }),
      enemy({ id: 2, etaMs: 500, state: 'windup', isBoss: false, position: { x: 100, y: 0 } }),
      enemy({ id: 4, etaMs: 500, position: { x: 10, y: 0 }, spawnSequence: 9 }),
      enemy({ id: 1, etaMs: 400, position: { x: 150, y: 0 } }),
    ];

    expect(rankThreatTargets(origin, candidates, 216).map(({ enemy: target }) => target.id))
      .toEqual([1, 2, 3, 4, 5, 6]);
    expect(selectThreatTarget(origin, candidates, 216)?.id).toBe(1);
  });

  it('아쿠아빔 표적은 최고 HP 뒤 boss와 보호소 위협도로 동률을 푼다', () => {
    const ranked = rankHighestHpTargets({ x: 0, y: 0 }, [
      enemy({ id: 1, currentHp: 200, isBoss: false, etaMs: 100 }),
      enemy({ id: 2, currentHp: 200, isBoss: true, etaMs: 500 }),
      enemy({ id: 3, currentHp: 150, isBoss: true, etaMs: 10 }),
    ]);

    expect(ranked.map(({ enemy: target }) => target.id)).toEqual([2, 1, 3]);
  });

  it('최고 HP와 boss가 같으면 threat 순위 전체로 동률을 푼다', () => {
    const ranked = rankHighestHpTargets({ x: 0, y: 0 }, [
      enemy({ id: 4, currentHp: 100, etaMs: 500, state: 'moving', position: { x: 10, y: 0 } }),
      enemy({ id: 3, currentHp: 100, etaMs: 500, state: 'holding', position: { x: 100, y: 0 } }),
      enemy({ id: 2, currentHp: 100, etaMs: 400, state: 'moving', position: { x: 200, y: 0 } }),
    ]);

    expect(ranked.map(({ enemy: target }) => target.id)).toEqual([2, 3, 4]);
  });

  it('사거리 경계를 포함하고 밖의 적과 dead 적은 제외한다', () => {
    const origin = { x: 0, y: 0 };

    expect(rankThreatTargets(origin, [
      enemy({ id: 1, position: { x: 216, y: 0 } }),
      enemy({ id: 2, position: { x: 216.000_001, y: 0 } }),
      enemy({ id: 3, position: { x: 1, y: 0 }, state: 'dead', currentHp: 0 }),
    ], 216).map(({ enemy: target }) => target.id)).toEqual([1]);
  });

  it('120도 cone과 3H radius 경계를 epsilon 포함으로 판정한다', () => {
    const origin = { x: 0, y: 0 };
    const direction = { x: 1, y: 0 };

    expect(inCone(origin, direction, { x: 108, y: 187.061487 }, 216, 120)).toBe(true);
    expect(inCone(origin, direction, { x: 108, y: -187.061487 }, 216, 120)).toBe(true);
    expect(inCone(origin, direction, { x: 107.999, y: 187.061487 }, 216, 120)).toBe(false);
    expect(inCone(origin, direction, { x: 216.001, y: 0 }, 216, 120)).toBe(false);
  });

  it('원본 배열과 enemy object 및 중첩 position을 변경하지 않는다', () => {
    const first = enemy({ id: 2, etaMs: 20, position: { x: 2, y: 0 } });
    const second = enemy({ id: 1, etaMs: 10, position: { x: 1, y: 0 } });
    const candidates = [first, second];
    const original = candidates.map((item) => ({ ...item, position: { ...item.position } }));

    rankThreatTargets({ x: 0, y: 0 }, candidates, 10);
    rankHighestHpTargets({ x: 0, y: 0 }, candidates);

    expect(candidates).toEqual(original);
    expect(candidates[0]).toBe(first);
    expect(candidates[1]).toBe(second);
  });

  it.each([
    [{ x: Number.NaN, y: 0 }, [], 216],
    [{ x: 0, y: 0 }, [], -1],
    [{ x: 0, y: 0 }, [enemy({ currentHp: Number.NaN })], 216],
    [{ x: 0, y: 0 }, [enemy({ etaMs: -1 })], 216],
    [{ x: 0, y: 0 }, [enemy({ state: 'unknown' as never })], 216],
  ] as const)('invalid targeting input은 state 변경 전에 fail-fast한다', (origin, candidates, range) => {
    expect(() => rankThreatTargets(origin, candidates, range)).toThrow(RangeError);
  });
});
