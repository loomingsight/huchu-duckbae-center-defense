import { describe, expect, it } from 'vitest';
import { PATH_DEFINITIONS } from '../../src/game/data/pathDefinitions';
import { distance } from '../../src/game/world/Geometry';
import { PathSystem } from '../../src/game/world/PathSystem';

describe('PathSystem', () => {
  it('진행도를 경로 위치와 남은 보호소 도달 시간으로 바꾼다', () => {
    const path = new PathSystem(PATH_DEFINITIONS.P1);

    expect(path.positionAt(0)).toEqual({ x: 110, y: 0 });
    expect(path.positionAt(path.length)).toEqual({ x: 270, y: 430 });
    expect(path.eta(path.length - 44, 44)).toBeCloseTo(1, 5);

    const attackProgress = path.firstProgressWithinCircle({ x: 270, y: 480 }, 38 + 48);
    expect(distance(path.positionAt(attackProgress), { x: 270, y: 480 })).toBeCloseTo(86, 5);
    expect(new PathSystem([[0, 0], [100, 0]]).closestProgressTo({ x: 60, y: 20 })).toBe(60);
  });

  it('진행도와 넉백을 경로 범위 안으로 제한한다', () => {
    const path = new PathSystem([[0, 0], [100, 0]]);

    expect(path.positionAt(-20)).toEqual({ x: 0, y: 0 });
    expect(path.positionAt(120)).toEqual({ x: 100, y: 0 });
    expect(path.knockBack(20, 50)).toBe(0);
    expect(path.knockBack(90, -10)).toBe(90);
    expect(path.eta(10, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('유효하지 않은 경로와 원을 거부한다', () => {
    expect(() => new PathSystem([[0, 0]])).toThrow('at least two waypoints');
    expect(() => new PathSystem([[0, 0], [0, 0]])).toThrow('non-zero length');

    const path = new PathSystem([[0, 0], [100, 0]]);
    expect(() => path.firstProgressWithinCircle({ x: 0, y: 0 }, -1)).toThrow(
      'Circle radius must be non-negative',
    );
    expect(() => path.firstProgressWithinCircle({ x: 0, y: 100 }, 10)).toThrow(
      'Path never enters circle',
    );
  });
});
