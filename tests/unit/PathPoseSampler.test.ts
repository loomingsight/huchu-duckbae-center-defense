import { describe, expect, it } from 'vitest';
import {
  PATH_DEFINITIONS,
  TRADER_SIDE_BY_PATH,
} from '../../src/game/data/pathDefinitions';
import { PathPoseSampler } from '../../src/game/world/PathPoseSampler';
import { PathSystem } from '../../src/game/world/PathSystem';

describe('PathPoseSampler', () => {
  it('core extended position을 그대로 사용해 -70 pre-entry를 계산한다', () => {
    const points = PATH_DEFINITIONS.P1;
    const path = new PathSystem(points);
    const sampler = new PathPoseSampler(points);

    expect(sampler.sampleExtended(-70).position).toEqual(path.positionAtExtended(-70));
  });

  it('corner tangent를 거리 앞뒤 8px의 centered sample로 정규화한다', () => {
    const sampler = new PathPoseSampler([[10, 20], [110, 20], [110, 120]]);

    expect(sampler.sampleExtended(-70).position).toEqual({ x: -60, y: 20 });
    const corner = sampler.sampleExtended(100);

    expect(corner.tangent.x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(corner.tangent.y).toBeCloseTo(Math.SQRT1_2, 10);
    expect(corner.normal.x).toBeCloseTo(-Math.SQRT1_2, 10);
    expect(corner.normal.y).toBeCloseTo(Math.SQRT1_2, 10);
    expect(corner.headingRad).toBeCloseTo(Math.PI / 4, 10);
  });

  it('P1~P6 trader side와 -70 truck offset을 고정한다', () => {
    expect(TRADER_SIDE_BY_PATH).toEqual({
      P1: -1,
      P2: 1,
      P3: -1,
      P4: 1,
      P5: -1,
      P6: 1,
    });

    Object.entries(PATH_DEFINITIONS).forEach(([id, points]) => {
      const pose = new PathPoseSampler(points).sampleExtended(-70);
      const side = TRADER_SIDE_BY_PATH[id as keyof typeof TRADER_SIDE_BY_PATH];
      const truckPosition = {
        x: pose.position.x + pose.normal.x * side * 28,
        y: pose.position.y + pose.normal.y * side * 28,
      };

      expect(Number.isFinite(truckPosition.x)).toBe(true);
      expect(Number.isFinite(truckPosition.y)).toBe(true);
    });
  });

  it('centered sample이 끝점에서 겹치면 마지막 16px 방향으로 fallback한다', () => {
    const points = [[0, 0], [100, 0], [100, 100]] as const;
    const path = new PathSystem(points);
    const sampler = new PathPoseSampler(points);

    const afterEnd = sampler.sampleExtended(path.length + 70);

    expect(afterEnd.position).toEqual(path.positionAtExtended(path.length + 70));
    expect(afterEnd.tangent).toEqual({ x: 0, y: 1 });
    expect(afterEnd.normal).toEqual({ x: -1, y: 0 });
    expect(afterEnd.headingRad).toBeCloseTo(Math.PI / 2, 10);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('non-finite distance %s를 RangeError로 거부한다', (distancePx) => {
    const sampler = new PathPoseSampler([[0, 0], [100, 0]]);

    expect(() => sampler.sampleExtended(distancePx)).toThrow(RangeError);
    expect(() => sampler.sampleExtended(distancePx)).toThrow('distancePx must be finite');
  });
});
