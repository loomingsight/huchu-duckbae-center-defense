import {
  NAV_CELL_SIZE,
  NAV_RECOMPUTE_INTERVAL_MS,
  NAV_TARGET_DISTANCE_PX,
  NavigationField,
} from '../../src/game/world/NavigationField';

describe('NavigationField', () => {
  it('18x32 공용 필드를 만들고 최대 5Hz로만 다시 계산한다', () => {
    const field = NavigationField.createDefault();

    expect(field.step(0, { x: 270, y: 480 })).toBe(true);
    expect(field.step(199, { x: 300, y: 480 })).toBe(false);
    expect(field.step(1, { x: 300, y: 480 })).toBe(true);
    expect(field.snapshot()).toEqual({
      columns: 18,
      rows: 32,
      revision: 2,
      recomputeCount: 2,
      targetCell: { x: 10, y: 16 },
    });
    expect(NAV_CELL_SIZE).toBe(30);
    expect(NAV_RECOMPUTE_INTERVAL_MS).toBe(200);
    expect(NAV_TARGET_DISTANCE_PX).toBe(15);
  });

  it('같은 셀에서 15px 미만 이동은 200ms 뒤에도 다시 계산하지 않는다', () => {
    const field = NavigationField.createDefault();
    field.step(0, { x: 271, y: 481 });

    expect(field.step(200, { x: 280, y: 481 })).toBe(false);
    expect(field.snapshot().recomputeCount).toBe(1);
    expect(field.step(0, { x: 287, y: 481 })).toBe(true);
    expect(field.snapshot().recomputeCount).toBe(2);
  });

  it('같은 입력은 결정적인 방향과 거리장을 만든다', () => {
    const left = NavigationField.createDefault();
    const right = NavigationField.createDefault();

    left.step(0, { x: 511, y: 901 });
    right.step(0, { x: 511, y: 901 });

    expect(left.directionFrom({ x: 110, y: 0 }))
      .toEqual(right.directionFrom({ x: 110, y: 0 }));
    expect(left.distanceFrom({ x: 110, y: 0 })).toBeGreaterThan(0);
    expect(left.snapshot()).toEqual(right.snapshot());
  });

  it('목표 셀에 도착하면 실제 후추 좌표로 마지막 연결 구간을 만든다', () => {
    const field = NavigationField.createDefault();
    field.step(0, { x: 511, y: 901 });
    const targetCell = field.snapshot().targetCell!;
    const targetCellCenter = {
      x: targetCell.x * NAV_CELL_SIZE + NAV_CELL_SIZE / 2,
      y: targetCell.y * NAV_CELL_SIZE + NAV_CELL_SIZE / 2,
    };

    const direction = field.directionFrom(targetCellCenter);
    const expectedLength = Math.hypot(511 - targetCellCenter.x, 901 - targetCellCenter.y);

    expect(direction.x).toBeCloseTo((511 - targetCellCenter.x) / expectedLength, 10);
    expect(direction.y).toBeCloseTo((901 - targetCellCenter.y) / expectedLength, 10);
  });

  it('단절된 통로에서는 후추를 향한 직접 이동으로 폴백한다', () => {
    const disconnected = new NavigationField({
      A: [[0, 0], [0, 120]],
      B: [[510, 840], [510, 930]],
    }, 540, 960, 30, { corridorRadius: 20, junctionRadius: 0 });
    disconnected.step(0, { x: 510, y: 900 });

    const fallback = disconnected.directionFrom({ x: 0, y: 30 });

    expect(fallback.x).toBeCloseTo(510 / Math.hypot(510, 870), 10);
    expect(fallback.y).toBeCloseTo(870 / Math.hypot(510, 870), 10);
    expect(disconnected.distanceFrom({ x: 0, y: 30 }))
      .toBeCloseTo(Math.hypot(510, 870), 10);
  });

  it('맵 밖 좌표도 유한한 방향으로 복구하고 reset은 필드를 비운다', () => {
    const field = NavigationField.createDefault();
    field.step(0, { x: 270, y: 480 });

    expect(field.directionFrom({ x: -100, y: -100 }))
      .toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));

    field.reset();

    expect(field.snapshot()).toMatchObject({ revision: 0, recomputeCount: 0, targetCell: null });
    expect(field.directionFrom({ x: 10, y: 20 })).toEqual({ x: 0, y: 0 });
    expect(field.distanceFrom({ x: 10, y: 20 })).toBe(Number.POSITIVE_INFINITY);
  });

  it.each([
    () => new NavigationField({}, 540, 960, 30),
    () => new NavigationField({ A: [[0, 0], [1, 1]] }, 0, 960, 30),
    () => new NavigationField({ A: [[0, 0], [1, 1]] }, 540, 960, -1),
    () => new NavigationField({ A: [[0, 0], [Number.NaN, 1]] }, 540, 960, 30),
  ])('유효하지 않은 격자 계약을 거부한다', (create) => {
    expect(create).toThrow(RangeError);
  });

  it.each([
    () => NavigationField.createDefault().step(-1, { x: 0, y: 0 }),
    () => NavigationField.createDefault().step(0, { x: Number.NaN, y: 0 }),
    () => NavigationField.createDefault().directionFrom({ x: 0, y: Number.POSITIVE_INFINITY }),
    () => NavigationField.createDefault().distanceFrom({ x: Number.NaN, y: 0 }),
  ])('유효하지 않은 public 입력을 거부한다', (call) => {
    expect(call).toThrow(RangeError);
  });
});
