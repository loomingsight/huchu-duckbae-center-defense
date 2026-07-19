import {
  rankThreatTargets,
  selectThreatTarget,
} from '../../src/game/combat/TargetingSystem';
import { enemy } from './fixtures';

describe('TargetingSystem', () => {
  it('ETA -> player distance -> boss -> spawnSequence -> id 순으로 대상을 고른다', () => {
    const player = { x: 200, y: 200 };
    const candidates = [
      enemy({ id: 8, etaMs: 500, position: { x: 230, y: 200 }, isBoss: false, spawnSequence: 1 }),
      enemy({ id: 7, etaMs: 500, position: { x: 230, y: 200 }, isBoss: false, spawnSequence: 1 }),
      enemy({ id: 6, etaMs: 500, position: { x: 230, y: 200 }, isBoss: true, spawnSequence: 2 }),
      enemy({ id: 5, etaMs: 400, position: { x: 340, y: 200 }, isBoss: false, spawnSequence: 0 }),
    ];

    expect(rankThreatTargets(player, candidates, 150).map(({ id }) => id)).toEqual([5, 6, 7, 8]);
    expect(selectThreatTarget(player, candidates, 150)?.id).toBe(5);
  });

  it('사거리 경계는 포함하고 밖의 적과 dead 적은 제외한다', () => {
    const player = { x: 0, y: 0 };

    expect(rankThreatTargets(player, [
      enemy({ id: 1, position: { x: 150, y: 0 } }),
      enemy({ id: 2, position: { x: 150.000_001, y: 0 } }),
      enemy({ id: 3, position: { x: 1, y: 0 }, state: 'dead', currentHp: 0 }),
    ], 150).map(({ id }) => id)).toEqual([1]);
    expect(selectThreatTarget(player, [enemy({ position: { x: 151, y: 0 } })], 150))
      .toBeUndefined();
  });

  it('원본 배열과 enemy object 및 중첩 position을 변경하지 않는다', () => {
    const first = enemy({ id: 2, etaMs: 20, position: { x: 2, y: 0 } });
    const second = enemy({ id: 1, etaMs: 10, position: { x: 1, y: 0 } });
    const candidates = [first, second];
    const originalOrder = [...candidates];
    const originalSnapshots = candidates.map((item) => ({ ...item, position: { ...item.position } }));

    const ranked = rankThreatTargets({ x: 0, y: 0 }, candidates, 10);

    expect(ranked.map(({ id }) => id)).toEqual([1, 2]);
    expect(candidates).toEqual(originalOrder);
    expect(candidates).toEqual(originalSnapshots);
    expect(candidates[0]).toBe(first);
    expect(candidates[1]).toBe(second);
  });

  it('+Infinity 기본 range는 전장 전체 정렬 sentinel로 허용한다', () => {
    const candidates = [
      enemy({ id: 2, etaMs: 20, position: { x: 2_000, y: 0 } }),
      enemy({ id: 1, etaMs: 10, position: { x: 1_000, y: 0 } }),
    ];

    expect(rankThreatTargets({ x: 0, y: 0 }, candidates).map(({ id }) => id)).toEqual([1, 2]);
    expect(selectThreatTarget({ x: 0, y: 0 }, candidates)?.id).toBe(1);
  });

  it.each([
    [{ x: Number.NaN, y: 0 }, [], 150, 'player'],
    [{ x: 0, y: Number.POSITIVE_INFINITY }, [], 150, 'player'],
    [{ x: 0, y: 0 }, [], -1, 'range'],
    [{ x: 0, y: 0 }, [], Number.NaN, 'range'],
    [{ x: 0, y: 0 }, [], Number.NEGATIVE_INFINITY, 'range'],
    [{ x: 0, y: 0 }, [], '150' as never, 'range'],
  ] as const)('invalid %s/%s/%s는 %s 검증에서 fail-fast한다', (player, candidates, range, _label) => {
    expect(() => rankThreatTargets(player, candidates, range)).toThrow(RangeError);
  });

  it.each([
    enemy({ id: -1 }),
    enemy({ id: 1.5 }),
    enemy({ position: { x: Number.NaN, y: 0 } }),
    enemy({ etaMs: Number.POSITIVE_INFINITY }),
    enemy({ etaMs: -1 }),
    enemy({ spawnSequence: Number.NaN }),
    enemy({ spawnSequence: -1 }),
    enemy({ isBoss: 1 as never }),
    enemy({ state: 'unknown' as never }),
  ])('invalid enemy numeric/state input을 정렬 전에 거부한다', (invalidEnemy) => {
    expect(() => rankThreatTargets({ x: 0, y: 0 }, [invalidEnemy], 150)).toThrow(RangeError);
  });
});
