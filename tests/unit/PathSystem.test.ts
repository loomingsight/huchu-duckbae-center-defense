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
    expect(path.positionAt(Number.NEGATIVE_INFINITY)).toEqual({ x: 0, y: 0 });
    expect(path.positionAt(Number.POSITIVE_INFINITY)).toEqual({ x: 100, y: 0 });
    expect(path.knockBack(20, 50)).toBe(0);
    expect(path.knockBack(90, -10)).toBe(90);
    expect(path.knockBack(Number.POSITIVE_INFINITY, 0)).toBe(100);
    expect(path.knockBack(50, Number.POSITIVE_INFINITY)).toBe(0);
    expect(path.knockBack(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(0);
    expect(path.knockBack(Number.NEGATIVE_INFINITY, 10)).toBe(0);
    expect(path.knockBack(50, Number.NEGATIVE_INFINITY)).toBe(50);
    expect(path.eta(10, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(path.eta(10, -1)).toBe(Number.POSITIVE_INFINITY);
    expect(path.eta(10, Number.NEGATIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it('음수 진행도는 첫 segment 방향으로만 연장하고 나머지는 clamp한다', () => {
    const path = new PathSystem([[10, 20], [10, 120], [110, 120]]);

    expect(path.positionAtExtended(-70)).toEqual({ x: 10, y: -50 });
    expect(path.positionAtExtended(0)).toEqual(path.positionAt(0));
    expect(path.positionAtExtended(150)).toEqual(path.positionAt(150));
    expect(path.positionAtExtended(1000)).toEqual({ x: 110, y: 120 });
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

  it('모든 waypoint와 인접 segment를 finite 양수 길이로 요구한다', () => {
    expect(() => new PathSystem([[Number.NaN, 0], [10, 0]])).toThrow(RangeError);
    expect(() => new PathSystem([[Number.POSITIVE_INFINITY, 0], [10, 0]])).toThrow(RangeError);
    expect(() => new PathSystem([[0, 0], [0, 0], [100, 0]])).toThrow(RangeError);
    expect(() => new PathSystem([
      [Number.MAX_VALUE, 0],
      [-Number.MAX_VALUE, 0],
    ])).toThrow(RangeError);
  });

  it('public 계산 입력의 NaN과 non-finite 좌표를 RangeError로 거부한다', () => {
    const path = new PathSystem([[0, 0], [100, 0]]);
    const invalidCalls: readonly (() => unknown)[] = [
      () => path.positionAt(Number.NaN),
      () => path.eta(Number.NaN, 10),
      () => path.eta(10, Number.NaN),
      () => path.knockBack(Number.NaN, 10),
      () => path.knockBack(10, Number.NaN),
      () => path.closestProgressTo({ x: Number.NaN, y: 0 }),
      () => path.closestProgressTo({ x: 0, y: Number.POSITIVE_INFINITY }),
      () => path.firstProgressWithinCircle({ x: Number.NaN, y: 0 }, 1),
      () => path.firstProgressWithinCircle({ x: 0, y: 0 }, Number.NaN),
    ];

    invalidCalls.forEach((call) => expect(call).toThrow(RangeError));
  });

  it('원 안에서 시작하거나 접할 때 첫 진입 진행도를 반환한다', () => {
    const path = new PathSystem([[0, 0], [100, 0]]);

    expect(path.firstProgressWithinCircle({ x: 10, y: 0 }, 20)).toBe(0);
    expect(path.firstProgressWithinCircle({ x: 50, y: 10 }, 10)).toBe(50);
    expect(path.firstProgressWithinCircle({ x: 50, y: 0 }, 0)).toBe(50);
  });

  it('부동소수점 상쇄가 생기는 비축 정렬 tangent도 접점으로 처리한다', () => {
    const path = new PathSystem([
      [0.15384615384615385, 1.7894736842105263],
      [9.11098901098901, 10.43492822966507],
    ]);

    expect(path.firstProgressWithinCircle(
      { x: -4.748507759926477, y: 9.075614962533702 },
      8.647058823529411,
    )).toBeCloseTo(path.length * 0.12312312312312312, 10);
  });

  it('가장 가까운 지점이 동률이면 먼저 만나는 진행도를 선택한다', () => {
    const path = new PathSystem([[0, 0], [10, 0], [0, 0]]);

    expect(path.closestProgressTo({ x: 5, y: 5 })).toBe(5);
  });

  it('부동소수점 오차 범위의 closest 동률에서도 먼저 만나는 진행도를 선택한다', () => {
    const start = { x: 0.07692307692307693, y: 0.8947368421052632 };
    const end = { x: 4.605494505494505, y: 5.267464114832535 };
    const path = new PathSystem([start, end, start]);

    expect(path.closestProgressTo({
      x: 2.5652173913043477,
      y: 2.310344827586207,
    })).toBeCloseTo(path.length / 2 * 0.4405515413928961, 12);
  });
});
