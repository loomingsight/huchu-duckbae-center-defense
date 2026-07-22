import { PlayerHealthSystem } from '../../src/game/player/PlayerHealthSystem';

describe('PlayerHealthSystem', () => {
  it('후추 HP는 유효 피해만 적용하고 0에서 멈춘다', () => {
    const health = new PlayerHealthSystem(1000, 900);

    expect(health.damage(120)).toEqual({ effectiveAmount: 120, hp: 780, lethal: false });
    expect(health.damage(1000)).toEqual({ effectiveAmount: 780, hp: 0, lethal: true });
    expect(health.damage(1)).toEqual({ effectiveAmount: 0, hp: 0, lethal: true });
  });

  it('0 이하 피해는 상태를 바꾸지 않는다', () => {
    const health = new PlayerHealthSystem(1000, 900);

    expect(health.damage(0)).toEqual({ effectiveAmount: 0, hp: 900, lethal: false });
    expect(health.damage(-20)).toEqual({ effectiveAmount: 0, hp: 900, lethal: false });
  });

  it('reset은 후추 HP를 최대값으로 되돌린다', () => {
    const health = new PlayerHealthSystem(1000, 1);

    health.reset();

    expect({ current: health.currentHp, maximum: health.maximumHp })
      .toEqual({ current: 1000, maximum: 1000 });
  });

  it.each([
    [0, 0],
    [-1, 0],
    [1.5, 1],
    [100, -1],
    [100, 101],
    [Number.NaN, 0],
    [100, Number.POSITIVE_INFINITY],
  ])('유효하지 않은 HP %s/%s를 거부한다', (maximum, initial) => {
    expect(() => new PlayerHealthSystem(maximum, initial)).toThrow(RangeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    '유효하지 않은 피해 %s를 상태 변경 전에 거부한다',
    (amount) => {
      const health = new PlayerHealthSystem(1000, 900);

      expect(() => health.damage(amount)).toThrow(RangeError);
      expect(health.currentHp).toBe(900);
    },
  );
});
