import { describe, expect, it } from 'vitest';
import {
  GAME_TITLE,
  HUCHU_PRESENTATION,
  clampDevicePixelRatio,
} from '../../src/game/presentation/PresentationConfig';

describe('HUCHU_PRESENTATION', () => {
  it('V2 논리 viewport와 actor 실루엣 기준을 exact하게 고정한다', () => {
    expect(GAME_TITLE).toBe('후추덕배 디펜스');
    expect(HUCHU_PRESENTATION).toEqual({
      logicalWidth: 540,
      logicalHeight: 960,
      maxDevicePixelRatio: 2,
      opaqueHeightLogical: 72,
      dogOpaqueHeightLogical: 72,
      regularEnemyOpaqueHeightLogical: 84,
      bossOpaqueHeightLogical: 100,
      truckDisplayLogical: { width: 142, height: 86 },
      shelterOpaqueHeightLogical: 100,
    });
  });

  it('유한한 DPR은 1..2로 clamp하고 비유한 값은 1로 복구한다', () => {
    expect(clampDevicePixelRatio(0.5)).toBe(1);
    expect(clampDevicePixelRatio(1.5)).toBe(1.5);
    expect(clampDevicePixelRatio(3)).toBe(2);
    expect(clampDevicePixelRatio(Number.NaN)).toBe(1);
    expect(clampDevicePixelRatio(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampDevicePixelRatio(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});
