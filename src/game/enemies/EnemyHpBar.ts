export const ENEMY_HP_BAR_WIDTH = 30;
export const ENEMY_HP_BAR_HEIGHT = 4;
export const ENEMY_HP_BAR_BACKGROUND_COLOR = 0x2a241f;
export const ENEMY_HP_BAR_BACKGROUND_ALPHA = 0.75;

export function enemyHpRatio(current: number, max: number): number {
  if (
    !Number.isFinite(current)
    || !Number.isFinite(max)
    || current < 0
    || max <= 0
    || current > max
  ) {
    throw new RangeError('Enemy HP requires 0 <= current <= finite positive max');
  }
  return current / max;
}

export function enemyHpColor(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new RangeError('Enemy HP ratio must be finite from 0 to 1');
  }
  return ratio > 0.5 ? 0x39a852 : ratio >= 0.2 ? 0xf2ca45 : 0xd94b43;
}

export interface EnemyHpBarSnapshot {
  readonly currentHp: number;
  readonly maxHp: number;
  readonly hpRatio: number;
  readonly hpColor: number;
}

export interface EnemyHpPresentation extends EnemyHpBarSnapshot {
  readonly hpStep: number;
  readonly fillVisible: boolean;
}

export function enemyHpStep(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new RangeError('Enemy HP ratio must be finite from 0 to 1');
  }
  if (ratio === 0) return 0;
  const rounded = Math.round(ENEMY_HP_BAR_WIDTH * ratio);
  if (ratio < 0.2) return Math.min(5, Math.max(1, rounded));
  if (ratio <= 0.5) return Math.min(15, Math.max(6, rounded));
  return Math.min(ENEMY_HP_BAR_WIDTH, Math.max(16, rounded));
}

export function enemyHpStepColor(step: number): number {
  if (!Number.isSafeInteger(step) || step < 0 || step > ENEMY_HP_BAR_WIDTH) {
    throw new RangeError('Enemy HP step must be a safe integer from 0 to 30');
  }
  return step >= 16 ? 0x39a852 : step >= 6 ? 0xf2ca45 : 0xd94b43;
}

export function enemyHpPresentation(currentHp: number, maxHp: number): EnemyHpPresentation {
  const hpRatio = enemyHpRatio(currentHp, maxHp);
  return {
    currentHp,
    maxHp,
    hpRatio,
    hpColor: enemyHpColor(hpRatio),
    hpStep: enemyHpStep(hpRatio),
    fillVisible: currentHp > 0,
  };
}
