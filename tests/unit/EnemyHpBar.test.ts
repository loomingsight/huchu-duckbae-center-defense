import { describe, expect, it } from 'vitest';
import {
  ENEMY_HP_BAR_BACKGROUND_ALPHA,
  ENEMY_HP_BAR_BACKGROUND_COLOR,
  ENEMY_HP_BAR_HEIGHT,
  ENEMY_HP_BAR_WIDTH,
  enemyHpColor,
  enemyHpPresentation,
  enemyHpStep,
  enemyHpStepColor,
} from '../../src/game/enemies/EnemyHpBar';

describe('EnemyHpBar presentation model', () => {
  it.each([
    [0, 0],
    [Number.EPSILON, 1],
    [0.2 - Number.EPSILON, 5],
    [0.2, 6],
    [0.5, 15],
    [0.5 + Number.EPSILON, 16],
    [1, 30],
  ] as const)('ratio %s를 threshold-safe step %s로 양자화한다', (ratio, expected) => {
    const step = enemyHpStep(ratio);

    expect(step).toBe(expected);
    expect(Math.abs(step - ENEMY_HP_BAR_WIDTH * ratio)).toBeLessThan(1);
  });

  it.each([
    [0, 0xd94b43],
    [1, 0xd94b43],
    [5, 0xd94b43],
    [6, 0xf2ca45],
    [15, 0xf2ca45],
    [16, 0x39a852],
    [30, 0x39a852],
  ] as const)('step %s는 exact HP threshold 색 %s를 사용한다', (step, expected) => {
    expect(enemyHpStepColor(step)).toBe(expected);
  });

  it.each([
    [0, 60, 0, 0xd94b43, 0, false],
    [12, 60, 0.2, 0xf2ca45, 6, true],
    [30, 60, 0.5, 0xf2ca45, 15, true],
    [31, 60, 31 / 60, 0x39a852, 16, true],
    [60, 60, 1, 0x39a852, 30, true],
  ] as const)(
    '%s/%s snapshot은 exact ratio/color와 raster step을 함께 보존한다',
    (currentHp, maxHp, hpRatio, hpColor, hpStep, fillVisible) => {
      expect(enemyHpPresentation(currentHp, maxHp)).toEqual({
        currentHp,
        maxHp,
        hpRatio,
        hpColor,
        hpStep,
        fillVisible,
      });
      expect(enemyHpColor(hpRatio)).toBe(hpColor);
    },
  );

  it('HP geometry와 background tint/alpha 계약을 유지한다', () => {
    expect({
      width: ENEMY_HP_BAR_WIDTH,
      height: ENEMY_HP_BAR_HEIGHT,
      tint: ENEMY_HP_BAR_BACKGROUND_COLOR,
      alpha: ENEMY_HP_BAR_BACKGROUND_ALPHA,
    }).toEqual({ width: 30, height: 4, tint: 0x2a241f, alpha: 0.75 });
  });

  it.each([-1, 1 + Number.EPSILON, Number.NaN, Number.POSITIVE_INFINITY])(
    '유효하지 않은 ratio %s는 거부한다',
    (ratio) => {
      expect(() => enemyHpStep(ratio)).toThrow(/ratio/i);
    },
  );
});
